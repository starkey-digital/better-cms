import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getCmsTables } from '@better-cms/core';
import { generateClient } from './generate-client.js';
import { generateDrizzleSchema, generateTypes } from './generate-drizzle.js';
import { loadConfig } from './load-config.js';

export type GenerateTarget = 'drizzle' | 'types' | 'client';

export interface GenerateOpts {
	cwd?: string;
	configPath?: string;
	out?: string;
	target?: GenerateTarget;
}

const DEFAULT_OUT: Record<GenerateTarget, string> = {
	drizzle: 'src/lib/cms-schema.ts',
	types: 'src/lib/cms-types.ts',
	client: 'src/lib/cmsClient.ts',
};

export async function generate(opts: GenerateOpts = {}): Promise<{ path: string }> {
	const cwd = opts.cwd ?? process.cwd();
	const { config } = await loadConfig(cwd, opts.configPath);
	const schema = getCmsTables(config);

	const target: GenerateTarget = opts.target ?? 'drizzle';
	const outPath = resolve(cwd, opts.out ?? DEFAULT_OUT[target]);
	const code =
		target === 'drizzle'
			? generateDrizzleSchema(schema)
			: target === 'client'
				? generateClient(schema, config)
				: generateTypes(schema);

	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, code, 'utf8');
	return { path: outPath };
}
