import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// `vite dev` runs in Node, where wrangler's `.dev.vars` is not loaded. Reading
// it here puts the same values on `process.env` that the Workers runtime
// provides in production, so src/lib/cms/server/cms.ts is identical in both.
try {
	process.loadEnvFile('.dev.vars');
} catch {}

export default defineConfig(({ command }) => {
	// SvelteKit imports the server modules while building, to read page options,
	// and cms.ts requires its secrets at import time. A Workers deploy build
	// (CI, Workers Builds) has no secrets - they exist only in the runtime - so
	// stand in placeholders. Nothing is baked into the bundle.
	if (command === 'build') {
		process.env.DATABASE_URL ??= 'http://build.invalid';
		process.env.CMS_PASSWORD ??= 'build-time-placeholder';
		process.env.CMS_AUTH_SECRET ??= 'build-time-placeholder';
	}
	return {
		plugins: [
			sveltekit({
				adapter: adapter(),
				compilerOptions: { experimental: { async: true } },
				experimental: { remoteFunctions: true },
			}),
		],
	};
});
