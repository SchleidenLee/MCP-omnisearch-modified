import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { omit_raw_contents } from '../../common/results.js';
import {
	ErrorType,
	ProcessingProvider,
	ProviderError,
	ProcessingResult,
} from '../../common/types.js';
import { config } from '../../config/env.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	include_raw_contents_schema,
	large_result_mode_schema,
	url_or_urls_schema,
} from './schemas.js';

import { ExaContentsProvider } from '../../providers/processing/exa-contents/index.js';
import { ExaSimilarProvider } from '../../providers/processing/exa-similar/index.js';
import { FirecrawlActionsProvider } from '../../providers/processing/firecrawl-actions/index.js';
import { FirecrawlCrawlProvider } from '../../providers/processing/firecrawl-crawl/index.js';
import { FirecrawlExtractProvider } from '../../providers/processing/firecrawl-extract/index.js';
import { FirecrawlMapProvider } from '../../providers/processing/firecrawl-map/index.js';
import { FirecrawlScrapeProvider } from '../../providers/processing/firecrawl-scrape/index.js';
import { KagiSummarizerProvider } from '../../providers/processing/kagi-summarizer/index.js';
import { TavilyExtractProvider } from '../../providers/processing/tavily-extract/index.js';
import { get_provider_priority, get_provider_weight } from '../../config/provider-config.js';
import { execute_with_fallback } from '../provider-fallback-executor.js';
import {
	get_cooldown_manager,
	get_usage_tracker,
	get_callback_registry,
	get_processing_registry,
} from '../global-provider-services.js';
import { ProviderSelector } from '../provider-selector.js';

export type WebExtractProvider =
	| 'tavily'
	| 'kagi'
	| 'firecrawl'
	| 'exa';

export type WebExtractMode =
	| 'extract'
	| 'summarize'
	| 'scrape'
	| 'crawl'
	| 'map'
	| 'actions'
	| 'contents'
	| 'similar';

type ProviderKey = string;

const providers = new ProviderRegistry<ProcessingProvider>();
let selector: ProviderSelector | null = null;

const make_key = (provider: string, mode: string): ProviderKey =>
	`${provider}:${mode}`;

export const initialize_web_extract = (): boolean => {
	providers.clear();
	selector = null;

	const processing_registry = get_processing_registry();
	processing_registry.clear();

	const registerProvider = (
		id: string,
		name: string,
		api_key: string | undefined,
		api_key_name: string,
		modes: readonly string[],
		capabilities: readonly string[],
		create: () => ProcessingProvider,
		priorityKey?: string,
		weightKey?: string,
	) => {
		const definition = {
			id,
			name,
			category: 'processing' as const,
			api_key,
			api_key_name,
			tools: ['web_extract'] as const,
			modes,
			capabilities,
			create,
			priority: priorityKey ? get_provider_priority('processing', priorityKey) : undefined,
			weight: weightKey ? get_provider_weight(weightKey) : undefined,
		};

		providers.register(definition);
		processing_registry.register(definition);
	};

	registerProvider(
		make_key('tavily', 'extract'),
		'tavily',
		config.processing.tavily_extract.api_key,
		'TAVILY_API_KEY',
		['extract'],
		['content_extraction', 'raw_contents'],
		() => new TavilyExtractProvider(),
		'tavily',
		'tavily',
	);
	registerProvider(
		make_key('kagi', 'summarize'),
		'kagi',
		config.processing.kagi_summarizer.api_key,
		'KAGI_API_KEY',
		['summarize'],
		['summarization'],
		() => new KagiSummarizerProvider(),
		'kagi',
		'kagi',
	);

	const firecrawl_modes: Array<{
		mode: WebExtractMode;
		capabilities: readonly string[];
		create: () => ProcessingProvider;
	}> = [
		{ mode: 'scrape', capabilities: ['scraping'], create: () => new FirecrawlScrapeProvider() },
		{ mode: 'crawl', capabilities: ['crawling'], create: () => new FirecrawlCrawlProvider() },
		{ mode: 'map', capabilities: ['site_mapping'], create: () => new FirecrawlMapProvider() },
		{ mode: 'extract', capabilities: ['structured_extraction'], create: () => new FirecrawlExtractProvider() },
		{ mode: 'actions', capabilities: ['browser_actions'], create: () => new FirecrawlActionsProvider() },
	];
	for (const { mode, capabilities, create } of firecrawl_modes) {
		registerProvider(
			make_key('firecrawl', mode),
			'firecrawl',
			config.processing.firecrawl_scrape.api_key,
			'FIRECRAWL_API_KEY',
			[mode],
			capabilities,
			create,
			'firecrawl',
			'firecrawl',
		);
	}

	for (const mode of ['contents', 'similar'] as const) {
		registerProvider(
			make_key('exa', mode),
			'exa',
			config.processing.exa_contents.api_key,
			'EXA_API_KEY',
			[mode],
			mode === 'contents' ? ['content_retrieval'] : ['similar_pages'],
			() => mode === 'contents' ? new ExaContentsProvider() : new ExaSimilarProvider(),
			'exa',
			'exa',
		);
	}

	selector = new ProviderSelector(
		processing_registry,
		get_usage_tracker(),
		get_cooldown_manager(),
	);

	return providers.size > 0;
};

