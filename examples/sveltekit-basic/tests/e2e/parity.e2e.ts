import { expect, test } from '@playwright/test';
import { BASE, createPost, login } from './fixtures';

/**
 * The in-process API (`cms.posts.list()`) and the HTTP endpoints are now the
 * same implementation. These tests pin the two properties that used to differ
 * silently: decoded value shapes, and access enforcement.
 */
test.describe('server API / HTTP parity', () => {
	test('SSR-rendered rows carry decoded types, not raw column values', async ({
		page,
		request,
	}) => {
		await login(request);
		const slug = `parity-${Date.now()}`;
		await createPost(request, { title: 'Parity', slug, excerpt: 'decoded', published: true });

		// `/` renders from cms.posts.list() in a +page.server.ts load. A boolean
		// stored as sqlite integer 1 must arrive as `true`, or `{#if published}`
		// style checks and JSON round-trips drift from the HTTP response.
		await page.goto('/');
		const payload = await page.evaluate(() => {
			const el = document.querySelector('script[data-sveltekit-fetched], #__data');
			return el?.textContent ?? '';
		});
		// Regardless of transport encoding, the rendered list must show the post.
		await expect(page.getByText('Parity')).toBeVisible();
		expect(payload).not.toContain('"published":1');
	});

	test('HTTP list decodes booleans and dates the same way', async ({ request }) => {
		const slug = `parity-http-${Date.now()}`;
		await login(request);
		await createPost(request, { title: 'Parity HTTP', slug, published: true });

		const res = await request.get(`${BASE}/collections/posts?where[slug]=${slug}`);
		expect(res.status()).toBe(200);
		const { rows } = (await res.json()) as {
			rows: { published: unknown; createdAt: unknown }[];
		};
		expect(rows[0]!.published).toBe(true);
		expect(typeof rows[0]!.createdAt).toBe('string');
		expect(Number.isNaN(Date.parse(String(rows[0]!.createdAt)))).toBe(false);
	});

	test('a read-denied collection stays hidden from every transport', async ({ page, request }) => {
		// `secrets` sets access.read to admins only. Anonymous HTTP gets 404.
		const res = await request.get(`${BASE}/collections/secrets`);
		expect(res.status()).toBe(404);

		// And the same policy applies to server-side reads: /secrets-probe calls
		// cms.secrets.list() from a load function without an admin session.
		await page.goto('/secrets-probe');
		await expect(page.getByTestId('probe')).toHaveText(/denied/i);
	});
});

test.describe('media upload', () => {
	const upload = {
		multipart: {
			file: { name: 'hello.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
		},
	};

	test('anonymous upload is denied before the store is consulted', async ({ request }) => {
		// The route exists at all now (it used to be unrouted and 404). The access
		// check must run first, so an anonymous caller cannot tell from the status
		// whether a media store is configured.
		const res = await request.post(`${BASE}/media`, upload);
		expect(res.status()).toBe(403);
	});

	test('an authenticated upload gets past the gate', async ({ page }) => {
		await login(page.request);
		const res = await page.request.post(`${BASE}/media`, upload);
		// This example configures no media store, so the gate passes and the
		// route reports that — proving the check ran and allowed the request,
		// rather than short-circuiting on configuration.
		expect(res.status()).toBe(400);
		expect(await res.text()).toContain('media store not configured');
	});
});
