import {
	API_PRIORITY_CONFIG,
	COOLDOWN_CONFIG,
	WEIGHT_CONFIG,
} from './env.js';
import type { CooldownConfig } from '../server/provider-registry.js';

interface PriorityConfig {
	[category: string]: {
		[providerId: string]: number;
	};
}

interface WeightConfig {
	[providerId: string]: number;
}

interface CooldownConfigMap {
	[providerId: string]: CooldownConfig;
}

const parseJsonEnv = <T>(envValue: string | undefined, fallback: T): T => {
	if (!envValue) return fallback;
	try {
		return JSON.parse(envValue) as T;
	} catch {
		console.error(
			`[provider-config] Failed to parse JSON config: ${envValue.substring(0, 100)}...`,
		);
		return fallback;
	}
};

export const get_priority_config = (): PriorityConfig => {
	return parseJsonEnv<PriorityConfig>(API_PRIORITY_CONFIG, {});
};

export const get_cooldown_config = (): CooldownConfigMap => {
	return parseJsonEnv<CooldownConfigMap>(COOLDOWN_CONFIG, {});
};

export const get_weight_config = (): WeightConfig => {
	return parseJsonEnv<WeightConfig>(WEIGHT_CONFIG, {});
};

export const get_provider_priority = (
	category: string,
	providerId: string,
): number | undefined => {
	const config = get_priority_config();
	return config[category]?.[providerId];
};

export const get_provider_weight = (providerId: string): number => {
	const config = get_weight_config();
	return config[providerId] ?? 1;
};

export const get_provider_cooldown_config = (
	providerId: string,
): CooldownConfig | undefined => {
	const config = get_cooldown_config();
	return config[providerId];
};
