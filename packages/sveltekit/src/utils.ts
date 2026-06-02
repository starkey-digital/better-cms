/** Default API base path. Leaves `/cms` free for the user's admin route. */
export const DEFAULT_BASE_PATH = '/api/cms';

/** Strip a trailing slash and fall back to the default base path. */
export function normalizeBasePath(p?: string): string {
	return (p ?? DEFAULT_BASE_PATH).replace(/\/$/, '');
}
