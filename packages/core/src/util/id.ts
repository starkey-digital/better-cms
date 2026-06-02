/**
 * URL-safe id. Uses crypto.randomUUID when available, otherwise CSPRNG bytes serialized to hex.
 */
export function generateId(prefix?: string): string {
	const id = globalThis.crypto?.randomUUID
		? globalThis.crypto.randomUUID().replace(/-/g, '')
		: Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
	return prefix ? `${prefix}_${id}` : id;
}
