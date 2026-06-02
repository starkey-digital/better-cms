import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CmsConfig } from '@better-cms/core';
import type { Jiti } from 'jiti';

const CANDIDATES = [
	'src/lib/cms/server/cms',
	'src/lib/server/cms',
	'src/lib/cms',
	'src/cms',
	'cms',
].flatMap((base) => [`${base}.ts`, `${base}.js`]);

let jitiInstance: Jiti | undefined;

async function getJiti(): Promise<Jiti> {
	if (!jitiInstance) {
		const { createJiti } = await import('jiti');
		jitiInstance = createJiti(import.meta.url, { interopDefault: true });
	}
	return jitiInstance;
}

export async function loadConfig(
	cwd: string,
	hint?: string,
): Promise<{ config: CmsConfig; path: string }> {
	const candidates = hint ? [resolve(cwd, hint)] : CANDIDATES.map((p) => resolve(cwd, p));

	const jiti = await getJiti();

	const errors: { path: string; error: Error }[] = [];

	for (const path of candidates) {
		if (!hint && !existsSync(path)) continue;
		try {
			const mod = (await jiti.import(path)) as { default?: CmsConfig } | CmsConfig;
			const config = (mod as { default?: CmsConfig }).default ?? (mod as CmsConfig);
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
