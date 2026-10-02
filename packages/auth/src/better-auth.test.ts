import { describe, expect, test } from 'bun:test';
import { betterAuthContext } from './better-auth.js';

type Session = {
	user: {
		id: string;
		email: string;
		name: string;
		role?: string | null;
		emailVerified?: boolean;
	};
	session: { id: string };
};

function fakeAuth(session: Session | null) {
	const calls: Headers[] = [];
	return {
		calls,
		api: {
			getSession: async ({ headers }: { headers: Headers }) => {
				calls.push(headers);
				return session;
			},
		},
	};
}

const req = new Request('http://x/', { headers: { cookie: 'better-auth.session_token=abc' } });
const session = (over: Partial<Session['user']> = {}): Session => ({
	user: {
		id: 'u1',
		email: 'Kay@Example.com',
		name: 'Kay',
		role: 'admin',
		emailVerified: true,
		...over,
	},
	session: { id: 's1' },
});

describe('betterAuthContext', () => {
	test('forwards request headers and maps a session to the default ctx', async () => {
		const auth = fakeAuth(session());
		const ctx = await betterAuthContext(auth)(req);
		expect(auth.calls[0]?.get('cookie')).toContain('abc');
		expect(ctx).toEqual({
			user: { id: 'u1', email: 'Kay@Example.com', name: 'Kay', role: 'admin' },
		});
	});

	test('no session -> null', async () => {
		expect(await betterAuthContext(fakeAuth(null))(req)).toBeNull();
	});

	test('missing role defaults to null', async () => {
		const ctx = await betterAuthContext(fakeAuth(session({ role: undefined })))(req);
		expect(ctx?.user.role).toBeNull();
	});

	test('allow roles: admin passes, other roles are denied', async () => {
		const allow = { roles: ['admin'] };
		expect(await betterAuthContext(fakeAuth(session()), { allow })(req)).not.toBeNull();
		expect(await betterAuthContext(fakeAuth(session({ role: 'user' })), { allow })(req)).toBeNull();
		expect(await betterAuthContext(fakeAuth(session({ role: null })), { allow })(req)).toBeNull();
	});

	test('allow roles handles comma-separated roles and case', async () => {
		const allow = { roles: ['Editor'] };
		const ctx = await betterAuthContext(fakeAuth(session({ role: 'user, editor' })), { allow })(
			req,
		);
		expect(ctx).not.toBeNull();
	});

	test('allow emails is case-insensitive', async () => {
		const allow = { emails: ['kay@example.COM'] };
		expect(
			await betterAuthContext(fakeAuth(session({ role: 'user' })), { allow })(req),
		).not.toBeNull();
		expect(
			await betterAuthContext(fakeAuth(session({ email: 'other@example.com' })), { allow })(req),
		).toBeNull();
	});

	test('allow emails ignores unverified addresses unless allowUnverifiedEmails is set', async () => {
		const unverified = session({ role: 'user', emailVerified: false });
		const missing = session({ role: 'user' });
		missing.user.emailVerified = undefined;
		const strict = { emails: ['kay@example.com'] };
		expect(await betterAuthContext(fakeAuth(unverified), { allow: strict })(req)).toBeNull();
		expect(await betterAuthContext(fakeAuth(missing), { allow: strict })(req)).toBeNull();
		const loose = { ...strict, allowUnverifiedEmails: true };
		expect(await betterAuthContext(fakeAuth(unverified), { allow: loose })(req)).not.toBeNull();
	});

	test('a role still admits an unverified user', async () => {
		const allow = { roles: ['admin'], emails: ['kay@example.com'] };
		const ctx = await betterAuthContext(fakeAuth(session({ emailVerified: false })), { allow })(
			req,
		);
		expect(ctx).not.toBeNull();
	});

	test('allow predicate (sync and async)', async () => {
		const yes = betterAuthContext(fakeAuth(session()), { allow: async () => true });
		const no = betterAuthContext(fakeAuth(session()), { allow: () => false });
		expect(await yes(req)).not.toBeNull();
		expect(await no(req)).toBeNull();
	});

	test('custom map shapes the ctx and is not called without a session', async () => {
		let called = 0;
		const map = (s: Session) => {
			called++;
			return { who: s.user.id };
		};
		expect(await betterAuthContext(fakeAuth(session()), { map })(req)).toEqual({ who: 'u1' });
		expect(await betterAuthContext(fakeAuth(null), { map })(req)).toBeNull();
		expect(called).toBe(1);
	});

	test('map returning null denies; allow runs before map', async () => {
		const deny = betterAuthContext(fakeAuth(session()), { map: () => null });
		expect(await deny(req)).toBeNull();
		let called = 0;
		const gated = betterAuthContext(fakeAuth(session({ role: 'user' })), {
			allow: { roles: ['admin'] },
			map: () => {
				called++;
				return { ok: true };
			},
		});
		expect(await gated(req)).toBeNull();
		expect(called).toBe(0);
	});
});
