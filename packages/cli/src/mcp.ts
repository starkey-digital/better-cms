import { applyOps, collectionToJsonSchema, getCMSTables } from '@better-cms/core';
import type { CMSOp } from '@better-cms/core';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './load-config.js';

export interface McpServerOpts {
	cwd?: string;
	configPath?: string;
}

const COLLECTION_TOOLS: Record<
	string,
	(collection: string, input: Record<string, unknown>) => CMSOp
> = {
	cms_create: (collection, input) => ({
		op: 'create',
		collection,
		data: input.data as Record<string, unknown>,
	}),
	cms_update: (collection, input) => ({
		op: 'set',
		collection,
		id: input.id as string,
		data: input.data as Record<string, unknown>,
	}),
	cms_delete: (collection, input) => ({
		op: 'remove',
		collection,
		id: input.id as string,
	}),
};

export async function startMcpServer(opts: McpServerOpts = {}): Promise<void> {
	const cwd = opts.cwd ?? process.cwd();
	const { config } = await loadConfig(cwd, opts.configPath);
	const schema = getCMSTables(config);
	if (config.adapter.init) await config.adapter.init(schema);

	const collections = Object.keys(schema.collections);

	const server = new Server(
		{ name: 'better-cms', version: '0.0.0' },
		{ capabilities: { tools: {}, resources: {} } },
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [
			{
				name: 'cms_schema',
				description: 'Return the full CMS schema (collections, fields, validation, kinds).',
				inputSchema: { type: 'object', properties: {} },
			},
			{
				name: 'cms_list',
				description: 'List records from a collection.',
				inputSchema: {
					type: 'object',
					required: ['collection'],
					properties: {
						collection: { type: 'string', enum: collections },
						limit: { type: 'integer', minimum: 1, maximum: 100 },
						offset: { type: 'integer', minimum: 0 },
					},
				},
			},
			{
				name: 'cms_get',
				description: 'Fetch one record by id (or, for singletons, the singleton row).',
				inputSchema: {
					type: 'object',
					required: ['collection'],
					properties: {
						collection: { type: 'string', enum: collections },
						id: { type: 'string' },
					},
				},
			},
			{
				name: 'cms_create',
				description: 'Create a record in a collection.',
				inputSchema: {
					type: 'object',
					required: ['collection', 'data'],
					properties: {
						collection: { type: 'string', enum: collections },
						data: { type: 'object' },
					},
				},
			},
			{
				name: 'cms_update',
				description: 'Update fields on a record by id.',
				inputSchema: {
					type: 'object',
					required: ['collection', 'id', 'data'],
					properties: {
						collection: { type: 'string', enum: collections },
						id: { type: 'string' },
						data: { type: 'object' },
					},
				},
			},
			{
				name: 'cms_delete',
				description: 'Delete a record by id.',
				inputSchema: {
					type: 'object',
					required: ['collection', 'id'],
					properties: {
						collection: { type: 'string', enum: collections },
						id: { type: 'string' },
					},
				},
			},
		],
	}));

	server.setRequestHandler(ListResourcesRequestSchema, async () => ({
		resources: collections.map((c) => ({
			uri: `cms://schema/${c}`,
			name: `${c} schema`,
			mimeType: 'application/json',
			description: `JSON Schema for the ${c} collection`,
		})),
	}));

	server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
		const m = req.params.uri.match(/^cms:\/\/schema\/(.+)$/);
		if (!m) throw new Error(`unknown resource ${req.params.uri}`);
		const def = schema.collections[m[1]!];
		if (!def) throw new Error(`unknown collection ${m[1]}`);
		return {
			contents: [
				{
					uri: req.params.uri,
					mimeType: 'application/json',
					text: JSON.stringify(collectionToJsonSchema(def), null, 2),
				},
			],
		};
	});

	server.setRequestHandler(CallToolRequestSchema, async (req) => {
		const { name, arguments: args = {} } = req.params;
		try {
			if (name === 'cms_schema') {
				return textResult(
					Object.fromEntries(
						Object.entries(schema.collections).map(([c, d]) => [c, collectionToJsonSchema(d)]),
					),
				);
			}
			const collection = args.collection as string;
			if (name === 'cms_list') {
				const rows = await config.adapter.findMany(collection, {
					limit: (args.limit as number) ?? 50,
					offset: (args.offset as number) ?? 0,
				});
				return textResult(rows);
			}
			if (name === 'cms_get') {
				const row = await config.adapter.findOne(collection, { id: args.id as string });
				return textResult(row);
			}
			const builder = COLLECTION_TOOLS[name];
			if (builder) {
				const op = {
					...builder(collection, args),
					source: 'mcp' as const,
					at: new Date().toISOString(),
				};
				const [res] = await applyOps([op], { store: config.adapter, schema });
				if (!res?.ok) {
					return textResult({ error: res?.error?.message ?? 'unknown' }, true);
				}
				return textResult(res.row ?? { ok: true });
			}
			return textResult({ error: `unknown tool ${name}` }, true);
		} catch (e) {
			return textResult({ error: (e as Error).message }, true);
		}
	});

	await server.connect(new StdioServerTransport());
}

function textResult(value: unknown, isError = false) {
	return {
		isError,
		content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
	};
}
