import { describe, expect, it, beforeEach } from 'vitest';
import { ProviderUsageTracker } from './provider-usage-tracker.js';

describe('ProviderUsageTracker', () => {
	let tracker: ProviderUsageTracker;

	beforeEach(() => {
		tracker = new ProviderUsageTracker();
	});

	it('records calls and calculates success rate', () => {
		tracker.recordCall('provider1', true, 100);
		tracker.recordCall('provider1', false, 200);
		tracker.recordCall('provider1', true, 150);

		expect(tracker.getSuccessRate('provider1')).toBeCloseTo(0.666, 2);
		expect(tracker.getCallCount('provider1')).toBe(3);
	});

	it('calculates average response time', () => {
		tracker.recordCall('provider1', true, 100);
		tracker.recordCall('provider1', true, 200);

		expect(tracker.getAvgResponseTime('provider1')).toBe(150);
	});

	it('returns 1.0 success rate for no records', () => {
		expect(tracker.getSuccessRate('unknown')).toBe(1.0);
	});

	it('tracks consecutive failures', () => {
		tracker.recordCall('provider1', true, 100);
		tracker.recordCall('provider1', false, 200);
		tracker.recordCall('provider1', false, 150);

		expect(tracker.getConsecutiveFailures('provider1')).toBe(2);
	});

	it('resets consecutive failures on success', () => {
		tracker.recordCall('provider1', false, 100);
		tracker.recordCall('provider1', true, 200);

		expect(tracker.getConsecutiveFailures('provider1')).toBe(0);
	});

	it('returns all stats', () => {
		tracker.recordCall('provider1', true, 100);
		tracker.recordCall('provider2', false, 200);

		const stats = tracker.getAllStats();
		expect(Object.keys(stats)).toHaveLength(2);
		expect(stats['provider1'].successRate).toBe(1.0);
		expect(stats['provider2'].successRate).toBe(0.0);
	});
});
