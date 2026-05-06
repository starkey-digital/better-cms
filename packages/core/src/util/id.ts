/**
 * URL-safe id. Uses crypto.randomUUID when available, otherwise random base36.
 */
export function generateId(prefix?: string): string {
	const id =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID().replace(/-/g, '')
			: Math.random().toString(36).slice(2) + Date.now().toString(36);
	return prefix ? `${prefix}_${id}` : id;
}
