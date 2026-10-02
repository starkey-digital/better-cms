/** Server validation errors look like `shows.ticketUrl: Invalid URL; shows.date: Invalid input`. */
export type ParsedError = { fields: Record<string, string>; general: string | null };

const FIELD_ERROR = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_.-]+): (.*)$/s;

export const NOT_A_WEB_ADDRESS = "That isn't a web address — it should start with https://";

/** Plain-words version of a zod/server message. */
export function plainMessage(raw: string): string {
	const m = raw.toLowerCase();
	if (m.includes('invalid url') || m.includes('web address')) return NOT_A_WEB_ADDRESS;
	if (m.includes('received undefined') || m.includes('received null') || m.includes('required'))
		return 'This is needed';
	const tooSmall = /(?:>=|at least )(\d+)/.exec(m);
	if (m.includes('too small') || m.includes('at least')) {
		return tooSmall && tooSmall[1] !== '1'
			? `That's too short — at least ${tooSmall[1]} characters`
			: 'This is needed';
	}
	const tooBig = /(?:<=|at most )(\d+)/.exec(m);
	if (m.includes('too big') || m.includes('at most')) {
		return tooBig ? `That's too long — ${tooBig[1]} characters at most` : "That's too long";
	}
	if (m.includes('expected number') || m.includes('not a number')) return 'That should be a number';
	if (m.includes('invalid date') || m.includes('expected date'))
		return "That isn't a date we can read";
	if (m.includes('invalid option') || m.includes('expected one of'))
		return 'Pick one of the choices';
	if (m.includes('must match pattern') || m.includes('invalid string'))
		return 'Use only lowercase letters, numbers and dashes';
	if (m.includes('unique') || m.includes('already exists'))
		return 'Something else already uses this';
	return "That doesn't look right";
}

/** Plain reason for a failure that isn't about one field. */
export function plainFailure(raw: string): string {
	const m = raw.toLowerCase();
	if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed'))
		return "we couldn't reach the server. Check your internet connection";
	if (m.includes('401') || m.includes('unauthorized'))
		return 'you have been signed out. Refresh the page and sign in again';
	if (m.includes('403') || m.includes('forbidden') || m.includes('denied'))
		return "you don't have permission to do that";
	if (m.includes('404') || m.includes('not found'))
		return "it isn't there any more. It may have been deleted";
	return 'something went wrong on our side. Try again in a moment';
}

export function parseServerError(raw: string, collection: string): ParsedError {
	const fields: Record<string, string> = {};
	const unmatched: string[] = [];
	for (const part of raw.split('; ')) {
		const m = FIELD_ERROR.exec(part.trim());
		if (m && m[1] === collection) fields[m[2]!] = plainMessage(m[3]!);
		else unmatched.push(part);
	}
	const general = unmatched.length ? plainFailure(unmatched.join('; ')) : null;
	return { fields, general };
}

/** The error to show beside `name`: its own, or one from inside it (`tracks.0.url`). */
export function errorFor(errors: Record<string, string>, name: string): string | undefined {
	if (errors[name]) return errors[name];
	const prefix = `${name}.`;
	const key = Object.keys(errors).find((k) => k.startsWith(prefix));
	return key ? errors[key] : undefined;
}

/** Errors under `name.`, re-keyed relative to it (`tracks.0.url` -> `0.url`). */
export function errorsWithin(errors: Record<string, string>, name: string): Record<string, string> {
	const prefix = `${name}.`;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(errors))
		if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
	return out;
}

/** What to say about a whole failure: the first field message, else the general reason. */
export function failureReason(p: ParsedError, labelOf: (path: string) => string): string {
	const first = Object.entries(p.fields)[0];
	if (first) return `${labelOf(first[0])}: ${first[1]}`;
	return p.general ?? plainFailure('');
}
