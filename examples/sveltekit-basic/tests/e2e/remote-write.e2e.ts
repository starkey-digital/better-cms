import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BASE, createPost, login } from './fixtures';

/**
 * Wait for the remote form's progressive-enhancement attachment to be applied.
 *
 * Submitting before it lands falls back to a native form post: the write still
 * happens (that is the point of progressive enhancement), but the response is
 * a full page load, so client-rendered validation state is never shown. Only
 * the assertions that inspect `issues()` actually depend on this, but every
 * form test waits so none of them depend on submit timing.
 */
async function settle(page: Page): Promise<void> {
	await expect(page.getByTestId('edit-form')).toBeVisible();
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(400);
}

test.describe('form() write path', () => {
	test('editing a post through the remote form persists', async ({ page }) => {
		const request = page.request;
		await login(request);
		const slug = `form-edit-${Date.now()}`;
		await createPost(request, { title: 'Before edit', slug, published: false });

		// SPA-navigate to the editor rather than page.goto — a direct load can
		// leave the submit handler unattached while the async boundary resolves.
		await page.goto(`/posts/${slug}`);
		await page.getByRole('link', { name: /edit this post/i }).click();
		await expect(page).toHaveURL(new RegExp(`/posts/${slug}/edit$`));
		await settle(page);

		await page.getByLabel('Title').fill('After edit');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByTestId('saved')).toBeVisible();

		const res = await request.get(`${BASE}/collections/posts?where[slug]=${slug}`);
		const { rows } = (await res.json()) as { rows: { title: string }[] };
		expect(rows[0]!.title).toBe('After edit');
	});

	test('form surfaces field-level validation from the collection schema', async ({ page }) => {
		const request = page.request;
		await login(request);
		const slug = `form-invalid-${Date.now()}`;
		await createPost(request, { title: 'Keep me', slug, published: false });

		await page.goto(`/posts/${slug}`);
		await page.getByRole('link', { name: /edit this post/i }).click();
		await settle(page);
		await page.getByLabel('Title').fill('');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect(page.locator('.error').first()).toBeVisible();
		// The invalid submit must not have written anything.
		const res = await request.get(`${BASE}/collections/posts?where[slug]=${slug}`);
		const { rows } = (await res.json()) as { rows: { title: string }[] };
		expect(rows[0]!.title).toBe('Keep me');
	});

	test('unchecked checkbox submits as false rather than failing coercion', async ({ page }) => {
		const request = page.request;
		await login(request);
		const slug = `form-bool-${Date.now()}`;
		await createPost(request, { title: 'Bool post', slug, published: true });

		await page.goto(`/posts/${slug}`);
		await page.getByRole('link', { name: /edit this post/i }).click();
		await settle(page);
		await page.getByRole('checkbox', { name: /published/i }).uncheck();
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByTestId('saved')).toBeVisible();

		const res = await request.get(`${BASE}/collections/posts?where[slug]=${slug}`);
		const { rows } = (await res.json()) as { rows: { published: unknown }[] };
		expect(rows[0]!.published).toBe(false);
	});
});

test.describe('query.batch relation loading', () => {
	test('author byline resolves through the batched query', async ({ page }) => {
		const request = page.request;
		await login(request);
		const authorRes = await request.post(`${BASE}/ops`, {
			data: {
				ops: [{ op: 'create', collection: 'authors', data: { name: 'Ada Lovelace' } }],
			},
		});
		const authorBody = (await authorRes.json()) as { results: { row: { id: string } }[] };
		const authorId = authorBody.results[0]!.row.id;

		const slug = `batch-${Date.now()}`;
		await request.post(`${BASE}/ops`, {
			data: {
				ops: [
					{
						op: 'create',
						collection: 'posts',
						data: { title: 'Batched', slug, published: true, authorId },
					},
				],
			},
		});

		await page.goto(`/posts/${slug}`);
		await expect(page.getByText('by Ada Lovelace')).toBeVisible();
	});
});
