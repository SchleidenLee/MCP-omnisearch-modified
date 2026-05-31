import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import { CooldownManager } from './cooldown-manager.js';
import { ProviderUsageTracker } from './provider-usage-tracker.js';
import { ProviderRegistry } from './provider-registry.js';
import { CallbackRegistry } from './provider-callbacks.js';

let cooldown_manager: CooldownManager | null = null;
let usage_tracker: ProviderUsageTracker | null = null;
let provider_registry: ProviderRegistry<any> | null = null;
let callback_registry: CallbackRegistry | null = null;

export const set_debug_dependencies = (deps: {
	cooldownManager: CooldownManager;
	usageTracker: ProviderUsageTracker;
	providerRegistry: ProviderRegistry<any>;
	callbackRegistry: CallbackRegistry;
}) => {
	cooldown_manager = deps.cooldownManager;
	usage_tracker = deps.usageTracker;
	provider_registry = deps.providerRegistry;
	callback_registry = deps.callbackRegistry;
};

export const setup_debug_endpoints = (server: McpServer<GenericSchema>) => {
	server.resource(
		{
			name: 'Provider Status',
			description: 'Current status of all providers including cooldowns and stats',
			uri: 'omnisearch://status/providers',
		},
		async () => {
			if (!cooldown_manager || !usage_tracker || !provider_registry) {
				return {
					contents: [
						{
							uri: 'omnisearch://status/providers',
							mimeType: 'application/json',
							text: JSON.stringify({ error: 'Debug dependencies not initialized' }, null, 2),
						},
					],
				};
			}

			const status = {
				cooldowns: cooldown_manager.getAllStatus(),
				stats: usage_tracker.getAllStats(),
				available: provider_registry.ids(),
				callbacks_registered: callback_registry?.size ?? 0,
			};

			return {
				contents: [
					{
						uri: 'omnisearch://status/providers',
						mimeType: 'application/json',
						text: JSON.stringify(status, null, 2),
					},
				],
			};
		},
	);
};
