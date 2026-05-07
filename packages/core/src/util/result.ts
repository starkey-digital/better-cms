export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
	return { ok: false, error };
}

export class CmsError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly status: number = 500,
		readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = 'CmsError';
	}
}

export const errors = {
	notFound: (what: string) => new CmsError(`${what} not found`, 'NOT_FOUND', 404),
	forbidden: (msg = 'Forbidden') => new CmsError(msg, 'FORBIDDEN', 403),
	unauthorized: (msg = 'Unauthorized') => new CmsError(msg, 'UNAUTHORIZED', 401),
	validation: (msg: string, details?: Record<string, unknown>) =>
		new CmsError(msg, 'VALIDATION', 400, details),
	conflict: (msg: string) => new CmsError(msg, 'CONFLICT', 409),
	badRequest: (msg: string) => new CmsError(msg, 'BAD_REQUEST', 400),
};
