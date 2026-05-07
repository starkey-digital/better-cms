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

	test('writes the scaffold into the server-only path', async () => {
		writePackageJson();
		const res = await init({ cwd: dir, skipInstall: true });
		expect(res.written).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/src\/lib\/server\/cms\.ts$/),
				expect.stringMatching(/\.env\.example$/),
				expect.stringMatching(/src\/hooks\.server\.ts$/),
				expect.stringMatching(/drizzle\.config\.ts$/),
				expect.stringMatching(/src\/routes\/cms\/\+page\.server\.ts$/),
				expect.stringMatching(/src\/routes\/cms\/\+page\.svelte$/),
			]),
		);
		expect(res.written.some((p) => /src\/lib\/cms\.config\.ts$/.test(p))).toBe(false);
	});

	test('cms.ts is eager (server-only — process.env at module scope is fine)', async () => {
		writePackageJson();
		await init({ cwd: dir, skipInstall: true });
		const cfg = readFileSync(join(dir, 'src/lib/server/cms.ts'), 'utf8');
		expect(cfg).toMatch(/adapter:\s*libsqlAdapter\(/);
		expect(cfg).not.toMatch(/adapter:\s*\(\{\s*env\s*\}\)/);
		expect(cfg).toContain(`required('DATABASE_URL')`);
		expect(cfg).toContain(`import 'dotenv/config'`);
	});

	test('hooks template imports the server-only cms module without env injection', async () => {
		writePackageJson();
		await init({ cwd: dir, skipInstall: true });
		const hooks = readFileSync(join(dir, 'src/hooks.server.ts'), 'utf8');
		expect(hooks).toContain(`from '$lib/server/cms'`);
		expect(hooks).toContain('cmsHandle(cms)');
		expect(hooks).not.toContain('{ env }');
		expect(hooks).not.toContain('$env/dynamic/private');
	});

	test('admin route uses clientCMSConfig from a +page.server.ts loader', async () => {
		writePackageJson();
		await init({ cwd: dir, skipInstall: true });
		const loader = readFileSync(join(dir, 'src/routes/cms/+page.server.ts'), 'utf8');
		expect(loader).toContain('clientCMSConfig');
		expect(loader).toContain(`from '$lib/server/cms'`);
		const page = readFileSync(join(dir, 'src/routes/cms/+page.svelte'), 'utf8');
		expect(page).toContain('CMSAdmin');
		expect(page).toContain('config={data.cms}');
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
			dependencies: { 'better-cms': '^0.0.0', dotenv: '*' },
			devDependencies: { 'drizzle-kit': '*', '@libsql/client': '*' },
		});
		writeFileSync(join(dir, 'bun.lock'), '# stub');
		const res = await init({ cwd: dir });
		expect(res.installed).toEqual([]);
	});
});
