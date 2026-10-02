import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CONFIG_TEMPLATE = `import 'dotenv/config';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { s3Media } from 'better-cms/media/s3';
import { collection, createCms, image, richText, slug } from 'better-cms/sveltekit/server';
import { z } from 'zod';

function required(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(\`\${name} is required (set it in .env)\`);
	return v;
}

const PostSchema = z.object({
	title: z.string().min(1).max(120),
	slug: slug(),
	excerpt: z.string().max(500).optional(),
	body: richText(),
	cover: image().optional(),
	published: z.boolean().default(false),
});

export const cms = createCms({
	collections: {
		posts: collection({ schema: PostSchema }),
	},
	adapter: libsqlAdapter({
		url: required('DATABASE_URL'),
		authToken: process.env.DATABASE_AUTH_TOKEN,
	}),
	media: s3Media({
		bucket: required('S3_BUCKET'),
		region: process.env.S3_REGION,
		endpoint: process.env.S3_ENDPOINT,
		accessKeyId: process.env.S3_ACCESS_KEY_ID,
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
		publicBaseUrl: process.env.S3_PUBLIC_URL,
	}),
	// Uploads are denied until you say who may make them — this is writing
	// arbitrary bytes into your bucket, so it is deliberately not inferred
	// from the collection \`create\` policies below.
	mediaAccess: {
		upload: (ctx) => ctx?.user.role === 'admin',
		// maxBytes defaults to 10 MiB; mimeTypes default to images + PDF.
	},
	auth: {
		context: async (_request) => ({ user: { id: 'dev', role: 'admin' as const } }),
	},
	access: {
		read: () => true,
		create: (ctx) => ctx?.user.role === 'admin',
		update: (ctx) => ctx?.user.role === 'admin',
		delete: (ctx) => ctx?.user.role === 'admin',
	},
});

export default cms;
export type Cms = typeof cms;
`;

const CLIENT_TEMPLATE = `import { createCmsClient } from 'better-cms/sveltekit';
import type { Cms } from './server/cms@@EXT@@';

// HTTP client for the admin UI. Server code should import \`cms\` from
// ./server/cms directly instead — same API, no round trip.
export const cmsClient = createCmsClient<Cms>({ basePath: '/api/cms' });
`;

const REMOTE_TEMPLATE = `import { command, form, query } from '$app/server';
import { cms } from '@@LIB@@/cms/server/cms@@EXT@@';
import { z } from 'zod';

export const recentPosts = query(async () =>
	cms.posts.list({ limit: 10, orderBy: [{ field: 'createdAt', dir: 'desc' }] }),
);

export const getPost = query(z.string(), async (slug) => cms.posts.get(slug));

// \`schemas.form\` coerces FormData strings back to the declared types and
// accepts an optional \`id\`, so one form handles both create and edit.
export const savePost = form(cms.posts.schemas.form, async (data) => {
	const { id, ...values } = data;
	const row = id ? await cms.posts.update(id, values) : await cms.posts.create(values);
	await recentPosts().refresh();
	return { id: row.id };
});

export const deletePost = command(z.string(), async (id) => {
	await cms.posts.delete(id);
	await recentPosts().refresh();
});
`;

const ENV_TEMPLATE = `DATABASE_URL=file:./local.db
DATABASE_AUTH_TOKEN=

S3_BUCKET=
S3_REGION=auto
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=
`;

const HOOKS_TEMPLATE = `import { cmsHandle } from 'better-cms/sveltekit/server';
import cms from '@@LIB@@/cms/server/cms@@EXT@@';

export const handle = cmsHandle(cms);
`;

const ADMIN_PAGE_TEMPLATE = `<script lang="ts">
import { CmsAdmin } from 'better-cms/admin';
import { cmsClient } from '@@LIB@@/cms/client@@EXT@@';
</script>

<CmsAdmin client={cmsClient} />
`;

const DRIZZLE_CONFIG_TEMPLATE = `import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/cms-schema.ts',
	out: './drizzle',
	dialect: 'turso',
	dbCredentials: {
		url: process.env.DATABASE_URL!,
		authToken: process.env.DATABASE_AUTH_TOKEN,
	},
});
`;

const VITE_CONFIG_TEMPLATE = `import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			// Required by the scaffolded cms.remote.ts and the admin UI.
			compilerOptions: { experimental: { async: true } },
			experimental: { remoteFunctions: true },
		}),
	],
});
`;

