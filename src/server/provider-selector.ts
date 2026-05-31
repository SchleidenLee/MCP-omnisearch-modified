import { ProviderCategory, ProviderRegistry } from './provider-registry.js';
import { CooldownManager } from './cooldown-manager.js';
import { ProviderUsageTracker } from './provider-usage-tracker.js';

interface ProviderScore {
	id: string;
	priority: number;
	weight: number;
	successRate: number;
	avgResponseTime: number;
	consecutiveFailures: number;
	score: number;
}

export class ProviderSelector {
	private roundRobinIndex = new Map<string, number>();

	constructor(
		private registry: ProviderRegistry<any>,
		private tracker: ProviderUsageTracker,
		private cooldownManager: CooldownManager,
	) {}

	select(category: ProviderCategory): string {
		const candidates = this.selectWithFallback(category);
		if (candidates.length === 0) {
			throw new Error(`No available providers for category: ${category}`);
		}
		return candidates[0];
	}

	selectWithFallback(category: ProviderCategory): string[] {
		const allIds = this.registry.ids();
		const available: string[] = [];

		for (const id of allIds) {
			if (this.cooldownManager.isInCooldown(id)) continue;
			available.push(id);
		}

		if (available.length === 0) return [];

		const scored = available.map((id) => this.calculateScore(id));
		scored.sort((a, b) => b.score - a.score);

		return scored.map((s) => s.id);
	}

	private calculateScore(providerId: string): ProviderScore {
		const priority = this.getProviderPriority(providerId);
		const weight = this.getProviderWeight(providerId);
		const successRate = this.tracker.getSuccessRate(providerId);
		const avgResponseTime = this.tracker.getAvgResponseTime(providerId);
		const consecutiveFailures = this.tracker.getConsecutiveFailures(providerId);

		const successRatePenalty = successRate < 0.5 ? (0.5 - successRate) * 2 : 0;
		const consecutiveFailurePenalty = consecutiveFailures * 0.1;
		const responseTimeFactor = avgResponseTime > 0 ? Math.min(avgResponseTime / 10000, 1) * 0.1 : 0;

		const score = (10 - priority) * 10 + weight * 2 + successRate * 20 - successRatePenalty * 10 - consecutiveFailurePenalty * 5 - responseTimeFactor * 10;

		return {
			id: providerId,
			priority,
			weight,
			successRate,
			avgResponseTime,
			consecutiveFailures,
			score,
		};
	}

	private getProviderPriority(providerId: string): number {
		const entry = this.registry.entries().find((e) => e.id === providerId);
		return entry?.priority ?? 5;
	}

	private getProviderWeight(providerId: string): number {
		const entry = this.registry.entries().find((e) => e.id === providerId);
		return entry?.weight ?? 1;
	}

	selectWeightedRandom(category: ProviderCategory): string {
		const candidates = this.selectWithFallback(category);
		if (candidates.length === 0) {
			throw new Error(`No available providers for category: ${category}`);
		}

		if (candidates.length === 1) return candidates[0];

		const weights = candidates.map((id) => {
			const entry = this.registry.entries().find((e) => e.id === id);
			const successRate = this.tracker.getSuccessRate(id);
			return (entry?.weight ?? 1) * successRate;
		});

		const totalWeight = weights.reduce((sum, w) => sum + w, 0);
		let random = Math.random() * totalWeight;

		for (let i = 0; i < candidates.length; i++) {
			random -= weights[i];
			if (random <= 0) return candidates[i];
		}

		return candidates[candidates.length - 1];
	}

	selectRoundRobin(category: ProviderCategory): string {
		const candidates = this.selectWithFallback(category);
		if (candidates.length === 0) {
			throw new Error(`No available providers for category: ${category}`);
		}

		if (candidates.length === 1) return candidates[0];

		const key = category;
		const currentIndex = this.roundRobinIndex.get(key) ?? 0;
		const nextIndex = (currentIndex + 1) % candidates.length;
		this.roundRobinIndex.set(key, nextIndex);

		return candidates[nextIndex];
	}

	reset(): void {
		this.roundRobinIndex.clear();
	}
}
