import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CMSConfig } from '@better-cms/core';

const CANDIDATES = [
	'cms.config.ts',
	'cms.config.js',
	'src/cms.config.ts',
	'src/cms.config.js',
	'src/lib/cms.config.ts',
	'src/lib/cms.config.js',
];

export async function loadConfig(cwd: string, hint?: string): Promise<{ config: CMSConfig; path: string }> {
	const candidates = hint ? [resolve(cwd, hint)] : CANDIDATES.map((p) => resolve(cwd, p));

	const { createJiti } = await import('jiti');
	const jiti = createJiti(import.meta.url, { interopDefault: true });

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
		}
	}

	throw new Error(
		`[better-cms] No cms.config found. Checked: ${CANDIDATES.join(', ')}. Pass --config <path> to override.`,
	);
}
