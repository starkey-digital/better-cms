import type { Access, AccessFn, AuthContextFn } from './auth/types.js';
import type { LiveTransport } from './handler/live.js';
import type { CollectionDef, HooksIR, InferRows, SchemaIR } from './ir/types.js';
import type { CmsPlugin } from './plugin/types.js';
import type { ContentStore } from './store/content.js';
import type { MediaStore } from './store/media.js';

export type CollectionsRecord = Record<string, CollectionDef<any, any>>;

/** 10 MiB. Generous for images, small enough that an unconfigured bucket is not a billing hazard. */
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Images and PDFs — what a CMS asset picker actually needs. Widen deliberately. */
export const DEFAULT_UPLOAD_MIME_TYPES = ['image/*', 'application/pdf'] as const;

/**
 * Upload policy for `POST /media`.
 *
 * Deliberately its own slot rather than something inferred from collection
 * `create` policies: permission to create a comment says nothing about
 * permission to write arbitrary bytes into the asset bucket, and treating the
 * two as equivalent turns any publicly-writable collection into an open
 * upload endpoint.
 */
export interface MediaAccessConfig<Ctx = unknown> {
	/**
	 * Who may upload. **Defaults to deny** — uploading is unauthenticated
	 * file hosting until you say otherwise.
	 */
	upload?: AccessFn<Ctx>;
	/** Reject bodies larger than this. Defaults to {@link DEFAULT_MAX_UPLOAD_BYTES}; `0` disables the check. */
	maxBytes?: number;
	/**
	 * Accepted MIME types — exact (`image/png`) or wildcard (`image/*`).
	 * Defaults to {@link DEFAULT_UPLOAD_MIME_TYPES}; an empty array accepts anything.
	 */
	mimeTypes?: readonly string[];
}

export interface CmsConfig<C extends CollectionsRecord = CollectionsRecord, Ctx = unknown> {
	collections: C;
	adapter: ContentStore;
	media?: MediaStore;
	/** Upload authorization and limits for `POST /media`. Uploads are denied when this is absent. */
	mediaAccess?: MediaAccessConfig<Ctx>;
	auth?: { context: AuthContextFn<Ctx> };
	/** Global default access policies. Per-collection `access` slots override per verb. */
	access?: Access<Ctx>;
	/** Global lifecycle hooks. Fire before per-collection hooks. */
	hooks?: HooksIR<Ctx>;
	plugins?: CmsPlugin[];
	basePath?: string;
	live?: boolean;
}

export interface CmsContext<C extends CollectionsRecord = CollectionsRecord> {
	config: CmsConfig<any, any>;
	schema: SchemaIR<C>;
	store: ContentStore;
	media?: MediaStore;
	/** Broadcast channel for live preview / inline-edit fan-out. Every write through the API publishes here. */
	live: LiveTransport;
}

export type InferConfig<Cfg> = Cfg extends CmsConfig<infer C> ? InferRows<SchemaIR<C>> : never;
