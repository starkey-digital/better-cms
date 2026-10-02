import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { s3Media } from './adapter.js';

interface Seen {
	method: string;
	path: string;
	search: string;
	headers: Headers;
	body: Uint8Array;
}

const seen: Seen[] = [];
const objects = new Map<string, { body: Uint8Array; type: string }>();
let server: ReturnType<typeof Bun.serve>;
let endpoint: string;

beforeAll(() => {
	server = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url);
			const body = new Uint8Array(await req.arrayBuffer());
			seen.push({
				method: req.method,
				path: url.pathname,
				search: url.search,
				headers: req.headers,
				body,
			});
			const key = decodeURIComponent(url.pathname.replace(/^\/bkt\/?/, ''));
			if (req.method === 'PUT') {
				objects.set(key, { body, type: req.headers.get('content-type') ?? '' });
				return new Response(null, { status: 200 });
			}
			if (req.method === 'DELETE') {
				objects.delete(key);
				return new Response(null, { status: 204 });
			}
			if (url.searchParams.get('list-type') === '2') {
				return new Response(
					`<ListBucketResult><IsTruncated>true</IsTruncated>
<Contents><Key>a&amp;b/one.png</Key><LastModified>2026-01-02T03:04:05.000Z</LastModified><ETag>&quot;abc&quot;</ETag><Size>12</Size></Contents>
<Contents><Key>two.pdf</Key><LastModified>2026-01-03T00:00:00.000Z</LastModified><ETag>&quot;def&quot;</ETag><Size>7</Size></Contents>
<NextContinuationToken>tok==</NextContinuationToken></ListBucketResult>`,
				);
			}
			const obj = objects.get(key);
			if (!obj) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
			return new Response(obj.body as BufferSource, { headers: { 'content-type': obj.type } });
		},
	});
	endpoint = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop(true));

const creds = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' };
const last = () => seen[seen.length - 1]!;

