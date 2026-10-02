import type { AuthContextFn } from '@better-cms/core';

/**
 * Structural view of a better-auth instance — just enough to read a session.
 * Declared here (not imported) so `better-auth` is never pulled into consumers
 * who do not use it, and so any version of better-auth fits.
 */
type SessionReader = {
	api: {
		getSession(ctx: { headers: Headers }): Promise<unknown>;
	};
};

/** The non-null session `auth.api.getSession` resolves to for this instance. */
export type SessionOf<A extends SessionReader> = NonNullable<
	Awaited<ReturnType<A['api']['getSession']>>
>;

/** Context shape produced when no `map` is given. */
export type BetterAuthCtx = {
	user: { id: string; email: string; name: string; role: string | null };
};

type SessionUser = {
	id: string;
	email: string;
	emailVerified?: boolean | null;
	name?: string | null;
	role?: string | null;
};

/**
 * Who counts as an editor. A predicate, or declarative rules where matching
 * either `roles` or `emails` is enough.
 * - `roles` matches better-auth's `role` field, including comma-separated
 *   values from the admin plugin (`"admin,editor"`).
 * - `emails` is an allowlist, compared case-insensitively. Only verified
 *   addresses match (`user.emailVerified === true`) unless
 *   `allowUnverifiedEmails` is set: a sign-up form that does not verify
 *   ownership would otherwise let anyone register an allowlisted address.
 */
export type AllowRule<S> =
	| ((session: S) => boolean | Promise<boolean>)
	| {
			roles?: readonly string[];
			emails?: readonly string[];
			/** Match `emails` even when better-auth has not verified the address. Default false. */
			allowUnverifiedEmails?: boolean;
	  };

export type BetterAuthContextOpts<S, Ctx> = {
	/** Shape the ctx handed to access policies. Return `null` to deny. */
	map?: (session: S) => Ctx | null | Promise<Ctx | null>;
	/** Only sessions that pass get a ctx; everyone else resolves to `null`. */
	allow?: AllowRule<S>;
};

const userOf = (session: unknown): SessionUser => (session as { user: SessionUser }).user;

const norm = (v: string) => v.trim().toLowerCase();

function matches(rule: AllowRule<never>, session: unknown): boolean | Promise<boolean> {
	if (typeof rule === 'function')
		return (rule as (s: unknown) => boolean | Promise<boolean>)(session);
	const user = userOf(session);
	const emails = rule.emails?.map(norm) ?? [];
	const verified = rule.allowUnverifiedEmails || user.emailVerified === true;
	if (verified && emails.includes(norm(user.email ?? ''))) return true;
	const roles = rule.roles?.map(norm) ?? [];
	const has = (user.role ?? '').split(',').map(norm);
	return roles.some((r) => has.includes(r));
}

/**
 * better-auth drives better-cms sign-in: the CMS ctx is whoever better-auth's
 * session cookie says they are.
 *
 * ```ts
 * createCms({
 *   auth: { context: betterAuthContext(auth, { allow: { roles: ['admin'] } }) },
 * });
 * ```
 *
 * Runs on any runtime (Workers included) — it only calls `auth.api.getSession`.
 */
export function betterAuthContext<A extends SessionReader, Ctx>(
	auth: A,
	opts: BetterAuthContextOpts<SessionOf<A>, Ctx> & {
		map: (session: SessionOf<A>) => Ctx | null | Promise<Ctx | null>;
	},
): AuthContextFn<Ctx | null>;
export function betterAuthContext<A extends SessionReader>(
	auth: A,
	opts?: Omit<BetterAuthContextOpts<SessionOf<A>, BetterAuthCtx>, 'map'>,
): AuthContextFn<BetterAuthCtx | null>;
export function betterAuthContext<A extends SessionReader, Ctx>(
	auth: A,
	opts: BetterAuthContextOpts<SessionOf<A>, Ctx> = {},
): AuthContextFn<Ctx | BetterAuthCtx | null> {
	return async (request) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) return null;
		if (opts.allow && !(await matches(opts.allow as AllowRule<never>, session))) return null;
		if (opts.map) return opts.map(session as SessionOf<A>);
		const { id, email, name, role } = userOf(session);
		return { user: { id, email, name: name ?? '', role: role ?? null } };
	};
}
