import { AsyncLocalStorage } from 'node:async_hooks';

interface Scope {
	request: Request;
	fetch?: typeof fetch;
}

const als = new AsyncLocalStorage<Scope>();

/** Run `fn` with `scope` available to `getCurrentRequest`/`getCurrentFetch` calls anywhere downstream. */
export function withRequest<T>(scope: Scope, fn: () => T | Promise<T>): T | Promise<T> {
	return als.run(scope, fn);
}

export function getCurrentRequest(): Request | null {
	return als.getStore()?.request ?? null;
}

/**
 * SvelteKit's request-scoped `event.fetch` (the one that resolves relative
 * URLs server-side). Returns `null` outside a request scope.
 */
export function getCurrentFetch(): typeof fetch | null {
	return als.getStore()?.fetch ?? null;
}
