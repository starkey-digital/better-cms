export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
	return { ok: false, error };
}

export class CMSError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly status: number = 500,
		readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = 'CMSError';
	}
}

export const errors = {
	notFound: (what: string) => new CMSError(`${what} not found`, 'NOT_FOUND', 404),
	forbidden: (msg = 'Forbidden') => new CMSError(msg, 'FORBIDDEN', 403),
	unauthorized: (msg = 'Unauthorized') => new CMSError(msg, 'UNAUTHORIZED', 401),
	validation: (msg: string, details?: Record<string, unknown>) =>
		new CMSError(msg, 'VALIDATION', 400, details),
	conflict: (msg: string) => new CMSError(msg, 'CONFLICT', 409),
	badRequest: (msg: string) => new CMSError(msg, 'BAD_REQUEST', 400),
};
