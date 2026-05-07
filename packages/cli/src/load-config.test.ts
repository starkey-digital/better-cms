import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './load-config.js';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'bcms-loadconfig-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const STUB_CONFIG = `export default {
	collections: { posts: { kind: 'collection', fields: {} } },
	adapter: () => ({ findMany: async () => [], findOne: async () => null, count: async () => 0 }),
};
`;

describe('loadConfig', () => {
	test('finds cms.config.ts in src/lib/ without a hint', async () => {
		mkdirSync(join(dir, 'src', 'lib'), { recursive: true });
		writeFileSync(join(dir, 'src', 'lib', 'cms.config.ts'), STUB_CONFIG);
		const { path } = await loadConfig(dir);
		expect(path).toContain('src/lib/cms.config.ts');
	});

	test('finds cms.config.ts at project root', async () => {
		writeFileSync(join(dir, 'cms.config.ts'), STUB_CONFIG);
		const { path } = await loadConfig(dir);
		expect(path).toMatch(/cms\.config\.ts$/);
	});

	test('reports import errors with the originating path instead of "not found"', async () => {
		mkdirSync(join(dir, 'src', 'lib'), { recursive: true });
		writeFileSync(
			join(dir, 'src', 'lib', 'cms.config.ts'),
			`import 'this-module-truly-does-not-exist-bcms-test';\nexport default {};\n`,
		);
		await expect(loadConfig(dir)).rejects.toThrow(
			/failed to load[\s\S]*this-module-truly-does-not-exist-bcms-test/,
		);
	});

	test('throws "no cms.config found" when nothing exists', async () => {
		await expect(loadConfig(dir)).rejects.toThrow(/No cms\.config found/);
	});

	test('respects the --config hint and surfaces its errors directly', async () => {
		const explicit = join(dir, 'custom.config.ts');
		writeFileSync(explicit, `import 'another-missing-module-bcms-test';\nexport default {};\n`);
		await expect(loadConfig(dir, explicit)).rejects.toThrow(/another-missing-module-bcms-test/);
	});
});
