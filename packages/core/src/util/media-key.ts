/**
 * Derive the extension from a MIME type. Splits on `+` (structured suffix,
 * `image/svg+xml` -> `svg`) and `;` (parameters, `text/plain;charset=utf-8`
 * -> `plain`).
 */
export function extensionForMime(mime: string): string {
	return (
		mime
			.split('/')[1]
			?.split(/[+;]/)[0]
			?.replace(/[^a-z0-9-]/gi, '') || 'bin'
	);
}

/** 128 bits of SHA-256 — collision-resistant enough to key a bucket, short enough to read in a URL. */
const KEY_HEX_CHARS = 32;

/**
 * Content-addressed storage key: `folder/<hash>.<ext>`.
 *
 * Keying by content rather than by a fresh id makes uploads idempotent. The
 * upload path writes the blob before the row that references it, so a failed
 * insert is compensated by deleting the blob — but if that delete also fails,
 * or the process dies first, the object is stranded. With a random key every
 * retry strands another copy; with a content key the retry overwrites the
 * same object, so repeated failures cost one orphan rather than N.
 *
 * It also deduplicates honestly: the same asset uploaded twice occupies one
 * object instead of two.
 */
export async function contentKey(
	bytes: Uint8Array,
	mime: string,
	folder?: string,
): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
	const hash = Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
		.slice(0, KEY_HEX_CHARS);
	const name = `${hash}.${extensionForMime(mime)}`;
	const prefix = folder?.replace(/^\/+|\/+$/g, '');
	return prefix ? `${prefix}/${name}` : name;
}
