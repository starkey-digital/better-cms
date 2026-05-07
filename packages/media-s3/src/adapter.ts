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
import { generateId } from '@better-cms/core';

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

	function publicUrl(key: string): string {
		if (opts.publicBaseUrl) return `${opts.publicBaseUrl.replace(/\/$/, '')}/${key}`;
		if (opts.endpoint) return `${opts.endpoint.replace(/\/$/, '')}/${opts.bucket}/${key}`;
		return `https://${opts.bucket}.s3.${opts.region ?? 'us-east-1'}.amazonaws.com/${key}`;
	}

	function buildKey(
		givenKey: string | undefined,
		folder: string | undefined,
		mime: string,
	): string {
		if (givenKey) return givenKey;
		const ext = mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
		const f = folder ?? opts.defaultFolder;
		const id = generateId();
		return f ? `${f.replace(/\/$/, '')}/${id}.${ext}` : `${id}.${ext}`;
	}

	function describeBody(body: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>): {
		Body: Uint8Array | Blob | ReadableStream<Uint8Array>;
		ContentLength?: number;
		mime?: string;
	} {
		if (body instanceof Uint8Array) return { Body: body, ContentLength: body.byteLength };
		if (body instanceof ArrayBuffer) {
			const u8 = new Uint8Array(body);
			return { Body: u8, ContentLength: u8.byteLength };
		}
		if (typeof Blob !== 'undefined' && body instanceof Blob) {
			return { Body: body, ContentLength: body.size, mime: body.type || undefined };
		}
		return { Body: body };
	}

	return {
		async put(body, putOpts: MediaPutOpts = {}) {
			const desc = describeBody(body);
			const mime = putOpts.mime ?? desc.mime ?? 'application/octet-stream';
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
			}));
			return { items, cursor: res.NextContinuationToken };
		},

		async close() {
			client.destroy();
		},
	};
}