export const get_available_providers = () => providers.names();

export const get_provider_status_entries = () =>
	providers.status_entries();

const default_modes: Record<WebExtractProvider, WebExtractMode> = {
	tavily: 'extract',
	kagi: 'summarize',
	firecrawl: 'scrape',
	exa: 'contents',
};

const valid_modes: Record<WebExtractProvider, WebExtractMode[]> = {
	tavily: ['extract'],
	kagi: ['summarize'],
	firecrawl: ['scrape', 'crawl', 'map', 'extract', 'actions'],
	exa: ['contents', 'similar'],
};

export const register_web_extract = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	const available = get_available_providers() as WebExtractProvider[];

	server.tool(
		{
			name: 'web_extract',
			description:
				'Extract, process, or summarize web content from URLs. Use when you need to read page content, summarize articles, crawl sites, or extract structured data. Providers: tavily (content extraction), kagi (summarization of pages/videos/podcasts), firecrawl (scraping/crawling/mapping/structured extraction/interactive), exa (content retrieval/similar pages).',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			schema: v.object({
				url: url_or_urls_schema,
				provider: v.optional(
					v.pipe(
						v.picklist(available),
						v.description('Processing provider to use (optional, auto-selects best provider)'),
					),
				),
				mode: v.optional(
					v.pipe(
						v.picklist([
							'extract',
							'summarize',
							'scrape',
							'crawl',
							'map',
							'actions',
							'contents',
							'similar',
						]),
						v.description(
							'Processing mode. Firecrawl: scrape/crawl/map/extract/actions. Exa: contents/similar. Tavily: extract. Kagi: summarize. Defaults to provider default.',
						),
					),
				),
				extract_depth: v.optional(
					v.pipe(
						v.picklist(['basic', 'advanced']),
						v.description('Extraction depth (default: basic)'),
					),
				),
				large_result_mode: large_result_mode_schema,
				include_raw_contents: include_raw_contents_schema,
			}),
		},
		async ({
			url,
			provider,
			mode,
			extract_depth,
			large_result_mode,
			include_raw_contents = true,
		}) =>
			handle_tool_result(
				'web_extract',
				async () => {
					if (provider) {
						const provider_name = provider as WebExtractProvider;
						const resolved_mode = mode || default_modes[provider_name];
						const allowed = valid_modes[provider_name];

						if (allowed && !allowed.includes(resolved_mode)) {
							throw new ProviderError(
								ErrorType.INVALID_INPUT,
								`Mode "${resolved_mode}" is not valid for provider "${provider}". Valid modes: ${allowed.join(', ')}`,
								'web_extract',
							);
						}

						const key = make_key(provider, resolved_mode);
						const selected = providers.require(
							key,
							'web_extract',
							`Provider "${provider}" with mode "${resolved_mode}" is not available. Check your API keys.`,
						);

						const startTime = Date.now();
						try {
							const result = await selected.process_content(url, extract_depth);
							get_usage_tracker().recordCall(key, true, Date.now() - startTime);
							return include_raw_contents ? result : omit_raw_contents(result);
						} catch (error) {
							get_usage_tracker().recordCall(key, false, Date.now() - startTime);
							throw error;
						}
					}

					if (!selector) {
						throw new Error('web_extract auto-select requires at least one available provider');
					}

					const candidates = selector.selectWithFallback('processing');
					if (candidates.length === 0) {
						throw new Error('No processing providers available');
					}

					return execute_with_fallback<ProcessingResult>(
						candidates,
						async (instance, providerId) => {
							let resolved_mode = mode;
							if (!resolved_mode) {
								for (const p of available) {
									if (providerId.startsWith(p)) {
										resolved_mode = default_modes[p];
										break;
									}
								}
							}
							if (!resolved_mode) {
								resolved_mode = 'extract';
							}

							return (instance as ProcessingProvider).process_content(url, extract_depth);
						},
						{
							category: 'processing',
							toolName: 'web_extract',
							registry: get_processing_registry(),
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
