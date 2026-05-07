import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CONFIG_TEMPLATE = `import { defineCMS, collection, text, slug, richText, image, boolean } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { s3Media } from 'better-cms/media/s3';

// Adapter + media are wrapped in thunks so the config module is safe to import
// from client code (e.g. <CMSAdmin {config}>). Thunks fire only on the server,
// when cmsHandle() boots the runtime — process.env reads stay out of the browser.
export default defineCMS({
	collections: {
		posts: collection({
			fields: {
				title: text({ required: true, max: 120 }),
				slug: slug({ from: 'title' }),
				excerpt: text({ multiline: true, max: 500 }),
				body: richText(),
				cover: image(),
				published: boolean({ defaultValue: false }),
			},
		}),
	},
	adapter: () =>
		libsqlAdapter({
			url: process.env.DATABASE_URL!,
			authToken: process.env.DATABASE_AUTH_TOKEN,
		}),
	media: () =>
		s3Media({
			bucket: process.env.S3_BUCKET!,
			region: process.env.S3_REGION,
			endpoint: process.env.S3_ENDPOINT,
			accessKeyId: process.env.S3_ACCESS_KEY_ID,
			secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
			publicBaseUrl: process.env.S3_PUBLIC_URL,
		}),
	auth: {
		getUser: async (_request) => ({ id: 'dev', email: 'dev@example.com', role: 'admin' }),
	},
});
`;

const ENV_TEMPLATE = `# Loaded by SvelteKit's $env/dynamic/private. For raw process.env access
# (e.g. inside cms.config.ts adapter thunks during local dev), add
# \`import 'dotenv/config'\` to src/hooks.server.ts.

DATABASE_URL=file:./local.db
DATABASE_AUTH_TOKEN=

S3_BUCKET=
S3_REGION=auto
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=
`;

const HOOKS_TEMPLATE = `// dotenv populates process.env so the adapter thunks in cms.config.ts can
// read DATABASE_URL etc. during local dev. SvelteKit's $env/dynamic/private
// works in route code but not in modules imported outside the request scope.
import 'dotenv/config';
import { cmsHandle } from 'better-cms/sveltekit';
import config from '$lib/cms.config';

export const handle = cmsHandle(config);
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

function detectPackageManager(cwd: string): PackageManager {
	if (existsSync(resolve(cwd, 'bun.lock')) || existsSync(resolve(cwd, 'bun.lockb'))) {
		return { name: 'bun', add: ['bun', 'add'], addDev: ['bun', 'add', '-d'] };
	}
	if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) {
		return { name: 'pnpm', add: ['pnpm', 'add'], addDev: ['pnpm', 'add', '-D'] };
	}
	if (existsSync(resolve(cwd, 'yarn.lock'))) {
		return { name: 'yarn', add: ['yarn', 'add'], addDev: ['yarn', 'add', '-D'] };
	}
	return { name: 'npm', add: ['npm', 'install'], addDev: ['npm', 'install', '-D'] };
}

const RUNTIME_DEPS = ['better-cms', 'dotenv'];
const DEV_DEPS = ['drizzle-kit', '@libsql/client'];

function alreadyInstalled(cwd: string, pkg: string): boolean {
	const pkgJsonPath = resolve(cwd, 'package.json');
	if (!existsSync(pkgJsonPath)) return false;
	try {
		const json = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		return Boolean(json.dependencies?.[pkg] ?? json.devDependencies?.[pkg]);
	} catch {
		return false;
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

	const files: { path: string; content: string }[] = [
		{ path: resolve(cwd, 'src/lib/cms.config.ts'), content: CONFIG_TEMPLATE },
		{ path: resolve(cwd, '.env.example'), content: ENV_TEMPLATE },
		{ path: resolve(cwd, 'src/hooks.server.ts'), content: HOOKS_TEMPLATE },
		{ path: resolve(cwd, 'drizzle.config.ts'), content: DRIZZLE_CONFIG_TEMPLATE },
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

	const installed: string[] = [];
	const missingRuntime = RUNTIME_DEPS.filter((d) => !alreadyInstalled(cwd, d));
	const missingDev = DEV_DEPS.filter((d) => !alreadyInstalled(cwd, d));

	if (opts.skipInstall) {
		const pm = detectPackageManager(cwd);
		if (missingRuntime.length) {
			console.log(`[better-cms] run: ${pm.add.join(' ')} ${missingRuntime.join(' ')}`);
		}
		if (missingDev.length) {
			console.log(`[better-cms] run: ${pm.addDev.join(' ')} ${missingDev.join(' ')}`);
		}
	} else if (missingRuntime.length || missingDev.length) {
		const pm = detectPackageManager(cwd);
		if (runInstall(cwd, pm, missingRuntime, false)) installed.push(...missingRuntime);
		if (runInstall(cwd, pm, missingDev, true)) installed.push(...missingDev);
	}

	return { written, installed, skipped };
}
