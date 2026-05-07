import type { CmsContext } from '../config.js';
import type { CollectionDef } from '../ir/types.js';

export interface PluginSchemaIR {
	collections: Record<string, CollectionDef>;
}

export interface PluginEndpoint {
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	path: string;
	handler: (request: Request, ctx: CmsContext) => Promise<Response> | Response;
}

export interface CmsPlugin {
	id: string;
	schema?: PluginSchemaIR;
	endpoints?: PluginEndpoint[];
	init?: (ctx: CmsContext) => void | Promise<void>;
	hooks?: {
		beforeWrite?: (collection: string, data: Record<string, unknown>, ctx: CmsContext) => unknown;
		afterWrite?: (collection: string, data: Record<string, unknown>, ctx: CmsContext) => unknown;
	};
}
