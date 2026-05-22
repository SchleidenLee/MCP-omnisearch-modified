import { ProviderRegistry, ProviderCategory } from './provider-registry.js';
import { CooldownManager } from './cooldown-manager.js';
import { ProviderUsageTracker } from './provider-usage-tracker.js';
import { CallbackRegistry, ProviderEvent } from './provider-callbacks.js';
import { classify_error, is_quota_exceeded, is_rate_limited } from '../common/error-mapping.js';
import { get_provider_cooldown_config, get_provider_priority, get_provider_weight } from '../config/provider-config.js';
import { ENABLE_CALLBACKS } from '../config/env.js';

interface FallbackExecutorOptions {
	category: ProviderCategory;
	toolName: string;
	registry: ProviderRegistry<any>;
	cooldownManager: CooldownManager;
	usageTracker: ProviderUsageTracker;
	callbackRegistry: CallbackRegistry;
	getProviderId: (candidateId: string) => string;
}

export async function execute_with_fallback<T>(
	candidateIds: string[],
	executor: (providerInstance: any, providerId: string) => Promise<T>,
	options: FallbackExecutorOptions,
): Promise<T> {
	const { category, toolName, registry, cooldownManager, usageTracker, callbackRegistry } = options;
	const errors: Array<{ providerId: string; error: unknown }> = [];

	for (const candidateId of candidateIds) {
		const providerId = options.getProviderId(candidateId);

		if (cooldownManager.isInCooldown(providerId)) {
			continue;
		}

		await emit_callback_event(callbackRegistry, {
			type: 'before_call',
			providerId,
			category,
			toolName,
			timestamp: Date.now(),
		});

		const startTime = Date.now();

		try {
			const instance = registry.require(providerId, toolName);
			const result = await executor(instance, providerId);

			const duration = Date.now() - startTime;
			usageTracker.recordCall(providerId, true, duration);

			await emit_callback_event(callbackRegistry, {
				type: 'after_call',
				providerId,
				category,
				toolName,
				timestamp: Date.now(),
				success: true,
			});

			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			usageTracker.recordCall(providerId, false, duration);
			errors.push({ providerId, error });

			const errorType = classify_error(providerId, error);

			if (errorType === 'quota_exceeded') {
				const cdConfig = get_provider_cooldown_config(providerId);
				if (cdConfig?.type === 'monthly') {
					cooldownManager.setMonthlyCooldown(providerId, 'quota_exceeded');
				} else {
					cooldownManager.setMonthlyCooldown(providerId, 'quota_exceeded');
				}
			} else if (errorType === 'rate_limited') {
				cooldownManager.setCooldown(providerId, 60000, 'rate_limited');
			} else if (errorType === 'server_error') {
				cooldownManager.setCooldown(providerId, 30000, 'server_error');
			}

			await emit_callback_event(callbackRegistry, {
				type: 'error',
				providerId,
				category,
				toolName,
				timestamp: Date.now(),
				success: false,
				error: error instanceof Error ? error : new Error(String(error)),
				metadata: { errorType },
			});
		}
	}

	if (errors.length === 1) {
		throw errors[0].error;
	}

	const errorSummary = errors
		.map((e) => `${e.providerId}: ${e.error instanceof Error ? e.error.message : String(e.error)}`)
		.join('; ');

	throw new Error(`All providers failed: ${errorSummary}`);
}

async function emit_callback_event(
	registry: CallbackRegistry,
	event: ProviderEvent,
): Promise<void> {
	if (!ENABLE_CALLBACKS) return;
	try {
		await registry.emit(event);
	} catch {
		// callback errors are already logged in CallbackRegistry
	}
}
