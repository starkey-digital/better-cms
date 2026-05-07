import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	format: ['esm'],
	entry: [
		'./src/index.ts',
		'./src/types.ts',
		'./src/adapters/libsql.ts',
		'./src/adapters/drizzle.ts',
		'./src/media/s3.ts',
		'./src/sveltekit/index.ts',
		'./src/sveltekit/remote.ts',
		'./src/sveltekit/auth.ts',
		'./src/admin/index.ts',
	],
	treeshake: true,
	clean: true,
	unbundle: true,
});
