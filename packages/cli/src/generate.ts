import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getCMSTables } from '@better-cms/core';
import { loadConfig } from './load-config.js';
import { generateDrizzleSchema, generateTypes } from './generate-drizzle.js';

export interface GenerateOpts {
	cwd?: string;
	configPath?: string;
	out?: string;
	target?: 'drizzle' | 'types';
}

export async function generate(opts: GenerateOpts = {}): Promise<{ path: string }> {
	const cwd = opts.cwd ?? process.cwd();
	const { config } = await loadConfig(cwd, opts.configPath);
	const schema = getCMSTables(config);

	const target = opts.target ?? 'drizzle';
	const defaultOut = target === 'drizzle' ? 'src/lib/cms-schema.ts' : 'src/lib/cms-types.ts';
	const outPath = resolve(cwd, opts.out ?? defaultOut);
	const code = target === 'drizzle' ? generateDrizzleSchema(schema) : generateTypes(schema);

	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, code, 'utf8');
	return { path: outPath };
}
