import { expect, test } from '@playwright/test';
import { BASE, createPost, login, logout } from './fixtures.js';

const uniq = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function createSecret(
	request: import('@playwright/test').APIRequestContext,
	data: { name: string; value: string },
) {
	const res = await request.post(`${BASE}/ops`, {
		data: { ops: [{ op: 'create', collection: 'secrets', data }] },
	});
	const body = (await res.json()) as {
		results: { ok: boolean; row?: { id: string }; error?: { code: string; message: string } }[];
	};
	return body.results[0]!;
}

test.describe('access — global rules (read=allow, writes=admin)', () => {
	test('anon list posts → 200', async ({ request }) => {
		await logout(request);
		const r = await request.get(`${BASE}/collections/posts`);
		expect(r.status()).toBe(200);
	});

	test('anon read post by id → 200', async ({ request }) => {
		await login(request);
		const slug = uniq('anon-read');
		const post = await createPost(request, { title: 'Anon-readable', slug, published: true });
		await logout(request);

		const r = await request.get(`${BASE}/collections/posts/${post.id}`);
		expect(r.status()).toBe(200);
	});

	test('anon create post via /ops → FORBIDDEN', async ({ request }) => {
		await logout(request);
		const r = await request.post(`${BASE}/ops`, {
			data: {
				ops: [
					{
						op: 'create',
						collection: 'posts',
						data: { title: 'Anon Should Fail', slug: uniq('anon-fail'), published: false },
					},
				],
			},
		});
		const body = (await r.json()) as { results: { ok: boolean; error?: { code: string } }[] };
		expect(body.results[0]?.ok).toBe(false);
		expect(body.results[0]?.error?.code).toBe('FORBIDDEN');
	});

	test('admin create post → ok', async ({ request }) => {
		await login(request);
		const post = await createPost(request, { title: 'Admin OK', slug: uniq('admin-ok') });
		expect(post.id).toBeTruthy();
	});

	test('anon update post via /ops → FORBIDDEN', async ({ request }) => {
		await login(request);
		const post = await createPost(request, { title: 'Will Stay', slug: uniq('stay'), published: true });
		await logout(request);

		const r = await request.post(`${BASE}/ops`, {
			data: {
				ops: [{ op: 'set', collection: 'posts', id: post.id, data: { title: 'hijacked' } }],
			},
		});
		const body = (await r.json()) as { results: { ok: boolean; error?: { code: string } }[] };
		expect(body.results[0]?.ok).toBe(false);
		expect(body.results[0]?.error?.code).toBe('FORBIDDEN');
	});
});

test.describe('access — per-collection override (secrets)', () => {
	test('anon list secrets → 404 (leak-free)', async ({ request }) => {
		await logout(request);
		const r = await request.get(`${BASE}/collections/secrets`);
		expect(r.status()).toBe(404);
	});

	test('anon read secret by id → 404 even when row exists', async ({ request }) => {
		await login(request);
		const created = await createSecret(request, {
			name: uniq('secret'),
			value: 'top-secret-value',
		});
		expect(created.ok).toBe(true);
		const id = created.row!.id;

		await logout(request);
		const r = await request.get(`${BASE}/collections/secrets/${id}`);
		expect(r.status()).toBe(404);
	});

	test('admin list secrets → 200', async ({ request }) => {
		await login(request);
		const r = await request.get(`${BASE}/collections/secrets`);
		expect(r.status()).toBe(200);
	});

	test('admin read secret → 200', async ({ request }) => {
		await login(request);
		const created = await createSecret(request, {
			name: uniq('admin-readable'),
			value: 'visible',
		});
		expect(created.ok).toBe(true);

		const r = await request.get(`${BASE}/collections/secrets/${created.row!.id}`);
		expect(r.status()).toBe(200);
		const body = (await r.json()) as { row: { value: string } };
		expect(body.row.value).toBe('visible');
	});
});

test.describe('hooks — beforeDelete aborts published-post removal', () => {
	test('admin delete published post → op fails with hook message', async ({ request }) => {
		await login(request);
		const post = await createPost(request, {
			title: 'Pinned Post',
			slug: uniq('pinned'),
			published: true,
		});

		const r = await request.post(`${BASE}/ops`, {
			data: { ops: [{ op: 'remove', collection: 'posts', id: post.id }] },
		});
		const body = (await r.json()) as { results: { ok: boolean; error?: { message: string } }[] };
		expect(body.results[0]?.ok).toBe(false);
		expect(body.results[0]?.error?.message).toContain('published');
	});

	test('admin delete draft post → ok', async ({ request }) => {
		await login(request);
		const post = await createPost(request, {
			title: 'Draft Goes',
			slug: uniq('draft'),
			published: false,
		});

		const r = await request.post(`${BASE}/ops`, {
			data: { ops: [{ op: 'remove', collection: 'posts', id: post.id }] },
		});
		const body = (await r.json()) as { results: { ok: boolean }[] };
		expect(body.results[0]?.ok).toBe(true);
	});
});
