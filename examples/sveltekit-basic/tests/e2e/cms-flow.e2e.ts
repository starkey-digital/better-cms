import { expect, test } from '@playwright/test';
import { BASE, createPost, login } from './fixtures.js';

test.describe('cms flow', () => {
	test('rejects bad password', async ({ request }) => {
		const res = await request.post(`${BASE}/login`, { data: { password: 'wrong' } });
		expect(res.status()).toBe(401);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_CREDENTIALS');
	});

	test('login sets a session', async ({ request }) => {
		await login(request);
		const me = await request.get(`${BASE}/auth/context`);
		const body = (await me.json()) as { ctx: { user: { id: string; role: string } } | null };
		expect(body.ctx).toEqual({ user: { id: 'admin', role: 'admin' } });
	});

	test('create + view a post end-to-end', async ({ page, request }) => {
		await login(request);
		await createPost(request, {
			title: 'Hello E2E',
			slug: 'hello-e2e',
			excerpt: 'From a Playwright test',
		});

		await page.goto('/posts/hello-e2e');
		await expect(page.getByRole('heading', { name: 'Hello E2E' })).toBeVisible();
		await expect(page.getByText('From a Playwright test')).toBeVisible();
	});

	test('nav swaps between Sign in and Admin based on auth state', async ({ page }) => {
		await page.goto('/');
		const nav = page.locator('nav');
		await expect(nav.getByRole('link', { name: 'Sign in' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Admin' })).toHaveCount(0);

		await login(page.request);
		await page.goto('/');
		await expect(nav.getByRole('link', { name: 'Admin' })).toBeVisible();
		await expect(nav.getByRole('button', { name: 'Sign out' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
	});

	test('admin route renders the editor shell', async ({ page, request }) => {
		await login(request);
		await page.goto('/cms');
		await expect(page.getByRole('heading', { name: /better-cms/i })).toBeVisible();
	});

	test('cmsClient.auth.logout clears the session', async ({ request }) => {
		await login(request);
		const before = await request.get(`${BASE}/auth/context`);
		const beforeBody = (await before.json()) as { ctx: unknown };
		expect(beforeBody.ctx).not.toBeNull();

		// Hit the same endpoint cmsClient.auth.logout uses (POST /api/cms/logout).
		const out = await request.post(`${BASE}/logout`);
		expect(out.status()).toBe(200);

		const after = await request.get(`${BASE}/auth/context`);
		const afterBody = (await after.json()) as { ctx: unknown };
		expect(afterBody.ctx).toBeNull();
	});

	test('homepage lists created posts', async ({ page, request }) => {
		await login(request);
		await createPost(request, {
			title: 'Listed Post',
			slug: 'listed-post',
			excerpt: 'Should appear on home page',
		});

		await page.goto('/');
		await expect(page.getByRole('link', { name: /Listed Post/ })).toBeVisible();
	});
});
