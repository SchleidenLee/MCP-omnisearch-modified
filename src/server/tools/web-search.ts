import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { SearchProvider, BaseSearchParams, SearchResult } from '../../common/types.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	exclude_domains_schema,
	include_domains_schema,
	large_result_mode_schema,
	limit_schema,
	query_schema,
} from './schemas.js';

import { config } from '../../config/env.js';
import { KagiEnrichmentSearchProvider } from '../../providers/enhancement/kagi-enrichment/index.js';
import { BraveSearchProvider } from '../../providers/search/brave/index.js';
import { ExaSearchProvider } from '../../providers/search/exa/index.js';
import { KagiSearchProvider } from '../../providers/search/kagi/index.js';
import { TavilySearchProvider } from '../../providers/search/tavily/index.js';
import { get_provider_priority, get_provider_weight } from '../../config/provider-config.js';
import { execute_with_fallback } from '../provider-fallback-executor.js';
import {
	get_cooldown_manager,
	get_usage_tracker,
	get_callback_registry,
	get_search_registry,
} from '../global-provider-services.js';
import { ProviderSelector } from '../provider-selector.js';

export type WebSearchProviderName =
	| 'tavily'
	| 'brave'
	| 'kagi'
	| 'exa'
	| 'kagi_enrichment';

const providers = new ProviderRegistry<SearchProvider>();
let selector: ProviderSelector | null = null;

export const initialize_web_search = (): boolean => {
	providers.clear();
	selector = null;

	const registerProvider = (
		id: WebSearchProviderName,
		ProviderClass: new () => SearchProvider,
		capabilities: string[],
	) => {
		const api_key_map: Record<string, string | undefined> = {
			tavily: config.search.tavily.api_key,
			brave: config.search.brave.api_key,
			kagi: config.search.kagi.api_key,
			exa: config.search.exa.api_key,
			kagi_enrichment: config.enhancement.kagi_enrichment.api_key,
		};

		const definition = {
			id,
			name: id,
			category: 'search' as const,
			api_key_name: id === 'kagi_enrichment' ? 'KAGI_API_KEY' : `${id.toUpperCase()}_API_KEY`,
			tools: ['web_search'] as const,
			capabilities,
			api_key: api_key_map[id],
			create: () => new ProviderClass(),
			priority: get_provider_priority('search', id),
			weight: get_provider_weight(id),
		};

		providers.register(definition);
		search_registry.register(definition);
	};

	const search_registry = get_search_registry();
	search_registry.clear();

	registerProvider('tavily', TavilySearchProvider, [
		'web_search',
		'domain_filters',
		'operator_translation',
	]);
	registerProvider('brave', BraveSearchProvider, [
		'web_search',
		'domain_filters',
		'operator_passthrough',
	]);
	registerProvider('kagi', KagiSearchProvider, [
		'web_search',
		'domain_filters',
		'operator_passthrough',
	]);
	registerProvider('exa', ExaSearchProvider, [
		'web_search',
		'domain_filters',
		'semantic_search',
	]);
	registerProvider('kagi_enrichment', KagiEnrichmentSearchProvider, [
		'specialized_indexes',
		'web_enrichment',
	]);

	selector = new ProviderSelector(
		search_registry,
		get_usage_tracker(),
		get_cooldown_manager(),
	);

	return providers.size > 0;
};

export const get_available_providers = () => providers.names();

export const get_provider_status_entries = () =>
	providers.status_entries();

export const register_web_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const provider_names = providers.ids() as WebSearchProviderName[];

	server.tool(
		{
			name: 'web_search',
			description:
				'Search the web for information. Use when you need to find web pages, articles, or data. Providers: tavily (factual/citations), brave (privacy/operators), kagi (quality/operators), exa (AI-semantic), kagi_enrichment (specialized indexes). Brave/Kagi support query operators like site:, filetype:, lang:, before:, after:.',
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
						v.description('Search provider to use (optional, auto-selects best provider)'),
					),
				),
				limit: limit_schema,
				include_domains: include_domains_schema,
				exclude_domains: exclude_domains_schema,
				large_result_mode: large_result_mode_schema,
			}),
		},
		async ({
			query,
			provider,
			limit,
			include_domains,
			exclude_domains,
			large_result_mode,
		}) =>
			handle_tool_result(
				'web_search',
				async () => {
					if (!selector) {
						const selected = providers.require(provider!, 'web_search');
						return selected.search({
							query,
							limit,
							include_domains,
							exclude_domains,
						});
					}

					if (provider) {
						const selected = providers.require(provider, 'web_search');
						return selected.search({
							query,
							limit,
							include_domains,
							exclude_domains,
						});
					}

					const candidates = selector.selectWithFallback('search');
					if (candidates.length === 0) {
						throw new Error('No search providers available');
					}

					const params: BaseSearchParams = {
						query,
						limit,
						include_domains,
						exclude_domains,
					};

					return execute_with_fallback<SearchResult[]>(
						candidates,
						async (instance) => (instance as SearchProvider).search(params),
						{
							category: 'search',
							toolName: 'web_search',
							registry: get_search_registry(),
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
