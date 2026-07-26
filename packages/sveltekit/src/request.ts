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

let warnedNoScope = false;

function warnNoScopeOnce(): void {
	if (warnedNoScope) return;
	warnedNoScope = true;
	console.warn(
		'[better-cms] auth is configured but no request scope is active — treating this call as anonymous. Inside SvelteKit this means cmsHandle is not installed in src/hooks.server.ts.',
	);
}

/**
 * Resolved auth contexts, keyed by request *and then by config*.
 *
 * The second key is not optional. An app may mount more than one CMS — a
 * multi-tenant setup, or a sub-site with its own store — and each carries its
 * own `auth.context` provider. Caching one context per request would hand the
 * second CMS the first one's identity without ever calling its provider, so
 * its access policies would authorize against the wrong user or tenant.
 *
 * Both levels are weak, and the cache is module-private rather than a
 * property on `event.locals`: nothing the app writes into locals can collide
 * with it or forge an entry, and neither the event nor a discarded config is
 * pinned in memory.
 */
const ctxByRequest = new WeakMap<RequestEvent, WeakMap<object, { value: unknown }>>();

/**
 * Resolve the auth context for the active request, memoized per (request,
 * config) so a request issuing several operations calls `auth.context()` once.
 * Caching a wrapper object rather than the value itself lets a legitimately
 * null context be cached and still be distinguished from "not yet resolved".
 */
export async function resolveRequestCtx<Ctx>(
	config: CmsConfig<any, Ctx>,
): Promise<Ctx | undefined> {
	if (!config.auth) return undefined;
	const event = currentEvent();
	if (!event) {
		// Ops still run — a CLI or cron job legitimately has no request — but
		// auth is configured, so they run unauthenticated and every write will
		// be denied by policy. Say so once rather than letting it look like a
		// permissions bug.
		warnNoScopeOnce();
		return undefined;
	}

	let perConfig = ctxByRequest.get(event);
	if (!perConfig) {
		perConfig = new WeakMap();
		ctxByRequest.set(event, perConfig);
	}

	const cached = perConfig.get(config);
	if (cached) return cached.value as Ctx;

	const value = (await config.auth.context(event.request)) as Ctx;
	perConfig.set(config, { value });
	return value;
}
