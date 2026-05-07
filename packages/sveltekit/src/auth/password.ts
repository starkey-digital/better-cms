import type { CMSPlugin } from '@better-cms/core';
import {
	clearCookie,
	parseTtl,
	readCookie,
	serializeCookie,
	signSession,
	verifySession,
} from './cookie.js';
import { verifyPassword } from './crypto.js';
import { memoryStore } from './rate-limit/memory.js';
import type { RateLimitStore } from './rate-limit/types.js';
import { type TurnstileOpts, verifyTurnstile } from './turnstile.js';

export const PASSWORD_AUTH_ERROR_CODES = {
	RATE_LIMITED: 'RATE_LIMITED',
	INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
	TURNSTILE_REQUIRED: 'TURNSTILE_REQUIRED',
	BAD_REQUEST: 'BAD_REQUEST',
} as const;
export type PasswordAuthErrorCode =
	(typeof PASSWORD_AUTH_ERROR_CODES)[keyof typeof PASSWORD_AUTH_ERROR_CODES];

export interface PasswordAuthRateLimit {
	store?: RateLimitStore;
	perIp?: { window: string | number; max: number };
	global?: { window: string | number; max: number };
	lockoutMinutes?: number;
}

export interface PasswordAuthOpts {
	passwordHash: string;
	secret: string;
	cookieName?: string;
	cookieTtl?: string | number;
	cookieSecure?: boolean;
	userId?: string;
	rateLimit?: PasswordAuthRateLimit;
	turnstile?: TurnstileOpts;
	onFailedAttempt?: (info: { ip: string; count: number; reason: string }) => void;
}

export interface PasswordAuthResult extends CMSPlugin {
	getUser: (request: Request) => Promise<{ id: string; role: string } | null>;
}

const DEFAULT_COOKIE = 'bcms_session';
const DEFAULT_TTL = '24h';

export function passwordAuth(opts: PasswordAuthOpts): PasswordAuthResult {
	if (!opts.passwordHash) throw new Error('passwordAuth: passwordHash required');
	if (!opts.secret || opts.secret.length < 16)
		throw new Error('passwordAuth: secret required (>=16 chars)');

	const cookieName = opts.cookieName ?? DEFAULT_COOKIE;
	const ttlSec = parseTtl(opts.cookieTtl ?? DEFAULT_TTL);
	const userId = opts.userId ?? 'admin';
	const cookieSecure = opts.cookieSecure ?? true;

	const store = opts.rateLimit?.store ?? memoryStore();
	const perIp = opts.rateLimit?.perIp ?? { window: '1m', max: 5 };
	const global = opts.rateLimit?.global ?? { window: '1m', max: 100 };
	const lockoutMs = (opts.rateLimit?.lockoutMinutes ?? 15) * 60 * 1000;
	const perIpWindow = parseTtl(perIp.window);
	const globalWindow = parseTtl(global.window);
	const turnstileAfter = opts.turnstile?.after ?? 3;

	async function getUser(request: Request): Promise<{ id: string; role: string } | null> {
		const token = readCookie(request, cookieName);
		const session = await verifySession(token, opts.secret);
		if (!session) return null;
		return { id: session.uid, role: 'admin' };
	}

	const plugin: CMSPlugin = {
		id: 'better-cms/password-auth',
		endpoints: [
			{
				method: 'POST',
				path: '/login',
				handler: async (request) => {
					const ip = clientIp(request);
					const ipKey = `login:ip:${ip}`;
					const globalKey = 'login:global';

					const [ipHit, globalHit] = await Promise.all([
						store.incr(ipKey, perIpWindow),
						store.incr(globalKey, globalWindow),
					]);
					if (ipHit.count > perIp.max) {
						opts.onFailedAttempt?.({ ip, count: ipHit.count, reason: 'per-ip' });
						return rateLimited(ipHit.resetAt - Date.now() + lockoutMs);
					}
					if (globalHit.count > global.max) {
						opts.onFailedAttempt?.({ ip, count: globalHit.count, reason: 'global' });
						return rateLimited(globalHit.resetAt - Date.now());
					}

					let body: { password?: string; turnstileToken?: string };
					try {
						body = (await request.json()) as typeof body;
					} catch {
						return badRequest('invalid json');
					}

					if (opts.turnstile && ipHit.count > turnstileAfter) {
						const tt = await verifyTurnstile(body.turnstileToken, opts.turnstile, ip);
						if (!tt.success) {
							opts.onFailedAttempt?.({ ip, count: ipHit.count, reason: 'turnstile' });
							return Response.json(
								{
									error: {
										code: PASSWORD_AUTH_ERROR_CODES.TURNSTILE_REQUIRED,
										message: 'turnstile verification failed',
									},
								},
								{ status: 401 },
							);
						}
					}

					const backoffMs = Math.min(2 ** Math.max(0, ipHit.count - 1) * 250, 8000);
					if (backoffMs > 0) await sleep(backoffMs);

					if (!body.password || !(await verifyPassword(body.password, opts.passwordHash))) {
						opts.onFailedAttempt?.({ ip, count: ipHit.count, reason: 'bad-password' });
						return Response.json(
							{
								error: {
									code: PASSWORD_AUTH_ERROR_CODES.INVALID_CREDENTIALS,
									message: 'invalid credentials',
								},
							},
							{ status: 401 },
						);
					}

					await store.reset(ipKey);
					const exp = Math.floor(Date.now() / 1000) + ttlSec;
					const token = await signSession({ uid: userId, exp }, opts.secret);
					const cookie = serializeCookie({
						name: cookieName,
						value: token,
						maxAge: ttlSec,
						secure: cookieSecure,
					});
					return new Response(JSON.stringify({ ok: true }), {
						status: 200,
						headers: { 'content-type': 'application/json', 'set-cookie': cookie },
					});
				},
			},
			{
				method: 'POST',
				path: '/logout',
				handler: () =>
					new Response(JSON.stringify({ ok: true }), {
						status: 200,
						headers: { 'content-type': 'application/json', 'set-cookie': clearCookie(cookieName) },
					}),
			},
			{
				method: 'GET',
				path: '/me',
				handler: async (request) => {
					const user = await getUser(request);
					return Response.json({ user });
				},
			},
		],
	};

	return Object.assign(plugin, { getUser });
}

function clientIp(request: Request): string {
	return (
		request.headers.get('cf-connecting-ip') ??
		request.headers.get('x-real-ip') ??
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		'unknown'
	);
}

function rateLimited(retryMs: number): Response {
	const retrySec = Math.max(1, Math.ceil(retryMs / 1000));
	return new Response(
		JSON.stringify({
			error: { code: PASSWORD_AUTH_ERROR_CODES.RATE_LIMITED, message: 'too many attempts' },
		}),
		{
			status: 429,
			headers: { 'content-type': 'application/json', 'retry-after': String(retrySec) },
		},
	);
}

function badRequest(message: string): Response {
	return Response.json(
		{ error: { code: PASSWORD_AUTH_ERROR_CODES.BAD_REQUEST, message } },
		{ status: 400 },
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
