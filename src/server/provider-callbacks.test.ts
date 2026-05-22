import { describe, expect, it, beforeEach } from 'vitest';
import { CallbackRegistry } from './provider-callbacks.js';

describe('CallbackRegistry', () => {
	let registry: CallbackRegistry;

	beforeEach(() => {
		registry = new CallbackRegistry();
	});

	it('registers and emits callbacks', async () => {
		const calls: string[] = [];
		registry.register(async () => {
			calls.push('callback1');
		});

		await registry.emit({
			type: 'before_call',
			providerId: 'test',
			category: 'search',
			toolName: 'web_search',
			timestamp: Date.now(),
		});

		expect(calls).toEqual(['callback1']);
	});

	it('handles multiple callbacks', async () => {
		const calls: string[] = [];
		registry.register(async () => calls.push('cb1'));
		registry.register(async () => calls.push('cb2'));

		await registry.emit({
			type: 'after_call',
			providerId: 'test',
			category: 'search',
			toolName: 'web_search',
			timestamp: Date.now(),
			success: true,
		});

		expect(calls).toEqual(['cb1', 'cb2']);
	});

	it('continues emitting when one callback fails', async () => {
		const calls: string[] = [];
		registry.register(async () => {
			throw new Error('Test error');
		});
		registry.register(async () => calls.push('cb2'));

		await registry.emit({
			type: 'error',
			providerId: 'test',
			category: 'search',
			toolName: 'web_search',
			timestamp: Date.now(),
		});

		expect(calls).toEqual(['cb2']);
	});

	it('unregisters callbacks', () => {
		const cb = async () => {};
		registry.register(cb);
		expect(registry.size).toBe(1);
		registry.unregister(cb);
		expect(registry.size).toBe(0);
	});

	it('clears all callbacks', () => {
		registry.register(async () => {});
		registry.register(async () => {});
		registry.clear();
		expect(registry.size).toBe(0);
	});
});
