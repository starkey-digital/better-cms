import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectKitMajor, init } from './init.js';

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

	test('writes the scaffold under src/lib/cms', async () => {
		writePackageJson();
		const res = await init({ cwd: dir, skipInstall: true });
		expect(res.written).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/src\/lib\/cms\/server\/cms\.ts$/),
				expect.stringMatching(/src\/lib\/cms\/client\.ts$/),
				expect.stringMatching(/src\/lib\/cms\/cms\.remote\.ts$/),
				expect.stringMatching(/\.env\.example$/),
				expect.stringMatching(/src\/hooks\.server\.ts$/),
				expect.stringMatching(/drizzle\.config\.ts$/),
				expect.stringMatching(/src\/routes\/cms\/\+page\.svelte$/),
			]),
		);
		// The admin UI reads /_meta over HTTP now — no server loader to scaffold.
		expect(res.written.some((p) => /src\/routes\/cms\/\+page\.server\.ts$/.test(p))).toBe(false);
	});

	test('cms.ts is eager (server-only — process.env at module scope is fine)', async () => {
		writePackageJson();
		await init({ cwd: dir, skipInstall: true });
		const cfg = readFileSync(join(dir, 'src/lib/cms/server/cms.ts'), 'utf8');
		expect(cfg).toMatch(/adapter:\s*libsqlAdapter\(/);
		expect(cfg).not.toMatch(/adapter:\s*\(\{\s*env\s*\}\)/);
		expect(cfg).toContain(`required('DATABASE_URL')`);
		expect(cfg).toContain(`import 'dotenv/config'`);
	});

	test('hooks template imports the server-only cms module without env injection', async () => {
		writePackageJson();
		await init({ cwd: dir, skipInstall: true });
		const hooks = readFileSync(join(dir, 'src/hooks.server.ts'), 'utf8');
		expect(hooks).toContain(`from '$lib/cms/server/cms'`);
		expect(hooks).toContain('cmsHandle(cms)');
		expect(hooks).not.toContain('{ env }');
		expect(hooks).not.toContain('$env/dynamic/private');
	});

	test('cms.ts exports both the config and a typed `cms` API', async () => {
		writePackageJson();
		await init({ cwd: dir, skipInstall: true });
		const cfg = readFileSync(join(dir, 'src/lib/cms/server/cms.ts'), 'utf8');
		expect(cfg).toContain('export default cms;');
		expect(cfg).toContain('export const cms = createCms({');
	});

	test('admin route mounts CmsAdmin with the HTTP client', async () => {
		writePackageJson();
		await init({ cwd: dir, skipInstall: true });
		const page = readFileSync(join(dir, 'src/routes/cms/+page.svelte'), 'utf8');
		expect(page).toContain('CmsAdmin');
		expect(page).toContain('client={cmsClient}');
		const client = readFileSync(join(dir, 'src/lib/cms/client.ts'), 'utf8');
		expect(client).toContain('createCmsClient<Cms>');
	});

	test('remote template uses schemas.form for the write path', async () => {
		writePackageJson();
		await init({ cwd: dir, skipInstall: true });
		const remote = readFileSync(join(dir, 'src/lib/cms/cms.remote.ts'), 'utf8');
		expect(remote).toContain('form(cms.posts.schemas.form');
		expect(remote).toContain('query(');
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

	describe('SvelteKit version', () => {
		test('Kit 2 (declared) keeps $lib imports and writes no vite config or imports map', async () => {
			writePackageJson({ devDependencies: { '@sveltejs/kit': '^2.20.0' } });
			await init({ cwd: dir, skipInstall: true });
			const hooks = readFileSync(join(dir, 'src/hooks.server.ts'), 'utf8');
			expect(hooks).toContain(`from '$lib/cms/server/cms'`);
			expect(existsSync(join(dir, 'vite.config.ts'))).toBe(false);
			expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).imports).toBeUndefined();
		});

		test('unknown Kit version falls back to the Kit 2 scaffold', async () => {
			writePackageJson();
			await init({ cwd: dir, skipInstall: true });
			expect(readFileSync(join(dir, 'src/hooks.server.ts'), 'utf8')).toContain('$lib/');
		});

		test('Kit 3 scaffolds #lib imports with extensions, imports map and vite config', async () => {
			writePackageJson({ devDependencies: { '@sveltejs/kit': '^3.0.0' } });
			await init({ cwd: dir, skipInstall: true });
			const read = (p: string) => readFileSync(join(dir, p), 'utf8');
			expect(read('src/hooks.server.ts')).toContain(`from '#lib/cms/server/cms.ts'`);
			expect(read('src/routes/cms/+page.svelte')).toContain(`from '#lib/cms/client.ts'`);
			expect(read('src/lib/cms/client.ts')).toContain(`from './server/cms.ts'`);
			expect(read('src/lib/cms/cms.remote.ts')).toContain(`from '#lib/cms/server/cms.ts'`);
			for (const p of [
				'src/hooks.server.ts',
				'src/routes/cms/+page.svelte',
				'src/lib/cms/cms.remote.ts',
			]) {
				expect(read(p)).not.toContain('$lib');
			}
			expect(JSON.parse(read('package.json')).imports).toEqual({
				'#lib': './src/lib/index.ts',
				'#lib/*': './src/lib/*',
			});
			expect(read('vite.config.ts')).toContain('remoteFunctions: true');
			expect(read('vite.config.ts')).toContain('async: true');
		});

		test('Kit major comes from the installed package before the declared range', async () => {
			writePackageJson({ devDependencies: { '@sveltejs/kit': '^2.0.0' } });
			mkdirSync(join(dir, 'node_modules/@sveltejs/kit'), { recursive: true });
			writeFileSync(
				join(dir, 'node_modules/@sveltejs/kit/package.json'),
				JSON.stringify({ version: '3.1.0' }),
			);
			expect(detectKitMajor(dir)).toBe(3);
		});

		test('Kit 3 keeps an existing imports map and vite config that already has the flags', async () => {
			writePackageJson({
				devDependencies: { '@sveltejs/kit': '^3.0.0' },
				imports: { '#lib/*': './custom/*' },
			});
			writeFileSync(
				join(dir, 'vite.config.ts'),
				'sveltekit({ experimental: { remoteFunctions: true } })',
			);
			const res = await init({ cwd: dir, skipInstall: true });
			const imports = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).imports;
			expect(imports['#lib/*']).toBe('./custom/*');
			expect(imports['#lib']).toBe('./src/lib/index.ts');
			expect(res.skipped.some((p) => p.endsWith('vite.config.ts'))).toBe(false);
		});
	});
});
