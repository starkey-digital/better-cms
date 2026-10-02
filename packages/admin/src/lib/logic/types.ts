import type { CmsMetaCollection, CmsMetaField } from '@better-cms/sveltekit';

export type Row = Record<string, unknown>;
export type { CmsMetaCollection, CmsMetaField };

/** The slice of a collection's client API the admin calls. */
export type RecordApi = {
	get(idOrSlug?: string): Promise<Row | null>;
	list(opts?: { limit?: number }): Promise<Row[]>;
	listPage(opts?: {
		limit?: number;
		offset?: number;
		sort?: { field: string; direction?: 'asc' | 'desc' };
	}): Promise<{ rows: Row[]; total: number; limit: number; offset: number }>;
	set(data: Row): Promise<Row>;
	create(data: Row): Promise<Row>;
	update(id: string, data: Row): Promise<Row>;
	delete(id: string): Promise<void>;
};

export type AdminClient = {
	uploadMedia(file: File | Blob, folder?: string): Promise<{ key: string; url: string }>;
	[k: string]: unknown;
};

export const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);
