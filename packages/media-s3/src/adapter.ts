import type { MediaListPage, MediaObject, MediaPutOpts, MediaStore } from '@better-cms/core';
import { extensionForMime, generateId } from '@better-cms/core';
import { AwsClient } from 'aws4fetch';

export interface S3MediaOpts {
	bucket: string;
	/** Signing region. Defaults to `auto` with a custom `endpoint` (R2), else `us-east-1`. Wasabi/B2 need the real region. */
	region?: string;
	endpoint?: string;
	/** Falls back to `AWS_ACCESS_KEY_ID` when unset (Node only; Workers pass explicit credentials). */
	accessKeyId?: string;
	/** Falls back to `AWS_SECRET_ACCESS_KEY` when unset. */
	secretAccessKey?: string;
	sessionToken?: string;
	/** Public-facing base URL (CDN or bucket domain). Used to construct returned `url`. */
	publicBaseUrl?: string;
	/** Force-path-style addressing — required for Wasabi/B2/MinIO/R2. Defaults to true if endpoint set. */
	forcePathStyle?: boolean;
	/** Default folder prefix for all objects. */
	defaultFolder?: string;
	/** Bring your own signer, e.g. to share one `AwsClient` across the app. */
	client?: AwsClient;
}

const XML_ENTITIES: Record<string, string> = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&apos;': "'",
};

