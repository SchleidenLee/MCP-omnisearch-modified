import { ProviderCategory } from './provider-registry.js';

export type ProviderEventType =
	| 'before_call'
	| 'after_call'
	| 'error'
	| 'cooldown_enter'
	| 'cooldown_exit';

export interface ProviderEvent {
	type: ProviderEventType;
	providerId: string;
	category: ProviderCategory;
	toolName: string;
	timestamp: number;
	success?: boolean;
	error?: Error;
	metadata?: unknown;
}

export type ProviderCallback = (
	event: ProviderEvent,
) => void | Promise<void>;

export class CallbackRegistry {
	private readonly callbacks: ProviderCallback[] = [];

	register(callback: ProviderCallback): void {
		this.callbacks.push(callback);
	}

	unregister(callback: ProviderCallback): void {
		const index = this.callbacks.indexOf(callback);
		if (index !== -1) {
			this.callbacks.splice(index, 1);
		}
	}

	async emit(event: ProviderEvent): Promise<void> {
		for (const callback of this.callbacks) {
			try {
				await callback(event);
			} catch (err) {
				console.error(
					`[CallbackRegistry] Callback error: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	clear(): void {
		this.callbacks.length = 0;
	}

	get size(): number {
		return this.callbacks.length;
	}
}
