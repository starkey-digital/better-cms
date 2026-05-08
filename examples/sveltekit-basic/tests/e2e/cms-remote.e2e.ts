import { type APIRequestContext, expect, test } from '@playwright/test';

const BASE = '/api/cms';
const PASSWORD = 'admin123';

async function login(request: APIRequestContext) {
	const res = await request.post(`${BASE}/login`, { data: { password: PASSWORD } });
	expect(res.status()).toBe(200);
}

async function createPost(
	request: APIRequestContext,
	data: { title: string; slug: string; excerpt?: string; published?: boolean },
) {
	const res = await request.post(`${BASE}/ops`, {
		data: { ops: [{ op: 'create', collection: 'posts', data: { published: true, ...data } }] },
	});
	expect(res.status()).toBe(200);
	const body = (await res.json()) as { results: { row: { id: string } }[] };
	return body.results[0]!.row;
}

test.describe('remote functions', () => {
	test('recentPosts query renders the published list on /recent', async ({ page, request }) => {
		await login(request);
		await createPost(request, { title: 'Remote A', slug: 'remote-a' });
		await createPost(request, { title: 'Remote B', slug: 'remote-b', published: false });

		await page.goto('/recent');

		await expect(page.getByRole('heading', { name: 'Recent posts' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Remote A' })).toBeVisible();
		// draft (published:false) excluded by where filter
		await expect(page.getByRole('link', { name: 'Remote B' })).toHaveCount(0);
	});

	test('togglePublished command flips a post via remote', async ({ page }) => {
		// Login + create via page.request so the click inherits the session cookie.
		await login(page.request);
		const post = await createPost(page.request, { title: 'Toggle Me', slug: 'toggle-me' });

		await page.goto('/recent');
		const card = page.getByRole('listitem').filter({ hasText: 'Toggle Me' });
		await expect(card.getByRole('button', { name: 'Unpublish' })).toBeVisible();

		await card.getByRole('button', { name: 'Unpublish' }).click();

		// Poll the API until the command lands. We don't depend on UI refresh
		// behaviour — the contract under test is that the command flipped state.
		await expect
			.poll(
				async () => {
					const r = await page.request.get(`${BASE}/collections/posts/${post.id}`);
					const body = (await r.json()) as { row: { published: number | boolean } };
					return Boolean(body.row.published);
				},
				{ timeout: 5000 },
			)
			.toBe(false);
	});
});
