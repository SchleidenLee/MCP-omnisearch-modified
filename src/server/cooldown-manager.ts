export interface CooldownStatus {
	availableAt: number;
	reason: string;
}

export class CooldownManager {
	private readonly cooldowns = new Map<string, CooldownStatus>();

	setCooldown(providerId: string, durationMs: number, reason: string): void {
		const availableAt = Date.now() + durationMs;
		this.cooldowns.set(providerId, { availableAt, reason });
	}

	setMonthlyCooldown(providerId: string, reason: string): void {
		const now = new Date();
		const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
		const availableAt = nextMonth.getTime();
		this.cooldowns.set(providerId, { availableAt, reason });
	}

	isAvailable(providerId: string): boolean {
		const status = this.cooldowns.get(providerId);
		if (!status) return true;
		return Date.now() >= status.availableAt;
	}

	getRemainingTime(providerId: string): number {
		const status = this.cooldowns.get(providerId);
		if (!status) return 0;
		const remaining = status.availableAt - Date.now();
		return remaining > 0 ? remaining : 0;
	}

	clearCooldown(providerId: string): void {
		this.cooldowns.delete(providerId);
	}

	getAllStatus(): Record<string, CooldownStatus> {
		const result: Record<string, CooldownStatus> = {};
		for (const [providerId, status] of this.cooldowns.entries()) {
			result[providerId] = { ...status };
		}
		return result;
	}

	isInCooldown(providerId: string): boolean {
		return this.cooldowns.has(providerId) && !this.isAvailable(providerId);
	}
}
