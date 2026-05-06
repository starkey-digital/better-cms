import type { CMSContext } from '../config.js';
import type { CollectionDef } from '../ir/types.js';

export interface PluginSchemaIR {
	collections: Record<string, CollectionDef>;
}

export interface PluginEndpoint {
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	path: string;
	handler: (request: Request, ctx: CMSContext) => Promise<Response> | Response;
}

export interface CMSPlugin {
	id: string;
	schema?: PluginSchemaIR;
	endpoints?: PluginEndpoint[];
	init?: (ctx: CMSContext) => void | Promise<void>;
	hooks?: {
		beforeWrite?: (collection: string, data: Record<string, unknown>, ctx: CMSContext) => unknown;
		afterWrite?: (collection: string, data: Record<string, unknown>, ctx: CMSContext) => unknown;
	};
}
