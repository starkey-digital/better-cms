import type { CmsOp } from '@better-cms/core';

export interface AdminApi {
	list(
		collection: string,
		opts?: { limit?: number; offset?: number },
	): Promise<Record<string, unknown>[]>;
	get(collection: string, id: string): Promise<Record<string, unknown> | null>;
	getSingleton(name: string): Promise<Record<string, unknown> | null>;
	saveSingleton(name: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
	runOps(ops: CmsOp[]): Promise<{ ok: boolean; row?: Record<string, unknown>; error?: string }[]>;
	uploadMedia(file: File, folder?: string): Promise<{ key: string; url: string }>;
	me(): Promise<{ id: string; role: string } | null>;
	login(
		password: string,
		turnstileToken?: string,
	): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
	logout(): Promise<void>;
}

export function httpApi(basePath = '/api/cms', uploadPath = '/api/cms/media'): AdminApi {
	const base = basePath.replace(/\/$/, '');
	const headers = { 'Content-Type': 'application/json' };
	return {
		async list(collection, opts = {}) {
			const q = new URLSearchParams();
			if (opts.limit != null) q.set('limit', String(opts.limit));
			if (opts.offset != null) q.set('offset', String(opts.offset));
			const r = await fetch(`${base}/collections/${collection}?${q}`);
			if (!r.ok) throw new Error(await r.text());
			const j = (await r.json()) as { rows: Record<string, unknown>[] };
			return j.rows;
		},
		async get(collection, id) {
			const r = await fetch(`${base}/collections/${collection}/${id}`);
			if (r.status === 404) return null;
			if (!r.ok) throw new Error(await r.text());
			const j = (await r.json()) as { row: Record<string, unknown> };
			return j.row;
		},
		async getSingleton(name) {
			const r = await fetch(`${base}/singletons/${name}`);
			if (!r.ok) throw new Error(await r.text());
			const j = (await r.json()) as { row: Record<string, unknown> | null };
			return j.row;
		},
		async saveSingleton(name, data) {
			const r = await fetch(`${base}/singletons/${name}`, {
				method: 'PUT',
				headers,
				body: JSON.stringify(data),
			});
			if (!r.ok) throw new Error(await r.text());
			const j = (await r.json()) as { row: Record<string, unknown> };
			return j.row;
		},
		async runOps(ops) {
			const r = await fetch(`${base}/ops`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ ops }),
			});
			if (!r.ok) throw new Error(await r.text());
			const j = (await r.json()) as {
				results: { ok: boolean; row?: Record<string, unknown>; error?: { message: string } }[];
			};
			return j.results.map((x) => ({ ok: x.ok, row: x.row, error: x.error?.message }));
		},
		async uploadMedia(file, folder) {
			const fd = new FormData();
			fd.append('file', file);
			if (folder) fd.append('folder', folder);
			const r = await fetch(uploadPath, { method: 'POST', body: fd });
			if (!r.ok) throw new Error(await r.text());
			return (await r.json()) as { key: string; url: string };
		},
		async me() {
			const r = await fetch(`${base}/me`);
			if (r.status === 404) return null;
			if (!r.ok) throw new Error(await r.text());
			const j = (await r.json()) as { user: { id: string; role: string } | null };
			return j.user;
		},
		async login(password, turnstileToken) {
			const r = await fetch(`${base}/login`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ password, turnstileToken }),
			});
			if (r.ok) return { ok: true };
			const j = (await r.json().catch(() => ({}))) as { error?: { code: string; message: string } };
			return {
				ok: false,
				code: j.error?.code ?? `HTTP_${r.status}`,
				message: j.error?.message ?? `login failed (${r.status})`,
			};
		},
		async logout() {
			await fetch(`${base}/logout`, { method: 'POST' });
		},
	};
}
