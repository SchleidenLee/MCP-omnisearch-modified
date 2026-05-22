import { McpServer } from 'tmcp';
import type { GenericSchema } from 'valibot';
import * as v from 'valibot';
import { config } from '../../config/env.js';
import { GitHubSearchProvider } from '../../providers/search/github/index.js';
import { ProviderRegistry } from '../provider-registry.js';
import { handle_tool_result } from './responses.js';
import {
	large_result_mode_schema,
	limit_schema,
	query_schema,
} from './schemas.js';
import { get_provider_weight } from '../../config/provider-config.js';
import {
	get_cooldown_manager,
	get_usage_tracker,
	get_callback_registry,
	get_search_registry,
} from '../global-provider-services.js';

const providers = new ProviderRegistry<GitHubSearchProvider>();

export const initialize_github_search = (): boolean => {
	providers.clear();
	providers.register({
		id: 'github',
		name: 'github',
		category: 'search',
		api_key_name: 'GITHUB_API_KEY',
		tools: ['github_search'],
		modes: ['code', 'repositories', 'users'],
		capabilities: ['code_search', 'repository_search', 'user_search'],
		api_key: config.search.github.api_key,
		create: () => new GitHubSearchProvider(),
		weight: get_provider_weight('github'),
	});

	const search_registry = get_search_registry();
	const github_entry = providers.entries()[0];
	if (github_entry) {
		const existing = search_registry.entries().find((e) => e.id === 'github');
		if (!existing) {
			search_registry.register(github_entry);
		}
	}

	return providers.size > 0;
};

export const get_available = () => providers.names();

export const get_provider_status_entries = () =>
	providers.status_entries();

export const register_github_search = (
	server: McpServer<GenericSchema>,
) => {
	if (providers.size === 0) return;

	server.tool(
		{
			name: 'github_search',
			description:
				'Search GitHub for code, repositories, or users. Use when you need to find code examples, open source projects, or developers. Supports advanced syntax: filename:, path:, repo:, user:, language:, in:file.',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			schema: v.object({
				query: query_schema,
				search_type: v.optional(
					v.pipe(
						v.picklist(['code', 'repositories', 'users']),
						v.description('What to search for (default: code)'),
					),
				),
				limit: limit_schema,
				large_result_mode: large_result_mode_schema,
				sort: v.optional(
					v.pipe(
						v.picklist(['stars', 'forks', 'updated']),
						v.description('Sort order (repositories only)'),
					),
				),
			}),
		},
		async ({
			query,
			search_type = 'code',
			limit,
			large_result_mode,
			sort,
		}) =>
			handle_tool_result(
				'github_search',
				async () => {
					const selected = providers.require(
						'github',
						'github_search',
					);

					const startTime = Date.now();
					try {
						let result: unknown;
						switch (search_type) {
							case 'code':
								result = await selected.search_code({ query, limit });
								break;
							case 'repositories':
								result = await selected.search_repositories({ query, limit, sort });
								break;
							case 'users':
								result = await selected.search_users({ query, limit });
								break;
						}

						get_usage_tracker().recordCall('github', true, Date.now() - startTime);
						return result;
					} catch (error) {
						get_usage_tracker().recordCall('github', false, Date.now() - startTime);
						throw error;
					}
				},
				{ large_result_mode },
			),
	);
};
