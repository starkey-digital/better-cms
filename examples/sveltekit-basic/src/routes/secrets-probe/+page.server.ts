import { cms } from '$lib/cms/server/cms';

/**
 * Exists to prove access policies apply to in-process reads, not just HTTP.
 * `secrets` is admin-only, so an anonymous load must be refused here exactly
 * as it is at the API boundary.
 */
export async function load() {
	try {
		const rows = await cms.secrets.list();
		return { result: `visible:${rows.length}` };
	} catch (e) {
		return { result: `denied: ${(e as Error).message}` };
	}
}
