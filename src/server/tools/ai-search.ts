import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { SearchProvider, BaseSearchParams, SearchResult } from '../../common/types.js';
import { config } from '../../config/env.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	large_result_mode_schema,
	limit_schema,
	query_schema,
} from './schemas.js';

import { ExaAnswerProvider } from '../../providers/ai-response/exa-answer/index.js';
import { KagiFastGPTProvider } from '../../providers/ai-response/kagi-fastgpt/index.js';
import { LinkupProvider } from '../../providers/ai-response/linkup/index.js';
import { get_provider_priority, get_provider_weight } from '../../config/provider-config.js';
import { execute_with_fallback } from '../provider-fallback-executor.js';
import {
	get_cooldown_manager,
	get_usage_tracker,
	get_callback_registry,
	get_ai_response_registry,
} from '../global-provider-services.js';
import { ProviderSelector } from '../provider-selector.js';

export type AISearchProviderName =
	| 'kagi_fastgpt'
	| 'exa_answer'
	| 'linkup';

const providers = new ProviderRegistry<SearchProvider>();
let selector: ProviderSelector | null = null;

export const initialize_ai_search = (): boolean => {
	providers.clear();
	selector = null;

	const ai_registry = get_ai_response_registry();
	ai_registry.clear();

	const registerProvider = (
		id: AISearchProviderName,
		ProviderClass: new () => SearchProvider,
		capabilities: string[],
		api_key: string | undefined,
		api_key_name: string,
	) => {
		const definition = {
			id,
			name: id,
			category: 'ai_response' as const,
			api_key_name,
			tools: ['ai_search'] as const,
			capabilities,
			api_key,
			create: () => new ProviderClass(),
			priority: get_provider_priority('ai_response', id),
			weight: get_provider_weight(id),
		};

		providers.register(definition);
		ai_registry.register(definition);
	};

	registerProvider(
		'kagi_fastgpt',
		KagiFastGPTProvider,
		['answer_generation', 'citations'],
		config.ai_response.kagi_fastgpt.api_key,
		'KAGI_API_KEY',
	);
	registerProvider(
		'exa_answer',
		ExaAnswerProvider,
		['answer_generation', 'semantic_search'],
		config.ai_response.exa_answer.api_key,
		'EXA_API_KEY',
	);
	registerProvider(
		'linkup',
		LinkupProvider,
		['answer_generation', 'citations'],
		config.ai_response.linkup.api_key,
		'LINKUP_API_KEY',
	);

	selector = new ProviderSelector(
		ai_registry,
		get_usage_tracker(),
		get_cooldown_manager(),
	);

	return providers.size > 0;
};

export const get_available_providers = () => providers.names();

export const get_provider_status_entries = () =>
	providers.status_entries();

export const register_ai_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const provider_names = providers.ids() as AISearchProviderName[];

	server.tool(
		{
			name: 'ai_search',
			description:
				'Get AI-powered answers with citations and reasoning. Use when you need synthesized answers rather than raw search results. Providers: kagi_fastgpt (fast ~900ms answers), exa_answer (semantic AI), linkup (deep agentic search with sources).',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			schema: v.object({
				query: query_schema,
				provider: v.optional(
					v.pipe(
						v.picklist(provider_names),
						v.description('AI search provider to use (optional, auto-selects best provider)'),
					),
				),
				limit: limit_schema,
				large_result_mode: large_result_mode_schema,
			}),
		},
		async ({ query, provider, limit, large_result_mode }) =>
			handle_tool_result(
				'ai_search',
				async () => {
					if (!selector) {
						const selected = providers.require(provider!, 'ai_search');
						return selected.search({ query, limit });
					}

					if (provider) {
						const selected = providers.require(provider, 'ai_search');
						return selected.search({ query, limit });
					}

					const candidates = selector.selectWithFallback('ai_response');
					if (candidates.length === 0) {
						throw new Error('No AI response providers available');
					}

					const params: BaseSearchParams = { query, limit };

					return execute_with_fallback<SearchResult[]>(
						candidates,
						async (instance) => (instance as SearchProvider).search(params),
						{
							category: 'ai_response',
							toolName: 'ai_search',
							registry: get_ai_response_registry(),
							cooldownManager: get_cooldown_manager(),
							usageTracker: get_usage_tracker(),
							callbackRegistry: get_callback_registry(),
							getProviderId: (id) => id,
						},
					);
				},
				{ large_result_mode },
			),
	);
};