const KIT3_IMPORTS = { '#lib': './src/lib/index.ts', '#lib/*': './src/lib/*' };

export interface InitOpts {
	cwd?: string;
	force?: boolean;
	/** Skip dependency install. CLI surfaces install commands to run instead. */
	skipInstall?: boolean;
}

interface PackageManager {
	name: 'bun' | 'pnpm' | 'yarn' | 'npm';
	add: string[];
	addDev: string[];
}

const PM_TABLE: { lockfile: string; pm: PackageManager }[] = [
	{ lockfile: 'bun.lock', pm: { name: 'bun', add: ['bun', 'add'], addDev: ['bun', 'add', '-d'] } },
	{ lockfile: 'bun.lockb', pm: { name: 'bun', add: ['bun', 'add'], addDev: ['bun', 'add', '-d'] } },
	{
		lockfile: 'pnpm-lock.yaml',
		pm: { name: 'pnpm', add: ['pnpm', 'add'], addDev: ['pnpm', 'add', '-D'] },
	},
	{
		lockfile: 'yarn.lock',
		pm: { name: 'yarn', add: ['yarn', 'add'], addDev: ['yarn', 'add', '-D'] },
	},
	{
		lockfile: 'package-lock.json',
		pm: { name: 'npm', add: ['npm', 'install'], addDev: ['npm', 'install', '-D'] },
	},
];

/**
 * Returns the project's package manager based on its lockfile, or `null` if no
 * lockfile is present. We refuse to guess when no lockfile exists — silently
 * defaulting to npm in (e.g.) a bun project that hasn't been installed yet
 * would create a stray package-lock.json and split the dependency graph.
 */
function detectPackageManager(cwd: string): PackageManager | null {
	for (const { lockfile, pm } of PM_TABLE) {
		if (existsSync(resolve(cwd, lockfile))) return pm;
	}
	return null;
}

// `@libsql/client` is an optional peer of the libsql adapter, not a transitive
// dependency — the server imports it at runtime, so it belongs here rather than
// in dev deps. Scaffolds default to the libsql adapter; a project that swaps in
// drizzle or S3 installs those drivers itself.
const RUNTIME_DEPS = ['better-cms', 'zod', 'dotenv', '@libsql/client'];
const DEV_DEPS = ['drizzle-kit'];

/**
 * Major version of the project's `@sveltejs/kit`: the installed package first,
 * then the declared range. Unknown falls back to 2 (the legacy scaffold).
 */
export function detectKitMajor(cwd: string): number {
	type Pkg = {
		version?: string;
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	const read = (p: string): Pkg | null => {
		try {
			return JSON.parse(readFileSync(p, 'utf8')) as Pkg;
		} catch {
			return null;
		}
	};
	const installed = read(resolve(cwd, 'node_modules/@sveltejs/kit/package.json'))?.version;
	const root = read(resolve(cwd, 'package.json'));
	const declared =
		root?.devDependencies?.['@sveltejs/kit'] ?? root?.dependencies?.['@sveltejs/kit'];
	const m = /(\d+)/.exec(installed ?? declared ?? '');
	return m ? Number(m[1]) : 2;
}

const VITE_CONFIGS = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'];

function readInstalled(cwd: string): Set<string> {
	const pkgJsonPath = resolve(cwd, 'package.json');
	if (!existsSync(pkgJsonPath)) return new Set();
	try {
		const json = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		return new Set([
			...Object.keys(json.dependencies ?? {}),
			...Object.keys(json.devDependencies ?? {}),
		]);
	} catch {
		return new Set();
	}
}

function runInstall(cwd: string, pm: PackageManager, deps: string[], dev: boolean): boolean {
	if (deps.length === 0) return true;
	const argv = [...(dev ? pm.addDev : pm.add), ...deps];
	console.log(`[better-cms] $ ${argv.join(' ')}`);
	const res = spawnSync(argv[0]!, argv.slice(1), { cwd, stdio: 'inherit' });
	return res.status === 0;
}

function scaffoldKit3(cwd: string, written: string[], skipped: string[]) {
	const pkgJsonPath = resolve(cwd, 'package.json');
	const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
		imports?: Record<string, string>;
	};
	const missing = Object.entries(KIT3_IMPORTS).filter(([k]) => !pkg.imports?.[k]);
	if (missing.length) {
		pkg.imports = { ...pkg.imports, ...Object.fromEntries(missing) };
		writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
		written.push(pkgJsonPath);
	}

	const existing = VITE_CONFIGS.map((f) => resolve(cwd, f)).find(existsSync);
	if (!existing) {
		const path = resolve(cwd, 'vite.config.ts');
		writeFileSync(path, VITE_CONFIG_TEMPLATE, 'utf8');
		written.push(path);
	} else if (!readFileSync(existing, 'utf8').includes('remoteFunctions')) {
		skipped.push(existing);
		console.warn(
			`[better-cms] ${existing} needs these options on the sveltekit() plugin (SvelteKit 3 no longer reads svelte.config.js):
  compilerOptions: { experimental: { async: true } },
  experimental: { remoteFunctions: true },`,
		);
	}
}

