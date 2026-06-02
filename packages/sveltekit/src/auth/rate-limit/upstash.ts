import type { RateLimitHit, RateLimitStore } from './types.js';

export interface UpstashOpts {
	url: string;
	token: string;
	prefix?: string;
}

// Lua: INCR key, PEXPIRE only on first increment (count==1), return {count, pttl}.
// Prevents concurrent first-requests from sliding the window.
const INCR_SCRIPT =
	'local c=redis.call("INCR",KEYS[1]) if c==1 then redis.call("PEXPIRE",KEYS[1],ARGV[1]) end return {c,redis.call("PTTL",KEYS[1])}';

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
			const [[count, pttl]] = (await exec([
				['EVAL', INCR_SCRIPT, '1', k, String(windowSec * 1000)],
			])) as [[number, number]];
			return { count, resetAt: Date.now() + pttl } satisfies RateLimitHit;
		},
		async reset(key) {
			await exec([['DEL', prefix + key]]);
		},
	};
}
