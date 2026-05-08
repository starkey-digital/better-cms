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
	auth: {
		context: async (_request) => ({ user: { id: 'dev', role: 'admin' as const } }),
	},
	access: {
		list: () => true,
		read: () => true,
		create: (ctx) => ctx?.user.role === 'admin',
		update: (ctx) => ctx?.user.role === 'admin',
		delete: (ctx) => ctx?.user.role === 'admin',
	},
});

export default cms;
export type Cms = typeof cms;
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
import config from '$lib/server/cms';

export const handle = cmsHandle(config);
`;

const CLIENT_TEMPLATE = `import { createCmsClient } from 'better-cms/sveltekit';
import type { Cms } from './server/cms';

export const cmsClient = createCmsClient<Cms>({ basePath: '/api/cms' });
`;

const ADMIN_PAGE_SERVER_TEMPLATE = `import { clientCmsConfig } from 'better-cms/sveltekit/server';
import { cms } from '$lib/server/cms';

export const load = () => ({ cmsConfig: clientCmsConfig(cms) });
`;

const ADMIN_PAGE_TEMPLATE = `<script lang="ts">
import { CmsAdmin } from 'better-cms/admin';

let { data } = $props();
</script>

<CmsAdmin config={data.cms} />
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

const RUNTIME_DEPS = ['better-cms', 'zod', 'dotenv'];
const DEV_DEPS = ['drizzle-kit', '@libsql/client'];

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

	const files: { path: string; content: string }[] = [
		{ path: resolve(cwd, 'src/lib/server/cms.ts'), content: CONFIG_TEMPLATE },
		{ path: resolve(cwd, '.env.example'), content: ENV_TEMPLATE },
		{ path: resolve(cwd, 'src/hooks.server.ts'), content: HOOKS_TEMPLATE },
		{ path: resolve(cwd, 'drizzle.config.ts'), content: DRIZZLE_CONFIG_TEMPLATE },
		{ path: resolve(cwd, 'src/routes/cms/+page.server.ts'), content: ADMIN_PAGE_SERVER_TEMPLATE },
		{ path: resolve(cwd, 'src/routes/cms/+page.svelte'), content: ADMIN_PAGE_TEMPLATE },
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
