import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CMSConfig } from '@better-cms/core';

const CANDIDATES = ['src/lib/server/cms', 'src/lib/cms', 'src/cms', 'cms'].flatMap((base) => [
	`${base}.ts`,
	`${base}.js`,
]);

export async function loadConfig(
	cwd: string,
	hint?: string,
): Promise<{ config: CMSConfig; path: string }> {
	const candidates = hint ? [resolve(cwd, hint)] : CANDIDATES.map((p) => resolve(cwd, p));

	const { createJiti } = await import('jiti');
	const jiti = createJiti(import.meta.url, { interopDefault: true });

	const errors: { path: string; error: Error }[] = [];

	for (const path of candidates) {
		if (!hint && !existsSync(path)) continue;
		try {
			const mod = (await jiti.import(path)) as { default?: CMSConfig } | CMSConfig;
			const config = (mod as { default?: CMSConfig }).default ?? (mod as CMSConfig);
			if (!config || !('collections' in config)) {
				throw new Error(`config at ${path} did not export a CMS config (default export expected)`);
			}
			return { config, path };
		} catch (e) {
			if (hint) throw e;
			errors.push({ path, error: e as Error });
		}
	}

	if (errors.length) {
		const detail = errors.map(({ path, error }) => `  ${path}\n    → ${error.message}`).join('\n');
		throw new Error(
			`[better-cms] Found cms file(s) but they failed to load:\n${detail}\n\nPass --config <path> to override.`,
		);
	}

	throw new Error(
		`[better-cms] No cms config found. Checked: ${CANDIDATES.join(', ')}. Pass --config <path> to override.`,
	);
}
