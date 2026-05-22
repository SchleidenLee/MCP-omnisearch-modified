interface UsageRecord {
	success: boolean;
	durationMs: number;
	timestamp: number;
}

export class ProviderUsageTracker {
	private readonly records = new Map<string, UsageRecord[]>();

	recordCall(providerId: string, success: boolean, durationMs: number): void {
		if (!this.records.has(providerId)) {
			this.records.set(providerId, []);
		}
		const records = this.records.get(providerId)!;
		records.push({
			success,
			durationMs,
			timestamp: Date.now(),
		});

		const max_records = 1000;
		if (records.length > max_records) {
			records.splice(0, records.length - max_records);
		}
	}

	private getRecordsInWindow(providerId: string, windowMinutes: number): UsageRecord[] {
		const records = this.records.get(providerId);
		if (!records) return [];
		const cutoff = Date.now() - windowMinutes * 60 * 1000;
		return records.filter((r) => r.timestamp >= cutoff);
	}

	getSuccessRate(providerId: string, windowMinutes: number = 60): number {
		const records = this.getRecordsInWindow(providerId, windowMinutes);
		if (records.length === 0) return 1.0;
		const successCount = records.filter((r) => r.success).length;
		return successCount / records.length;
	}

	getAvgResponseTime(providerId: string, windowMinutes: number = 60): number {
		const records = this.getRecordsInWindow(providerId, windowMinutes);
		if (records.length === 0) return 0;
		const total = records.reduce((sum, r) => sum + r.durationMs, 0);
		return total / records.length;
	}

	getCallCount(providerId: string, windowMinutes: number = 60): number {
		return this.getRecordsInWindow(providerId, windowMinutes).length;
	}

	getAllStats(): Record<string, { successRate: number; avgResponseTime: number; callCount: number }> {
		const result: Record<string, { successRate: number; avgResponseTime: number; callCount: number }> = {};
		for (const providerId of this.records.keys()) {
			result[providerId] = {
				successRate: this.getSuccessRate(providerId),
				avgResponseTime: this.getAvgResponseTime(providerId),
				callCount: this.getCallCount(providerId),
			};
		}
		return result;
	}

	getConsecutiveFailures(providerId: string): number {
		const records = this.records.get(providerId);
		if (!records || records.length === 0) return 0;
		let count = 0;
		for (let i = records.length - 1; i >= 0; i--) {
			if (records[i].success) break;
			count++;
		}
		return count;
	}

	reset(): void {
		this.records.clear();
	}
}
