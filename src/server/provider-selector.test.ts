import { describe, expect, it, beforeEach } from 'vitest';
import { ProviderSelector } from './provider-selector.js';
import { ProviderRegistry } from './provider-registry.js';
import { CooldownManager } from './cooldown-manager.js';
import { ProviderUsageTracker } from './provider-usage-tracker.js';

describe('ProviderSelector', () => {
	let selector: ProviderSelector;
	let registry: ProviderRegistry<any>;
	let tracker: ProviderUsageTracker;
	let cooldownManager: CooldownManager;

	beforeEach(() => {
		registry = new ProviderRegistry<any>();
		tracker = new ProviderUsageTracker();
		cooldownManager = new CooldownManager();
		selector = new ProviderSelector(registry, tracker, cooldownManager);

		registry.register({
			id: 'provider1',
			name: 'provider1',
			category: 'search',
			api_key: 'key1',
			create: () => ({ name: 'provider1' }),
			priority: 1,
			weight: 3,
		});
		registry.register({
			id: 'provider2',
			name: 'provider2',
			category: 'search',
			api_key: 'key2',
			create: () => ({ name: 'provider2' }),
			priority: 2,
			weight: 1,
		});
	});

	it('selects best provider by score', () => {
		const selected = selector.select('search');
		expect(selected).toBe('provider1');
	});

	it('returns fallback list sorted by score', () => {
		const candidates = selector.selectWithFallback('search');
		expect(candidates).toEqual(['provider1', 'provider2']);
	});

	it('skips providers in cooldown', () => {
		cooldownManager.setCooldown('provider1', 60000, 'rate_limited');
		const selected = selector.select('search');
		expect(selected).toBe('provider2');
	});

	it('throws when no providers available', () => {
		cooldownManager.setCooldown('provider1', 60000, 'rate_limited');
		cooldownManager.setCooldown('provider2', 60000, 'rate_limited');
		expect(() => selector.select('search')).toThrow(
			'No available providers for category: search',
		);
	});

	it('selects weighted random', () => {
		const selected = selector.selectWeightedRandom('search');
		expect(['provider1', 'provider2']).toContain(selected);
	});

	it('resets round robin index', () => {
		selector.reset();
		expect(() => selector.select('search')).not.toThrow();
	});
});
