import { expect, test } from '@playwright/test';
import { BASE, PASSWORD, createPost, login } from './fixtures.js';

const uniq = (prefix: string) =>
	`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

test.describe('admin dashboard UI', () => {
	test.beforeEach(async ({ page, request }) => {
		await login(request);
		await login(page.request);
	});

	test('hash auto-routes to first collection', async ({ page }) => {
		await page.goto('/cms');
		await expect(page).toHaveURL(/#\/posts$/);
		await expect(page.getByRole('heading', { name: 'posts', exact: true })).toBeVisible();
	});

	test('sidebar click navigates by hash', async ({ page }) => {
		await page.goto('/cms');
		const nav = page.locator('aside.bcms-sidebar nav');

		await nav.getByRole('button', { name: /settings/i }).click();
		await expect(page).toHaveURL(/#\/settings$/);
		await expect(page.getByRole('heading', { name: 'settings', exact: true })).toBeVisible();

		await nav.getByRole('button', { name: /posts/i }).click();
		await expect(page).toHaveURL(/#\/posts$/);
	});

	test('sidebar active state reflects current route', async ({ page }) => {
		await page.goto('/cms#/settings');
		const nav = page.locator('aside.bcms-sidebar nav');
		await expect(nav.getByRole('button', { name: /settings/i })).toHaveClass(/active/);
		await expect(nav.getByRole('button', { name: /posts/i })).not.toHaveClass(/active/);
	});

	test('direct deep link to #/posts/new shows the create form', async ({ page }) => {
		await page.goto('/cms#/posts/new');
		await expect(page.getByRole('heading', { name: /^New post/i, exact: false })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
	});

	test('direct deep link to #/posts/<id> loads that record', async ({ page, request }) => {
		const slug = uniq('deep-link');
		const post = await createPost(request, { title: 'Deep Linked', slug, published: false });

		await page.goto(`/cms#/posts/${post.id}`);
		await expect(page.getByRole('heading', { name: 'Deep Linked' })).toBeVisible();
		await expect(page.getByRole('textbox', { name: /^Title/ })).toHaveValue('Deep Linked');
		await expect(page.getByRole('textbox', { name: /^Slug/ })).toHaveValue(slug);
	});

	test('list shows record count + clicking row navigates to edit hash', async ({
		page,
		request,
	}) => {
		const slug = uniq('row-click');
		const post = await createPost(request, { title: 'Row Click Me', slug, published: false });

		await page.goto('/cms#/posts');
		const row = page.locator('.bcms-row', { hasText: 'Row Click Me' });
		await expect(row).toBeVisible();
		await row.click();

		await expect(page).toHaveURL(new RegExp(`#/posts/${post.id}$`));
		await expect(page.getByRole('heading', { name: 'Row Click Me' })).toBeVisible();
	});

	test('create flow: fill form, save, URL replaces to edit hash with new id', async ({ page }) => {
		await page.goto('/cms#/posts');
		await page.getByRole('button', { name: /^New$/ }).first().click();
		await expect(page).toHaveURL(/#\/posts\/new$/);

		const title = `Created via UI ${Date.now()}`;
		const slug = uniq('ui-create');
		await page.getByRole('textbox', { name: /^Title/ }).fill(title);
		await page.getByRole('textbox', { name: /^Slug/ }).fill(slug);
		await page.getByRole('button', { name: 'Create' }).click();

		await expect(page).toHaveURL(/#\/posts\/[\w-]+$/);
		await expect(page).not.toHaveURL(/#\/posts\/new$/);
		await expect(page.getByRole('heading', { name: title })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
	});

	test('dirty pill appears on edit and clears on save', async ({ page, request }) => {
		const slug = uniq('dirty-pill');
		const post = await createPost(request, { title: 'Dirty Original', slug, published: false });

		await page.goto(`/cms#/posts/${post.id}`);
		await expect(page.locator('.bcms-dirty')).toHaveCount(0);

		const titleInput = page.getByRole('textbox', { name: /^Title/ });
		await titleInput.fill('Dirty Edited');
		await expect(page.locator('.bcms-dirty')).toBeVisible();
		await expect(page.locator('.bcms-dirty')).toHaveText(/unsaved/i);

		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.locator('.bcms-dirty')).toHaveCount(0);
	});

	test('saved edit persists across reload', async ({ page, request }) => {
		const slug = uniq('persist');
		const post = await createPost(request, { title: 'Before', slug, published: false });

		await page.goto(`/cms#/posts/${post.id}`);
		await page.getByRole('textbox', { name: /^Title/ }).fill('After Reload');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.locator('.bcms-dirty')).toHaveCount(0);

		await page.reload();
		await expect(page.getByRole('textbox', { name: /^Title/ })).toHaveValue('After Reload');
	});

	test('back arrow returns to list view', async ({ page, request }) => {
		const slug = uniq('back-arrow');
		const post = await createPost(request, { title: 'Back Test', slug, published: false });

		await page.goto(`/cms#/posts/${post.id}`);
		await page.getByRole('button', { name: 'Back to list' }).click();
		await expect(page).toHaveURL(/#\/posts$/);
		await expect(page.getByRole('heading', { name: 'posts', exact: true })).toBeVisible();
	});

	test('delete flow: confirm dialog → record gone from list', async ({ page, request }) => {
		const slug = uniq('delete-me');
		const post = await createPost(request, { title: 'Doomed', slug, published: false });

		await page.goto(`/cms#/posts/${post.id}`);
		page.once('dialog', (d) => {
			void d.accept();
		});
		await page.getByRole('button', { name: 'Delete' }).click();

		await expect(page).toHaveURL(/#\/posts$/);
		await expect(page.locator('.bcms-row', { hasText: 'Doomed' })).toHaveCount(0);
	});

	test('delete flow: dismissing confirm keeps the record', async ({ page, request }) => {
		const slug = uniq('keep-me');
		const post = await createPost(request, { title: 'Survivor', slug, published: false });

		await page.goto(`/cms#/posts/${post.id}`);
		page.once('dialog', (d) => {
			void d.dismiss();
		});
		await page.getByRole('button', { name: 'Delete' }).click();

		await expect(page).toHaveURL(new RegExp(`#/posts/${post.id}$`));
		await expect(page.getByRole('heading', { name: 'Survivor' })).toBeVisible();
	});

	test('singleton edit page: no Delete, "Save changes" button, persists', async ({ page }) => {
		await page.goto('/cms#/settings');
		await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Back to list' })).toHaveCount(0);

		const tagline = `tagline-${Date.now()}`;
		// siteTitle is required by the schema — fill it so save validates.
		await page.getByRole('textbox', { name: /Site Title/ }).fill('E2E Site');
		await page.getByRole('textbox', { name: /Tagline/ }).fill(tagline);
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page.locator('.bcms-dirty')).toHaveCount(0);

		await page.reload();
		await expect(page.getByRole('textbox', { name: /Tagline/ })).toHaveValue(tagline);
	});

	test('boolean field renders as toggle and persists state', async ({ page, request }) => {
		const slug = uniq('toggle-ui');
		const post = await createPost(request, { title: 'Toggle UI', slug, published: false });

		await page.goto(`/cms#/posts/${post.id}`);
		const checkbox = page.locator('.bcms-toggle input[type="checkbox"]');
		await expect(checkbox).not.toBeChecked();

		// Click the visual track since the input is visually hidden.
		await page.locator('.bcms-toggle-track').first().click();
		await expect(checkbox).toBeChecked();

		// Toggle back so beforeDelete hook permits cleanup.
		await page.locator('.bcms-toggle-track').first().click();
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.locator('.bcms-dirty')).toHaveCount(0);

		// Server reflects the change.
		const get = await request.get(`${BASE}/collections/posts/${post.id}`);
		const { row } = (await get.json()) as { row: { published: boolean } };
		expect(row.published).toBe(false);
	});

	test('login screen rejects bad password and accepts good password', async ({ page }) => {
		// Drop session so the gate closes.
		await page.context().clearCookies();
		await page.goto('/cms');

		await expect(page.getByRole('heading', { name: /better-cms/i })).toBeVisible();
		await page.getByRole('textbox', { name: 'Password' }).fill('wrong-password');
		await page.getByRole('button', { name: /sign in/i }).click();
		await expect(page.locator('.bcms-login-error')).toBeVisible();

		await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
		await page.getByRole('button', { name: /sign in/i }).click();
		await expect(page).toHaveURL(/#\/posts$/);
	});

	test('CSS theme tokens override via inline !important custom property', async ({ page }) => {
		await page.goto('/cms');
		await expect(page.locator('aside.bcms-sidebar nav button.active').first()).toBeVisible();

		await page.evaluate(() => {
			const root = document.querySelector('.bcms') as HTMLElement | null;
			root?.style.setProperty('--bcms-primary', 'rgb(99, 102, 241)', 'important');
		});

		// Wait for the bg-color transition (120ms) to settle before reading paint.
		const activeBtn = page.locator('aside.bcms-sidebar nav button.active').first();
		await expect
			.poll(async () => activeBtn.evaluate((el) => getComputedStyle(el).backgroundColor), {
				timeout: 1500,
			})
			.toBe('rgb(99, 102, 241)');

		await expect(activeBtn).toHaveCSS('--bcms-primary', 'rgb(99, 102, 241)');
	});
});
