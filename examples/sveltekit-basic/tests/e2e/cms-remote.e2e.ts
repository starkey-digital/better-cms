import { expect, test } from '@playwright/test';
import { BASE, createPost, login } from './fixtures.js';

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

		// Land on '/', then SPA-navigate via the nav link. A direct page.goto('/recent')
		// races with Svelte 5 async hydration ($derived(await ...)) and the click can
		// fire before the button's onclick handler is attached.
		await page.goto('/');
		await page.getByRole('link', { name: 'Recent' }).click();
		await expect(page).toHaveURL('/recent');
		const card = page.getByRole('listitem').filter({ hasText: 'Toggle Me' });
		await expect(card.getByRole('button', { name: 'Unpublish' })).toBeVisible();

		await card.getByRole('button', { name: 'Unpublish' }).click();

		// Poll the API until the command lands. The UI refresh primitive
		// is tested separately; here we just verify the server-side flip.
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
