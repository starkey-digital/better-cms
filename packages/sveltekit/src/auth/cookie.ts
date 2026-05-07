import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from './crypto.js';

export interface SessionPayload {
	uid: string;
	exp: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
	const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
	const sig = b64urlEncode(await hmacSign(secret, body));
	return `${body}.${sig}`;
}

export async function verifySession(
	token: string | undefined | null,
	secret: string,
): Promise<SessionPayload | null> {
	if (!token) return null;
	const dot = token.indexOf('.');
	if (dot < 1) return null;
	const body = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	const sigBytes = safeDecode(sig);
	if (!sigBytes) return null;
	if (!(await hmacVerify(secret, body, sigBytes))) return null;
	const bodyBytes = safeDecode(body);
	if (!bodyBytes) return null;
	let payload: SessionPayload;
	try {
		payload = JSON.parse(dec.decode(bodyBytes)) as SessionPayload;
	} catch {
		return null;
	}
	if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number') return null;
	if (payload.exp * 1000 <= Date.now()) return null;
	return payload;
}

function safeDecode(s: string): Uint8Array | null {
	try {
		return b64urlDecode(s);
	} catch {
		return null;
	}
}

export interface CookieSerializeOpts {
	name: string;
	value: string;
	maxAge: number;
	path?: string;
	secure?: boolean;
	sameSite?: 'Strict' | 'Lax' | 'None';
}

export function serializeCookie(opts: CookieSerializeOpts): string {
	const parts = [
		`${opts.name}=${opts.value}`,
		`Path=${opts.path ?? '/'}`,
		`Max-Age=${opts.maxAge}`,
		'HttpOnly',
		`SameSite=${opts.sameSite ?? 'Lax'}`,
	];
	if (opts.secure ?? true) parts.push('Secure');
	return parts.join('; ');
}

export function clearCookie(name: string, path = '/'): string {
	return `${name}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

export function readCookie(request: Request, name: string): string | null {
	const header = request.headers.get('cookie');
	if (!header) return null;
	for (const part of header.split(/;\s*/)) {
		const eq = part.indexOf('=');
		if (eq < 0) continue;
		if (part.slice(0, eq) === name) return part.slice(eq + 1);
	}
	return null;
}

const TTL_RE = /^(\d+)([smhd])$/;

export function parseTtl(ttl: string | number): number {
	if (typeof ttl === 'number') return ttl;
	const m = TTL_RE.exec(ttl);
	if (!m) throw new Error(`invalid ttl: ${ttl}`);
	const n = Number(m[1]);
	switch (m[2]) {
		case 's':
			return n;
		case 'm':
			return n * 60;
		case 'h':
			return n * 3600;
		case 'd':
			return n * 86400;
	}
	throw new Error(`invalid ttl unit: ${ttl}`);
}
