import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage<{ request: Request }>();

/** Run `fn` with `request` available to `getCurrentRequest()` calls anywhere downstream. */
export function withRequest<T>(request: Request, fn: () => T | Promise<T>): T | Promise<T> {
	return als.run({ request }, fn);
}

/** Returns the request the surrounding `cmsHandle` set, or `null` outside a request scope. */
export function getCurrentRequest(): Request | null {
	return als.getStore()?.request ?? null;
}
