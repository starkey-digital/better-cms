import type { RateLimitHit, RateLimitStore } from './types.js';

export interface UpstashOpts {
	url: string;
	token: string;
	prefix?: string;
}

export function upstashStore(opts: UpstashOpts): RateLimitStore {
	const prefix = opts.prefix ?? 'bcms:rl:';
	const headers = {
		Authorization: `Bearer ${opts.token}`,
		'Content-Type': 'application/json',
	};

	async function exec(commands: unknown[][]): Promise<unknown[]> {
		const res = await fetch(`${opts.url}/pipeline`, {
			method: 'POST',
			headers,
			body: JSON.stringify(commands),
		});
		if (!res.ok) throw new Error(`upstash ${res.status}: ${await res.text()}`);
		const json = (await res.json()) as { result: unknown }[];
		return json.map((r) => r.result);
	}

	return {
		async incr(key, windowSec) {
			const k = prefix + key;
			const [count, pttl] = (await exec([
				['INCR', k],
				['PTTL', k],
			])) as [number, number];
			let ttl = pttl;
			if (count === 1 || pttl < 0) {
				await exec([['PEXPIRE', k, String(windowSec * 1000)]]);
				ttl = windowSec * 1000;
			}
			return { count, resetAt: Date.now() + ttl } satisfies RateLimitHit;
		},
		async reset(key) {
			await exec([['DEL', prefix + key]]);
		},
	};
}
