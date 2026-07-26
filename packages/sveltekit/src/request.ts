import { AsyncLocalStorage } from 'node:async_hooks';
import type { CmsConfig } from '@better-cms/core';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Request scope for server-side CMS calls.
 *
 * SvelteKit has its own equivalent in `getRequestEvent()`, but that lives
 * behind the `$app/server` virtual module. Vite externalizes this package's
 * published `dist/` for SSR, so Node resolves the import itself and fails on
 * the bare `$app` specifier — reaching it would mean either depending on
 * `@sveltejs/kit/internal/*` or making every consumer add `ssr.noExternal`.
 * Owning the scope here costs a few lines and keeps the install clean.
 *
 * `cmsHandle` opens the scope; anything downstream in the same request —
 * load functions, remote functions, `+server.ts` — reads it without threading
 * the event through every call.
 */
const als = new AsyncLocalStorage<RequestEvent>();

/** Run `fn` with `event` visible to `currentEvent()` anywhere downstream. */
export function withRequestEvent<T>(event: RequestEvent, fn: () => T | Promise<T>): T | Promise<T> {
	return als.run(event, fn);
}

/** The active SvelteKit request, or `null` outside a request scope. */
export function currentEvent(): RequestEvent | null {
	return als.getStore() ?? null;
}

const CTX_KEY = '__betterCmsCtx';

type CtxCarrier = Record<string, unknown> & {
	[CTX_KEY]?: { value: unknown };
};

/**
 * Resolve the auth context for the active request, memoized on `event.locals`
 * so a request issuing several operations calls `auth.context()` once.
 * Caching a wrapper object rather than the value itself lets a legitimately
 * null context be cached and still distinguished from "not yet resolved".
 */
export async function resolveRequestCtx<Ctx>(
	config: CmsConfig<any, Ctx>,
): Promise<Ctx | undefined> {
	if (!config.auth) return undefined;
	const event = currentEvent();
	if (!event) return undefined;

	const locals = event.locals as CtxCarrier;
	const cached = locals[CTX_KEY];
	if (cached) return cached.value as Ctx;

	const value = (await config.auth.context(event.request)) as Ctx;
	locals[CTX_KEY] = { value };
	return value;
}
