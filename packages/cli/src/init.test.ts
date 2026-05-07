import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from './init.js';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'bcms-init-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function writePackageJson(extra: Record<string, unknown> = {}) {
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test', ...extra }, null, 2));
}

describe('init', () => {
	test('refuses to scaffold without a package.json', async () => {
		await expect(init({ cwd: dir, skipInstall: true })).rejects.toThrow(/no package\.json/);
	});

	test('writes the four scaffold files when package.json exists', async () => {
		writePackageJson();
		const res = await init({ cwd: dir, skipInstall: true });
		expect(res.written).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/src\/lib\/cms\.config\.ts$/),
				expect.stringMatching(/\.env\.example$/),
				expect.stringMatching(/src\/hooks\.server\.ts$/),
				expect.stringMatching(/drizzle\.config\.ts$/),
			]),
		);
	});

	test('emits a factory-form adapter (no eager process.env at module scope)', async () => {
		writePackageJson();
		await init({ cwd: dir, skipInstall: true });
		const cfg = readFileSync(join(dir, 'src/lib/cms.config.ts'), 'utf8');
		expect(cfg).toContain('adapter: ({ env }) =>');
		expect(cfg).not.toMatch(/^\s*adapter:\s*libsqlAdapter/m);
		expect(cfg).not.toMatch(/process\.env/);
	});

	test('hooks template uses $env/dynamic/private (no dotenv at runtime)', async () => {
		writePackageJson();
		await init({ cwd: dir, skipInstall: true });
		const hooks = readFileSync(join(dir, 'src/hooks.server.ts'), 'utf8');
		expect(hooks).toContain(`from '$env/dynamic/private'`);
		expect(hooks).toContain('cmsHandle(config, { env })');
		expect(hooks).not.toContain('dotenv');
	});

	test('skips files that already exist (no force)', async () => {
		writePackageJson();
		writeFileSync(join(dir, '.env.example'), 'EXISTING=1');
		const res = await init({ cwd: dir, skipInstall: true });
		expect(res.skipped.some((p) => p.endsWith('.env.example'))).toBe(true);
		expect(readFileSync(join(dir, '.env.example'), 'utf8')).toBe('EXISTING=1');
	});

	test('overwrites with --force', async () => {
		writePackageJson();
		writeFileSync(join(dir, '.env.example'), 'EXISTING=1');
		await init({ cwd: dir, skipInstall: true, force: true });
		expect(readFileSync(join(dir, '.env.example'), 'utf8')).not.toBe('EXISTING=1');
	});

	test('skipInstall + no lockfile prints manual install commands and writes nothing extra', async () => {
		writePackageJson();
		const res = await init({ cwd: dir, skipInstall: true });
		expect(res.installed).toEqual([]);
		expect(existsSync(join(dir, 'node_modules'))).toBe(false);
	});

	test('treats already-installed deps as installed (no install attempt)', async () => {
		writePackageJson({
			dependencies: { 'better-cms': '^0.0.0' },
			devDependencies: { 'drizzle-kit': '*', '@libsql/client': '*', dotenv: '*' },
		});
		writeFileSync(join(dir, 'bun.lock'), '# stub');
		const res = await init({ cwd: dir });
		expect(res.installed).toEqual([]);
	});
});
