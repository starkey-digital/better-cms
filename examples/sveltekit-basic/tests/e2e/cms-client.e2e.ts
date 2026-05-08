import { expect, test } from '@playwright/test';
import { BASE, createPost, login, logout } from './fixtures.js';

test.describe('cmsClient (generated)', () => {
	test('cmsClient.posts.get(slug) renders SSR via /posts/[slug]', async ({ page, request }) => {
		await login(request);
		await createPost(request, {
			title: 'Slug Reader',
			slug: 'slug-reader',
			excerpt: 'Resolves via slug',
		});

		await page.goto('/posts/slug-reader');
		await expect(page.getByRole('heading', { name: 'Slug Reader' })).toBeVisible();
		await expect(page.getByText('Resolves via slug')).toBeVisible();
	});

	test('cmsClient.posts.get(slug) — non-existent slug shows fallback', async ({ page }) => {
		await page.goto('/posts/does-not-exist-zzz');
		await expect(page.getByText('Post not found.')).toBeVisible();
	});

	test('navigating between slugs renders fresh content', async ({ page, request }) => {
		await login(request);
		await createPost(request, { title: 'First Nav', slug: 'first-nav', excerpt: 'Alpha' });
		await createPost(request, { title: 'Second Nav', slug: 'second-nav', excerpt: 'Beta' });

		await page.goto('/posts/first-nav');
		await expect(page.getByRole('heading', { name: 'First Nav' })).toBeVisible();
		await expect(page.getByText('Alpha')).toBeVisible();

		await page.goto('/posts/second-nav');
		await expect(page.getByRole('heading', { name: 'Second Nav' })).toBeVisible();
		await expect(page.getByText('Beta')).toBeVisible();
	});
});

test.describe('cms HTTP API surface', () => {
	test('GET /collections/:name with where filter returns matching rows', async ({ request }) => {
		await login(request);
		await createPost(request, { title: 'Filter Test A', slug: 'filter-a', published: true });
		await createPost(request, { title: 'Filter Test B', slug: 'filter-b', published: false });

		const res = await request.get(`${BASE}/collections/posts?where[slug]=filter-a`);
		const body = (await res.json()) as { rows: { slug: string }[] };
		expect(body.rows.length).toBe(1);
		expect(body.rows[0]!.slug).toBe('filter-a');
	});

	test('GET /collections/:name?count=1 returns total without rows', async ({ request }) => {
		await login(request);
		const res = await request.get(`${BASE}/collections/posts?count=1`);
		const body = (await res.json()) as { count: number };
		expect(body.count).toBeGreaterThan(0);
		expect(body).not.toHaveProperty('rows');
	});

	test('GET /collections/:name?count=1&where[published]=true coerces booleans', async ({
		request,
	}) => {
		await login(request);
		await createPost(request, { title: 'Pub', slug: 'pub-coerce', published: true });
		await createPost(request, { title: 'Draft', slug: 'draft-coerce', published: false });

		const pub = await request.get(`${BASE}/collections/posts?count=1&where[published]=true`);
		const draft = await request.get(`${BASE}/collections/posts?count=1&where[published]=false`);
		const pubBody = (await pub.json()) as { count: number };
		const draftBody = (await draft.json()) as { count: number };

		expect(pubBody.count).toBeGreaterThan(0);
		expect(draftBody.count).toBeGreaterThanOrEqual(1);
	});

	test('singletons round-trip via PUT then GET', async ({ request }) => {
		await login(request);
		const put = await request.put(`${BASE}/singletons/settings`, {
			data: { siteTitle: 'E2E Site', tagline: 'Played by Playwright' },
		});
		expect(put.status()).toBe(200);

		const get = await request.get(`${BASE}/singletons/settings`);
		const body = (await get.json()) as { row: { siteTitle: string; tagline: string } };
		expect(body.row.siteTitle).toBe('E2E Site');
		expect(body.row.tagline).toBe('Played by Playwright');
	});

	test('unauthenticated singletons PUT is rejected', async ({ request }) => {
		await logout(request);
		const put = await request.put(`${BASE}/singletons/settings`, {
			data: { siteTitle: 'Anon Attempt' },
		});
		expect(put.status()).toBe(401);
	});
});
