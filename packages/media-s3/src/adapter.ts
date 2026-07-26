import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
	type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { MediaListPage, MediaObject, MediaPutOpts, MediaStore } from '@better-cms/core';
import { extensionForMime, generateId } from '@better-cms/core';

export interface S3MediaOpts {
	bucket: string;
	region?: string;
	endpoint?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	/** Public-facing base URL (CDN or bucket domain). Used to construct returned `url`. */
	publicBaseUrl?: string;
	/** Force-path-style addressing — required for Wasabi/B2/MinIO. Defaults to true if endpoint set. */
	forcePathStyle?: boolean;
	/** Default folder prefix for all objects. */
	defaultFolder?: string;
	client?: S3Client;
}

export function s3Media(opts: S3MediaOpts): MediaStore {
	const cfg: S3ClientConfig = {
		region: opts.region ?? 'auto',
		forcePathStyle: opts.forcePathStyle ?? Boolean(opts.endpoint),
	};
	if (opts.endpoint) cfg.endpoint = opts.endpoint;
	if (opts.accessKeyId && opts.secretAccessKey) {
		cfg.credentials = {
			accessKeyId: opts.accessKeyId,
			secretAccessKey: opts.secretAccessKey,
		};
	}
	const client = opts.client ?? new S3Client(cfg);

	// Precompute once so hot-path closures never repeat the replace call.
	const baseUrl = opts.publicBaseUrl?.replace(/\/$/, '');
	const endpointBase = opts.endpoint?.replace(/\/$/, '');
	const defaultFolderBase = opts.defaultFolder?.replace(/\/$/, '');

	function publicUrl(key: string): string {
		if (baseUrl) return `${baseUrl}/${key}`;
		if (endpointBase) return `${endpointBase}/${opts.bucket}/${key}`;
		return `https://${opts.bucket}.s3.${opts.region ?? 'us-east-1'}.amazonaws.com/${key}`;
	}

	function buildKey(
		givenKey: string | undefined,
		folder: string | undefined,
		mime: string,
	): string {
		if (givenKey) return givenKey;
		const ext = extensionForMime(mime);
		const f =
			(folder ?? defaultFolderBase) ? (folder?.replace(/\/$/, '') ?? defaultFolderBase) : undefined;
		const id = generateId();
		return f ? `${f}/${id}.${ext}` : `${id}.${ext}`;
	}

	function describeBody(body: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>): {
		Body: Uint8Array | Blob | ReadableStream<Uint8Array>;
		ContentLength?: number;
	} {
		if (body instanceof Uint8Array) return { Body: body, ContentLength: body.byteLength };
		if (body instanceof ArrayBuffer) {
			const u8 = new Uint8Array(body);
			return { Body: u8, ContentLength: u8.byteLength };
		}
		if (body instanceof Blob) {
			return { Body: body, ContentLength: body.size };
		}
		return { Body: body };
	}

	return {
		async put(body, putOpts: MediaPutOpts = {}) {
			const desc = describeBody(body);
			const blobMime = body instanceof Blob ? body.type || undefined : undefined;
			const mime = putOpts.mime ?? blobMime ?? 'application/octet-stream';
			const key = buildKey(putOpts.key, putOpts.folder, mime);
			await client.send(
				new PutObjectCommand({
					Bucket: opts.bucket,
					Key: key,
					Body: desc.Body,
					ContentLength: desc.ContentLength,
					ContentType: mime,
					CacheControl: putOpts.cacheControl,
					Metadata: putOpts.metadata,
					ACL: putOpts.publicRead ? 'public-read' : undefined,
				}),
			);
			return {
				key,
				url: publicUrl(key),
				mime,
				size: desc.ContentLength ?? 0,
			} satisfies MediaObject;
		},

		async delete(key) {
			await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }));
		},

		async get(key) {
			const res = await client.send(new GetObjectCommand({ Bucket: opts.bucket, Key: key }));
			if (!res.Body) return null;
			return {
				body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
				mime: res.ContentType ?? 'application/octet-stream',
			};
		},

		async presign(key, op, ttlSeconds = 300) {
			const cmd =
				op === 'read'
					? new GetObjectCommand({ Bucket: opts.bucket, Key: key })
					: new PutObjectCommand({ Bucket: opts.bucket, Key: key });
			return getSignedUrl(client, cmd, { expiresIn: ttlSeconds });
		},

		async list(prefix, cursor, limit = 100): Promise<MediaListPage> {
			const res = await client.send(
				new ListObjectsV2Command({
					Bucket: opts.bucket,
					Prefix: prefix,
					ContinuationToken: cursor,
					MaxKeys: limit,
				}),
			);
			const items: MediaObject[] = (res.Contents ?? []).map((o) => ({
				key: o.Key ?? '',
				url: publicUrl(o.Key ?? ''),
				mime: 'application/octet-stream',
				size: o.Size ?? 0,
				etag: o.ETag,
				lastModified: o.LastModified,
			}));
			return { items, cursor: res.NextContinuationToken };
		},

		async close() {
			client.destroy();
		},
	};
}
