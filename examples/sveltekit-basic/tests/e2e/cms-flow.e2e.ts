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
		const me = await request.get(`${BASE}/me`);
		const body = (await me.json()) as { user: { id: string; role: string } | null };
		expect(body.user).toEqual({ id: 'admin', role: 'admin' });
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
		await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);

		await login(page.request);
		await page.goto('/');
		await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
	});

	test('admin route renders the editor shell', async ({ page, request }) => {
		await login(request);
		await page.goto('/cms');
		await expect(page.getByRole('heading', { name: /better-cms/i })).toBeVisible();
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
