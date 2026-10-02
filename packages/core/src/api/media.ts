import type { CmsContext, MediaAccessConfig } from '../config.js';
import { DEFAULT_MAX_UPLOAD_BYTES, DEFAULT_UPLOAD_MIME_TYPES } from '../config.js';
import type { Row } from '../store/content.js';
import { generateId } from '../util/id.js';
import { imageSize } from '../util/image-size.js';
import { contentKey } from '../util/media-key.js';
import { errors } from '../util/result.js';
import type { CtxResolver } from './types.js';

/** A library item as the API returns it. */
export interface MediaItem {
	id: string;
	key: string;
	url: string;
	mime: string;
	size: number;
	width: number | null;
	height: number | null;
	alt: string;
	/** Epoch milliseconds. */
	createdAt: number;
}

export interface MediaListResult {
	items: MediaItem[];
	/** Pass back as `cursor` for the next page; absent on the last page. */
	cursor?: string;
}

export interface MediaApi {
	/** Throws FORBIDDEN unless the caller may upload. Lets a transport refuse before it reads a large body. */
	assertCanUpload(): Promise<void>;
	upload(file: Blob, opts?: { folder?: string; alt?: string }): Promise<MediaItem>;
	list(opts?: { limit?: number; cursor?: string }): Promise<MediaListResult>;
	remove(id: string): Promise<void>;
}

const DEFAULT_PAGE = 48;
const MAX_PAGE = 200;
const MAX_ALT = 500;

type Policy = (ctx: unknown) => boolean | Promise<boolean>;

function toItem(row: Row): MediaItem {
	const at = row.createdAt;
	return {
		id: String(row.id),
		key: String(row.key),
		url: String(row.url),
		mime: String(row.mime ?? 'application/octet-stream'),
		size: Number(row.size ?? 0),
		width: row.width == null ? null : Number(row.width),
		height: row.height == null ? null : Number(row.height),
		alt: typeof row.alt === 'string' ? row.alt : '',
		createdAt:
			at instanceof Date ? at.getTime() : typeof at === 'string' ? Date.parse(at) : Number(at ?? 0),
	};
}

/**
 * The only reader and writer of `cms_media` rows. Each operation has its own
 * policy and the access check runs before the store check, so an anonymous
 * caller cannot probe whether media is configured.
 */
export function createMediaApi(context: CmsContext, resolveCtx: CtxResolver): MediaApi {
	const { store } = context;
	const access = context.config.mediaAccess as MediaAccessConfig | undefined;

	async function authorize(policy: Policy | undefined, what: string) {
		if (!policy || !(await policy(await resolveCtx()))) {
			throw errors.forbidden(`media ${what} denied`);
		}
	}
	const requireMedia = () => {
		if (!context.media) throw errors.badRequest('media store not configured');
		return context.media;
	};

	const assertCanUpload = () => authorize(access?.upload as Policy | undefined, 'upload');

	return {
		assertCanUpload,
		async upload(file, opts = {}) {
			await assertCanUpload();
			const media = requireMedia();
			assertUploadAllowed(access, file);

			const alt = (opts.alt ?? '').trim().slice(0, MAX_ALT);
			const mime = file.type || 'application/octet-stream';
			// Content-addressed key: retries overwrite the same object, and the same
			// bytes uploaded twice share one. Safe to buffer — size is already capped.
			const bytes = new Uint8Array(await file.arrayBuffer());
			const key = await contentKey(bytes, mime, opts.folder);

			// The same bytes are already in the library: reuse the row. Falling
			// through would hit the unique key and the cleanup below would delete a
			// blob the existing row still points at.
			const existing = await store.findOne('cms_media', { key });
			if (existing) {
				if (!alt) return toItem(existing);
				const had = typeof existing.alt === 'string' && existing.alt !== '';
				// The row is shared with every field that already uses it, so only an
				// empty description is filled in; a different one is returned for this
				// caller's field without rewriting what the others show.
				if (had) return { ...toItem(existing), alt };
				await store.update('cms_media', { id: existing.id }, { alt });
				return { ...toItem(existing), alt };
			}

			const object = await media.put(bytes, { key, mime });
			const size = imageSize(bytes, mime);
			const row: Row = {
				id: generateId(),
				key: object.key,
				url: object.url,
				mime: object.mime,
				size: object.size,
				width: size?.width ?? object.width ?? null,
				height: size?.height ?? object.height ?? null,
				alt: alt || null,
				createdAt: Date.now(),
			};

			// Blob first, then row. If the row fails, delete the blob so nothing is
			// left unreferenced; `bcms media:gc` reclaims it if even that fails.
			try {
				await store.create('cms_media', row);
			} catch (e) {
				try {
					await media.delete(object.key);
				} catch (cleanupError) {
					console.error(
						`[better-cms] uploaded object "${object.key}" was orphaned — its metadata insert failed and the cleanup delete also failed:`,
						cleanupError,
					);
				}
				throw e;
			}
			return toItem(row);
		},

		async list(opts = {}) {
			await authorize((access?.list ?? access?.upload) as Policy | undefined, 'list');
			requireMedia();

			const limit = Math.min(MAX_PAGE, Math.max(1, Number(opts.limit) || DEFAULT_PAGE));
			const offset = Math.max(0, Number(opts.cursor) || 0);
			// One extra row tells us whether another page exists without a count query.
			const rows = await store.findMany('cms_media', {
				orderBy: [
					{ field: 'createdAt', dir: 'desc' },
					{ field: 'id', dir: 'desc' },
				],
				limit: limit + 1,
				offset,
			});
			return {
				items: rows.slice(0, limit).map(toItem),
				cursor: rows.length > limit ? String(offset + limit) : undefined,
			};
		},

		async remove(id) {
			await authorize(access?.delete as Policy | undefined, 'delete');
			const media = requireMedia();
			const row = await store.findOne('cms_media', { id });
			if (!row) throw errors.notFound('media');
			// Row first: a blob with no row is reclaimable by `media:gc`; a row
			// pointing at a missing blob is a broken picture in the picker.
			await store.delete('cms_media', { id });
			await media.delete(String(row.key));
		},
	};
}

/**
 * Enforce the configured size and MIME limits. Both default to something
 * restrictive: an upload endpoint with no ceiling is a storage-cost and
 * arbitrary-file-hosting problem.
 */
function assertUploadAllowed(media: MediaAccessConfig | undefined, file: Blob): void {
	const maxBytes = media?.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
	if (maxBytes > 0 && file.size > maxBytes) {
		throw errors.badRequest(`file is ${file.size} bytes; the limit is ${maxBytes}`);
	}

	const allowed = media?.mimeTypes ?? DEFAULT_UPLOAD_MIME_TYPES;
	if (allowed.length === 0) return;
	const mime = file.type || 'application/octet-stream';
	const ok = allowed.some((pattern) =>
		pattern.endsWith('/*') ? mime.startsWith(pattern.slice(0, -1)) : pattern === mime,
	);
	if (!ok) throw errors.badRequest(`mime type "${mime}" is not accepted`);
}
