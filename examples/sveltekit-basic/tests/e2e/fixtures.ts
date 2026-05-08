import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';

export const BASE = '/api/cms';
export const PASSWORD = process.env.CMS_PASSWORD ?? 'admin123';

export async function login(request: APIRequestContext): Promise<void> {
	const res = await request.post(`${BASE}/login`, { data: { password: PASSWORD } });
	expect(res.status()).toBe(200);
}

export async function logout(request: APIRequestContext): Promise<void> {
	await request.post(`${BASE}/logout`);
}

export async function createPost(
	request: APIRequestContext,
	data: { title: string; slug: string; excerpt?: string; published?: boolean },
): Promise<{ id: string; slug: string; title: string }> {
	const res = await request.post(`${BASE}/ops`, {
		data: { ops: [{ op: 'create', collection: 'posts', data: { published: true, ...data } }] },
	});
	expect(res.status()).toBe(200);
	const body = (await res.json()) as {
		results: { row: { id: string; slug: string; title: string } }[];
	};
	return body.results[0]!.row;
}
