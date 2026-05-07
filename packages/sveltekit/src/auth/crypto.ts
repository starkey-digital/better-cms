const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
	const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
	const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/') + pad);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
	return diff === 0;
}

const PBKDF2_ITER = 100_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_SALTLEN = 16;

export async function hashPassword(password: string, iter = PBKDF2_ITER): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALTLEN));
	const hash = await pbkdf2(password, salt, iter);
	return `pbkdf2$sha256$${iter}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
	const parts = encoded.split('$');
	if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
	const iter = Number(parts[2]);
	if (!Number.isFinite(iter) || iter < 1) return false;
	const salt = b64urlDecode(parts[3]!);
	const expected = b64urlDecode(parts[4]!);
	const actual = await pbkdf2(password, salt, iter);
	return timingSafeEqual(actual, expected);
}

async function pbkdf2(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
		'deriveBits',
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: salt as BufferSource, iterations: iter, hash: 'SHA-256' },
		key,
		PBKDF2_KEYLEN * 8,
	);
	return new Uint8Array(bits);
}

export async function hmacSign(secret: string, payload: string): Promise<Uint8Array> {
	const key = await hmacKey(secret);
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
	return new Uint8Array(sig);
}

export async function hmacVerify(
	secret: string,
	payload: string,
	signature: Uint8Array,
): Promise<boolean> {
	const expected = await hmacSign(secret, payload);
	return timingSafeEqual(expected, signature);
}

const hmacKeyCache = new Map<string, Promise<CryptoKey>>();

async function hmacKey(secret: string): Promise<CryptoKey> {
	let promise = hmacKeyCache.get(secret);
	if (!promise) {
		promise = crypto.subtle.importKey(
			'raw',
			enc.encode(secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign', 'verify'],
		);
		hmacKeyCache.set(secret, promise);
	}
	return promise;
}