function xmlText(xml: string, tag: string): string | undefined {
	const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
	if (!m) return undefined;
	return m[1]!.replace(/&(?:amp|lt|gt|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (e, dec, hex) =>
		dec
			? String.fromCodePoint(Number(dec))
			: hex
				? String.fromCodePoint(Number.parseInt(hex, 16))
				: XML_ENTITIES[e]!,
	);
}

async function toBytes(
	body: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
	if (body instanceof Uint8Array) return body;
	if (body instanceof ArrayBuffer) return new Uint8Array(body);
	if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
	return new Uint8Array(await new Response(body).arrayBuffer());
}

export function s3Media(opts: S3MediaOpts): MediaStore {
	const env = typeof process !== 'undefined' ? process.env : undefined;
	let signer = opts.client;
	// Built on first use: a missing credential should fail the request that needs
	// it, not the import of the config module (which tooling loads without a bucket).
	function aws(): AwsClient {
		if (signer) return signer;
		const accessKeyId = opts.accessKeyId ?? env?.AWS_ACCESS_KEY_ID;
		const secretAccessKey = opts.secretAccessKey ?? env?.AWS_SECRET_ACCESS_KEY;
		if (!accessKeyId || !secretAccessKey) {
			throw new Error('s3Media: accessKeyId and secretAccessKey are required');
		}
		signer = new AwsClient({
			accessKeyId,
			secretAccessKey,
			sessionToken: opts.sessionToken ?? env?.AWS_SESSION_TOKEN,
			service: 's3',
			region: opts.region ?? (opts.endpoint ? 'auto' : 'us-east-1'),
		});
		return signer;
	}

	const baseUrl = opts.publicBaseUrl?.replace(/\/$/, '');
	const endpointBase = opts.endpoint?.replace(/\/$/, '');
	const defaultFolderBase = opts.defaultFolder?.replace(/\/$/, '');
	const pathStyle = opts.forcePathStyle ?? Boolean(opts.endpoint);

	// A `.`/`..` segment is collapsed by URL parsing, which would sign a request for a different path (another bucket, with path-style endpoints).
	const encodeKey = (key: string) =>
		key
			.split('/')
			.map((seg) => {
				if (seg === '.' || seg === '..') throw new Error(`invalid object key "${key}"`);
				return encodeURIComponent(seg);
			})
			.join('/');

	function publicUrl(key: string): string {
		if (baseUrl) return `${baseUrl}/${key}`;
		if (endpointBase) return `${endpointBase}/${opts.bucket}/${key}`;
		return `https://${opts.bucket}.s3.${opts.region ?? 'us-east-1'}.amazonaws.com/${key}`;
	}

	/** Bucket root URL (no trailing slash) for the request API, honouring path vs virtual-hosted style. */
	function bucketUrl(): string {
		if (pathStyle) {
			const base = endpointBase ?? `https://s3.${opts.region ?? 'us-east-1'}.amazonaws.com`;
			return `${base}/${opts.bucket}`;
		}
		if (endpointBase) {
			const u = new URL(endpointBase);
			return `${u.protocol}//${opts.bucket}.${u.host}`;
		}
		return `https://${opts.bucket}.s3.${opts.region ?? 'us-east-1'}.amazonaws.com`;
	}

	const objectUrl = (key: string) => `${bucketUrl()}/${encodeKey(key)}`;

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

	async function request(url: string, init: RequestInit): Promise<Response> {
		return aws().fetch(url, init);
	}

	async function fail(op: string, res: Response): Promise<never> {
		throw new Error(`s3Media ${op} failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
	}

	return {
		async put(body, putOpts: MediaPutOpts = {}) {
			const blobMime = body instanceof Blob ? body.type || undefined : undefined;
			const mime = putOpts.mime ?? blobMime ?? 'application/octet-stream';
			const key = buildKey(putOpts.key, putOpts.folder, mime);
			const bytes = await toBytes(body);
			const headers: Record<string, string> = { 'content-type': mime };
			if (putOpts.cacheControl) headers['cache-control'] = putOpts.cacheControl;
			if (putOpts.publicRead) headers['x-amz-acl'] = 'public-read';
			for (const [k, v] of Object.entries(putOpts.metadata ?? {})) {
				headers[`x-amz-meta-${k.toLowerCase()}`] = v;
			}
			const res = await request(objectUrl(key), {
				method: 'PUT',
				headers,
				body: bytes as BufferSource,
			});
			if (!res.ok) await fail('put', res);
			return { key, url: publicUrl(key), mime, size: bytes.byteLength } satisfies MediaObject;
		},

		async delete(key) {
			const res = await request(objectUrl(key), { method: 'DELETE' });
			// S3 answers 204 for a missing key; a 404 means the bucket-level path is absent.
			if (!res.ok && res.status !== 404) await fail('delete', res);
			await res.body?.cancel();
		},

		async get(key) {
			const res = await request(objectUrl(key), { method: 'GET' });
			if (res.status === 404) {
				await res.body?.cancel();
				return null;
			}
			if (!res.ok) await fail('get', res);
			if (!res.body) return null;
			return {
				body: res.body as ReadableStream<Uint8Array>,
				mime: res.headers.get('content-type') ?? 'application/octet-stream',
			};
		},

		async presign(key, op, ttlSeconds = 300) {
			const url = new URL(objectUrl(key));
			url.searchParams.set('X-Amz-Expires', String(ttlSeconds));
			const signed = await aws().sign(url.toString(), {
				method: op === 'read' ? 'GET' : 'PUT',
				aws: { signQuery: true },
			});
			return signed.url;
		},

		async list(prefix, cursor, limit = 100): Promise<MediaListPage> {
			const url = new URL(`${bucketUrl()}/`);
			url.searchParams.set('list-type', '2');
			url.searchParams.set('max-keys', String(limit));
			if (prefix) url.searchParams.set('prefix', prefix);
			if (cursor) url.searchParams.set('continuation-token', cursor);
			const res = await request(url.toString(), { method: 'GET' });
			if (!res.ok) await fail('list', res);
			const xml = await res.text();
			const items: MediaObject[] = [];
			for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
				const block = m[1]!;
				const key = xmlText(block, 'Key') ?? '';
				const modified = xmlText(block, 'LastModified');
				items.push({
					key,
					url: publicUrl(key),
					mime: 'application/octet-stream',
					size: Number(xmlText(block, 'Size') ?? 0),
					etag: xmlText(block, 'ETag'),
					lastModified: modified ? new Date(modified) : undefined,
				});
			}
			return { items, cursor: xmlText(xml, 'NextContinuationToken') };
		},
	};
}
