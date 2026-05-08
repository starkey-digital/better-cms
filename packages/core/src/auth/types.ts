/**
 * Bring-your-own-auth contract. The core CMS knows nothing about users —
 * consumers wire any auth provider that returns a request-scoped `Ctx`. The
 * resolved `Ctx` is threaded through every access check and lifecycle hook.
 *
 *   defineCMS<C, MyCtx>({
 *     auth: { context: (req) => resolveSession(req) },
 *     access: { create: (ctx) => ctx?.user?.role === 'admin' },
 *     ...
 *   })
 *
 * Pass `Ctx` as `T | null` if anonymous requests are valid — access functions
 * handle nullability explicitly.
 */
export type AuthContextFn<Ctx = unknown> = (
	request: Request,
) => Ctx | Promise<Ctx>;

export type AccessVerb = 'create' | 'read' | 'update' | 'delete';

export type AccessFn<Ctx = unknown, Doc = unknown> = (
	ctx: Ctx,
	doc?: Doc,
) => boolean | Promise<boolean>;

export type Access<Ctx = unknown, Doc = unknown> = Partial<
	Record<AccessVerb, AccessFn<Ctx, Doc>>
>;
