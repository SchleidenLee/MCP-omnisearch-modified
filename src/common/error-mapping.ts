export type ErrorType =
	| 'quota_exceeded'
	| 'rate_limited'
	| 'auth_failed'
	| 'server_error'
	| 'unknown';

interface ErrorPattern {
	statusCode?: number[];
	messageRegex?: RegExp;
	errorCode?: string[];
}

interface ErrorMapping {
	providerId: string;
	patterns: ErrorPattern;
	errorType: ErrorType;
}

const defaultMappings: ErrorMapping[] = [
	{
		providerId: '*',
		patterns: { statusCode: [401] },
		errorType: 'auth_failed',
	},
	{
		providerId: '*',
		patterns: { statusCode: [403] },
		errorType: 'auth_failed',
	},
	{
		providerId: '*',
		patterns: { statusCode: [429] },
		errorType: 'rate_limited',
	},
	{
		providerId: '*',
		patterns: { statusCode: [500, 502, 503, 504] },
		errorType: 'server_error',
	},
	{
		providerId: 'tavily',
		patterns: {
			messageRegex: /quota|limit|exceeded/i,
		},
		errorType: 'quota_exceeded',
	},
	{
		providerId: 'brave',
		patterns: {
			messageRegex: /quota|budget|exceeded/i,
		},
		errorType: 'quota_exceeded',
	},
	{
		providerId: 'kagi',
		patterns: {
			messageRegex: /quota|limit|exceeded/i,
		},
		errorType: 'quota_exceeded',
	},
	{
		providerId: 'exa',
		patterns: {
			messageRegex: /quota|credits|exceeded/i,
		},
		errorType: 'quota_exceeded',
	},
	{
		providerId: 'firecrawl',
		patterns: {
			messageRegex: /quota|credits|exceeded/i,
		},
		errorType: 'quota_exceeded',
	},
	{
		providerId: 'linkup',
		patterns: {
			messageRegex: /quota|credits|exceeded/i,
		},
		errorType: 'quota_exceeded',
	},
];

const extractStatusCode = (error: unknown): number | undefined => {
	if (
		typeof error === 'object' &&
		error !== null &&
		'details' in error &&
		typeof error.details === 'object' &&
		error.details !== null &&
		'status' in error.details
	) {
		return (error.details as Record<string, unknown>).status as number;
	}
	if (
		typeof error === 'object' &&
		error !== null &&
		'status' in error
	) {
		return (error as Record<string, unknown>).status as number;
	}
	return undefined;
};

const extractMessage = (error: unknown): string => {
	if (error instanceof Error) return error.message;
	if (
		typeof error === 'object' &&
		error !== null &&
		'message' in error
	) {
		return (error as Record<string, unknown>).message as string;
	}
	return String(error);
};

export const classify_error = (
	providerId: string,
	error: unknown,
): ErrorType => {
	const statusCode = extractStatusCode(error);
	const message = extractMessage(error);

	const specificMappings = defaultMappings.filter(
		(m) => m.providerId === providerId,
	);
	const genericMappings = defaultMappings.filter(
		(m) => m.providerId === '*',
	);

	for (const mapping of [...specificMappings, ...genericMappings]) {
		if (matchesPattern(statusCode, message, mapping.patterns)) {
			return mapping.errorType;
		}
	}

	return 'unknown';
};

const matchesPattern = (
	statusCode: number | undefined,
	message: string,
	patterns: ErrorPattern,
): boolean => {
	if (
		patterns.statusCode &&
		statusCode &&
		patterns.statusCode.includes(statusCode)
	) {
		return true;
	}

	if (patterns.messageRegex && patterns.messageRegex.test(message)) {
		return true;
	}

	if (patterns.errorCode) {
		for (const code of patterns.errorCode) {
			if (message.includes(code)) return true;
		}
	}

	return false;
};

export const is_quota_exceeded = (error: unknown): boolean => {
	const message = extractMessage(error);
	return /quota|credits|budget|limit exceeded/i.test(message);
};

export const is_rate_limited = (error: unknown): boolean => {
	const statusCode = extractStatusCode(error);
	if (statusCode === 429) return true;
	const message = extractMessage(error);
	return /rate.?limit|too many requests|throttl/i.test(message);
};
