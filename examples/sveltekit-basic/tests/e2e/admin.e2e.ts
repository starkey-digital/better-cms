import { expect, test } from '@playwright/test';
import { BASE, createPost, login } from './fixtures.js';

const uniq = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

test.describe('admin UI — round-trip', () => {
	test('GET /collections/:name returns deserialized rows (no nulls for optional fields)', async ({
		request,
	}) => {
		await login(request);
		const slug = uniq('round-trip');
		const post = await createPost(request, {
			title: 'Round Trip',
			slug,
			// no excerpt, body, cover, authorId — all optional
			published: true,
		});

		const get = await request.get(`${BASE}/collections/posts/${post.id}`);
		expect(get.status()).toBe(200);
		const body = (await get.json()) as {
			row: {
				id: string;
				title: string;
				slug: string;
				published: boolean;
				excerpt?: unknown;
				body?: unknown;
				cover?: unknown;
				authorId?: unknown;
			};
		};
		// Booleans round-trip as boolean, not 0/1.
		expect(body.row.published).toBe(true);
		expect(typeof body.row.published).toBe('boolean');
		// Optional fields absent or undefined — never null.
		expect(body.row.excerpt).not.toBeNull();
		expect(body.row.body).not.toBeNull();
		expect(body.row.cover).not.toBeNull();
		expect(body.row.authorId).not.toBeNull();
	});

	test('admin save flow: read → edit → update validates without null/integer noise', async ({
		request,
	}) => {
		await login(request);
		const slug = uniq('admin-edit');
		const created = await createPost(request, {
			title: 'Original',
			slug,
			published: false,
		});

		// Simulate what the admin form does: load the row, mutate one field, send back via /ops {set}.
		const fetched = await request.get(`${BASE}/collections/posts/${created.id}`);
		const { row } = (await fetched.json()) as { row: Record<string, unknown> };

		const edited = { ...row, title: 'Edited via Admin' };
		const r = await request.post(`${BASE}/ops`, {
			data: {
				ops: [{ op: 'set', collection: 'posts', id: created.id, data: edited }],
			},
		});
		expect(r.status()).toBe(200);
		const body = (await r.json()) as {
			results: { ok: boolean; error?: { message: string }; row?: { title: string } }[];
		};
		expect(body.results[0]?.ok).toBe(true);
		expect(body.results[0]?.error).toBeUndefined();
		expect(body.results[0]?.row?.title).toBe('Edited via Admin');
	});

	test('admin form: change a single boolean (published) round-trips cleanly', async ({
		request,
	}) => {
		await login(request);
		const slug = uniq('toggle-pub');
		const created = await createPost(request, {
			title: 'Toggle',
			slug,
			published: false,
		});

		const fetched = await request.get(`${BASE}/collections/posts/${created.id}`);
		const { row } = (await fetched.json()) as { row: Record<string, unknown> };

		const toggled = { ...row, published: true };
		const r = await request.post(`${BASE}/ops`, {
			data: {
				ops: [{ op: 'set', collection: 'posts', id: created.id, data: toggled }],
			},
		});
		const body = (await r.json()) as {
			results: { ok: boolean; error?: { message: string } }[];
		};
		expect(body.results[0]?.ok).toBe(true);
		expect(body.results[0]?.error).toBeUndefined();
	});

	test('admin form: page renders editor for posts after login', async ({ page, request }) => {
		await login(request);
		await createPost(request, { title: 'Editable', slug: uniq('editable'), published: false });

		// Login via page.request so the navigation inherits the session cookie.
		await login(page.request);
		await page.goto('/cms');
		// Sidebar shows posts/settings/secrets.
		const nav = page.locator('aside.bcms-sidebar nav');
		await expect(nav.getByRole('button', { name: /posts/i })).toBeVisible();
		await expect(nav.getByRole('button', { name: /settings/i })).toBeVisible();
	});
});
