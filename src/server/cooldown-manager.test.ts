import { describe, expect, it, beforeEach } from 'vitest';
import { CooldownManager } from './cooldown-manager.js';

describe('CooldownManager', () => {
	let manager: CooldownManager;

	beforeEach(() => {
		manager = new CooldownManager();
	});

	it('returns available by default', () => {
		expect(manager.isAvailable('test-provider')).toBe(true);
	});

	it('sets and respects fixed cooldown', () => {
		manager.setCooldown('test-provider', 5000, 'rate_limited');
		expect(manager.isAvailable('test-provider')).toBe(false);
		expect(manager.getRemainingTime('test-provider')).toBeGreaterThan(0);
	});

	it('clears cooldown', () => {
		manager.setCooldown('test-provider', 5000, 'rate_limited');
		manager.clearCooldown('test-provider');
		expect(manager.isAvailable('test-provider')).toBe(true);
		expect(manager.getRemainingTime('test-provider')).toBe(0);
	});

	it('returns all status', () => {
		manager.setCooldown('provider1', 5000, 'rate_limited');
		manager.setCooldown('provider2', 10000, 'quota_exceeded');
		const status = manager.getAllStatus();
		expect(Object.keys(status)).toHaveLength(2);
		expect(status['provider1'].reason).toBe('rate_limited');
		expect(status['provider2'].reason).toBe('quota_exceeded');
	});

	it('isInCooldown returns false for non-existent provider', () => {
		expect(manager.isInCooldown('unknown')).toBe(false);
	});
});
