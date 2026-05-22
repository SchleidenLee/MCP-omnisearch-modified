import { ProviderRegistry, ProviderCategory } from './provider-registry.js';
import { CooldownManager } from './cooldown-manager.js';
import { ProviderUsageTracker } from './provider-usage-tracker.js';
import { CallbackRegistry } from './provider-callbacks.js';
import { ProviderSelector } from './provider-selector.js';

const cooldown_manager = new CooldownManager();
const usage_tracker = new ProviderUsageTracker();
const callback_registry = new CallbackRegistry();

const search_registry = new ProviderRegistry<any>();
const ai_response_registry = new ProviderRegistry<any>();
const processing_registry = new ProviderRegistry<any>();

const search_selector = new ProviderSelector(search_registry, usage_tracker, cooldown_manager);
const ai_response_selector = new ProviderSelector(ai_response_registry, usage_tracker, cooldown_manager);
const processing_selector = new ProviderSelector(processing_registry, usage_tracker, cooldown_manager);

export const get_cooldown_manager = () => cooldown_manager;
export const get_usage_tracker = () => usage_tracker;
export const get_callback_registry = () => callback_registry;

export const get_registry_for_category = (category: ProviderCategory): ProviderRegistry<any> => {
	switch (category) {
		case 'search':
			return search_registry;
		case 'ai_response':
			return ai_response_registry;
		case 'processing':
			return processing_registry;
	}
};

export const get_selector_for_category = (category: ProviderCategory): ProviderSelector => {
	switch (category) {
		case 'search':
			return search_selector;
		case 'ai_response':
			return ai_response_selector;
		case 'processing':
			return processing_selector;
	}
};

export const get_search_registry = () => search_registry;
export const get_ai_response_registry = () => ai_response_registry;
export const get_processing_registry = () => processing_registry;

export const reset_global_services = () => {
	cooldown_manager.getAllStatus();
	for (const key of Object.keys(cooldown_manager.getAllStatus())) {
		cooldown_manager.clearCooldown(key);
	}
	usage_tracker.reset();
	search_selector.reset();
	ai_response_selector.reset();
	processing_selector.reset();
};