describe('s3Media', () => {
	test('put signs with SigV4, path-style, and round-trips through get', async () => {
		const m = s3Media({ bucket: 'bkt', endpoint, ...creds });
		const out = await m.put(new Uint8Array([1, 2, 3]), {
			key: 'folder/a b+c.png',
			mime: 'image/png',
			cacheControl: 'max-age=60',
			publicRead: true,
			metadata: { Alt: 'x' },
		});
		const req = last();
		expect(req.method).toBe('PUT');
		expect(req.path).toBe('/bkt/folder/a%20b%2Bc.png');
		expect(req.headers.get('authorization')).toMatch(
			/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=.*Signature=[0-9a-f]{64}$/,
		);
		expect(req.headers.get('content-type')).toBe('image/png');
		expect(req.headers.get('cache-control')).toBe('max-age=60');
		expect(req.headers.get('x-amz-acl')).toBe('public-read');
		expect(req.headers.get('x-amz-meta-alt')).toBe('x');
		expect(req.headers.get('x-amz-content-sha256')).toBeTruthy();
		expect([...req.body]).toEqual([1, 2, 3]);
		expect(out).toEqual({
			key: 'folder/a b+c.png',
			url: `${endpoint}/bkt/folder/a b+c.png`,
			mime: 'image/png',
			size: 3,
		});

		const got = await m.get!('folder/a b+c.png');
		expect(got?.mime).toBe('image/png');
		expect([...new Uint8Array(await new Response(got!.body).arrayBuffer())]).toEqual([1, 2, 3]);
	});

	test('rejects keys with dot segments instead of letting the URL collapse them', async () => {
		const m = s3Media({ bucket: 'bkt', endpoint, ...creds });
		const before = seen.length;
		for (const key of ['../other/a.png', 'a/../../b.png', './a.png']) {
			await expect(m.put(new Uint8Array(1), { key, mime: 'image/png' })).rejects.toThrow(
				'invalid object key',
			);
		}
		await expect(m.delete('../x')).rejects.toThrow('invalid object key');
		expect(seen.length).toBe(before);
	});

	test('region is signed into the credential scope', async () => {
		await s3Media({ bucket: 'bkt', endpoint, region: 'eu-west-1', ...creds }).put(
			new Blob(['hi'], { type: 'text/plain' }),
			{ key: 'r.txt' },
		);
		expect(last().headers.get('authorization')).toContain('/eu-west-1/s3/aws4_request');
		expect(last().headers.get('content-type')).toStartWith('text/plain');
	});

	test('public URL precedence: publicBaseUrl > endpoint > AWS virtual host', async () => {
		const withBase = s3Media({
			bucket: 'bkt',
			endpoint,
			publicBaseUrl: 'https://cdn.example.com/',
			...creds,
		});
		expect((await withBase.put(new Uint8Array(1), { key: 'k.png', mime: 'image/png' })).url).toBe(
			'https://cdn.example.com/k.png',
		);
		const aws = s3Media({ bucket: 'my-bkt', region: 'eu-west-2', ...creds });
		const u = await aws.presign!('a/b.png', 'read');
		expect(u.startsWith('https://my-bkt.s3.eu-west-2.amazonaws.com/a/b.png?')).toBe(true);
	});

	test('generated keys honour folder and defaultFolder', async () => {
		const m = s3Media({ bucket: 'bkt', endpoint, defaultFolder: 'uploads/', ...creds });
		expect((await m.put(new Uint8Array(1), { mime: 'image/png' })).key).toMatch(
			/^uploads\/.+\.png$/,
		);
		expect((await m.put(new Uint8Array(1), { mime: 'image/png', folder: 'x' })).key).toMatch(
			/^x\/.+\.png$/,
		);
	});

	test('streams are buffered so the signed length is known', async () => {
		const m = s3Media({ bucket: 'bkt', endpoint, ...creds });
		const stream = new Blob([new Uint8Array([9, 9])]).stream() as ReadableStream<Uint8Array>;
		expect((await m.put(stream, { key: 's.bin' })).size).toBe(2);
	});

	test('presign emits a query-signed URL with the requested ttl and verb', async () => {
		const m = s3Media({ bucket: 'bkt', endpoint, ...creds });
		const u = new URL(await m.presign!('a.png', 'write', 120));
		expect(u.pathname).toBe('/bkt/a.png');
		expect(u.searchParams.get('X-Amz-Expires')).toBe('120');
		expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
		expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
	});

	test('list parses keys, entities, etag, size and the continuation cursor', async () => {
		const m = s3Media({ bucket: 'bkt', endpoint, ...creds });
		const page = await m.list!('a', 'prev', 2);
		expect(last().search).toContain('list-type=2');
		expect(last().search).toContain('max-keys=2');
		expect(last().search).toContain('prefix=a');
		expect(last().search).toContain('continuation-token=prev');
		expect(page.cursor).toBe('tok==');
		expect(page.items.map((i) => [i.key, i.size, i.etag])).toEqual([
			['a&b/one.png', 12, '"abc"'],
			['two.pdf', 7, '"def"'],
		]);
		expect(page.items[0]!.lastModified?.toISOString()).toBe('2026-01-02T03:04:05.000Z');
	});

	test('get of a missing key is null; delete tolerates 404 and removes', async () => {
		const m = s3Media({ bucket: 'bkt', endpoint, ...creds });
		expect(await m.get!('nope')).toBeNull();
		await m.put(new Uint8Array(1), { key: 'gone.png' });
		await m.delete('gone.png');
		expect(objects.has('gone.png')).toBe(false);
	});

	test('missing credentials fail on use, not at construction', async () => {
		const saved = [process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY];
		Reflect.deleteProperty(process.env, 'AWS_ACCESS_KEY_ID');
		Reflect.deleteProperty(process.env, 'AWS_SECRET_ACCESS_KEY');
		try {
			const m = s3Media({ bucket: 'bkt', endpoint });
			await expect(m.delete('x')).rejects.toThrow(/accessKeyId/);
		} finally {
			if (saved[0]) process.env.AWS_ACCESS_KEY_ID = saved[0];
			if (saved[1]) process.env.AWS_SECRET_ACCESS_KEY = saved[1];
		}
	});

	test('non-2xx surfaces status and body', async () => {
		const bad = Bun.serve({ port: 0, fetch: () => new Response('denied', { status: 403 }) });
		try {
			const m2 = s3Media({ bucket: 'bkt', endpoint: `http://127.0.0.1:${bad.port}`, ...creds });
			await expect(m2.put(new Uint8Array(1), { key: 'x' })).rejects.toThrow(
				/put failed \(403\): denied/,
			);
		} finally {
			bad.stop(true);
		}
	});
});
