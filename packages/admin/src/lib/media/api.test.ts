import { describe, expect, test } from 'bun:test';
import { MediaError, createMediaApi, plainError } from './api.js';

describe('plainError', () => {
	test('too big, wrong type, not allowed, generic', () => {
		expect(plainError(400, 'file is 99 bytes; the limit is 10', 'upload').message).toMatch(
			/too big/,
		);
		expect(plainError(400, 'mime type "x" is not accepted', 'upload').message).toMatch(
			/not allowed here/,
		);
		expect(plainError(403, 'media upload denied', 'upload')).toMatchObject({ retryable: false });
		expect(plainError(500, 'boom', 'upload')).toMatchObject({ retryable: true });
	});
});

describe('createMediaApi', () => {
	test('upload posts the file and alt, and offline is a retryable plain error', async () => {
		let body: FormData | undefined;
		const api = createMediaApi('/api/cms', (async (_u: string, init: RequestInit) => {
			body = init.body as FormData;
			return Response.json({ id: '1', key: 'k', url: 'u' });
		}) as never);
		await api.upload(new Blob(['x']), { alt: 'A cat', name: 'a.webp' });
		expect(body!.get('alt')).toBe('A cat');

		const offline = createMediaApi('/api/cms', (async () => {
			throw new TypeError('network');
		}) as never);
		const err = await offline.upload(new Blob(['x']), {}).catch((e) => e);
		expect(err).toBeInstanceOf(MediaError);
		expect(err.retryable).toBe(true);
	});

	test('list passes the cursor and maps 403', async () => {
		let url = '';
		const api = createMediaApi('/api/cms', (async (u: string) => {
			url = u;
			return Response.json({ error: { message: 'media list denied' } }, { status: 403 });
		}) as never);
		const err = await api.list('48').catch((e) => e);
		expect(url).toBe('/api/cms/media?cursor=48');
		expect(err.message).toMatch(/not allowed/);
	});
});