export async function init(
	opts: InitOpts = {},
): Promise<{ written: string[]; installed: string[]; skipped: string[] }> {
	const cwd = opts.cwd ?? process.cwd();
	const written: string[] = [];
	const skipped: string[] = [];

	const pkgJsonPath = resolve(cwd, 'package.json');
	if (!existsSync(pkgJsonPath)) {
		throw new Error(
			`[better-cms] no package.json in ${cwd}. Run \`npm init\` (or your package manager's equivalent) and re-run \`bcms init\`.`,
		);
	}

	const kit3 = detectKitMajor(cwd) >= 3;
	const render = (t: string) =>
		t.replaceAll('@@LIB@@', kit3 ? '#lib' : '$lib').replaceAll('@@EXT@@', kit3 ? '.ts' : '');

	const files: { path: string; content: string }[] = [
		{ path: resolve(cwd, 'src/lib/cms/server/cms.ts'), content: render(CONFIG_TEMPLATE) },
		{ path: resolve(cwd, 'src/lib/cms/client.ts'), content: render(CLIENT_TEMPLATE) },
		{ path: resolve(cwd, 'src/lib/cms/cms.remote.ts'), content: render(REMOTE_TEMPLATE) },
		{ path: resolve(cwd, '.env.example'), content: render(ENV_TEMPLATE) },
		{ path: resolve(cwd, 'src/hooks.server.ts'), content: render(HOOKS_TEMPLATE) },
		{ path: resolve(cwd, 'drizzle.config.ts'), content: render(DRIZZLE_CONFIG_TEMPLATE) },
		{ path: resolve(cwd, 'src/routes/cms/+page.svelte'), content: render(ADMIN_PAGE_TEMPLATE) },
	];

	for (const file of files) {
		if (existsSync(file.path) && !opts.force) {
			console.warn(`[better-cms] ${file.path} exists — skipping (use --force to overwrite)`);
			skipped.push(file.path);
			continue;
		}
		mkdirSync(dirname(file.path), { recursive: true });
		writeFileSync(file.path, file.content, 'utf8');
		written.push(file.path);
	}

	if (kit3) {
		scaffoldKit3(cwd, written, skipped);
	}

	const installedDeps = readInstalled(cwd);
	const missingRuntime = RUNTIME_DEPS.filter((d) => !installedDeps.has(d));
	const missingDev = DEV_DEPS.filter((d) => !installedDeps.has(d));
	const installed: string[] = [];

	if (missingRuntime.length === 0 && missingDev.length === 0) {
		return { written, installed, skipped };
	}

	const pm = detectPackageManager(cwd);

	if (!pm) {
		console.log(
			`[better-cms] no lockfile detected — install manually:
  npm install ${missingRuntime.join(' ')}
  npm install -D ${missingDev.join(' ')}
(or use bun/pnpm/yarn equivalents). Re-run \`bcms init\` to confirm files are written.`,
		);
		return { written, installed, skipped };
	}

	if (opts.skipInstall) {
		if (missingRuntime.length) {
			console.log(`[better-cms] run: ${pm.add.join(' ')} ${missingRuntime.join(' ')}`);
		}
		if (missingDev.length) {
			console.log(`[better-cms] run: ${pm.addDev.join(' ')} ${missingDev.join(' ')}`);
		}
		return { written, installed, skipped };
	}

	if (runInstall(cwd, pm, missingRuntime, false)) installed.push(...missingRuntime);
	if (runInstall(cwd, pm, missingDev, true)) installed.push(...missingDev);

	return { written, installed, skipped };
}
