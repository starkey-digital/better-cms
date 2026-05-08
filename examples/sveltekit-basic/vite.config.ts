import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Pre-bundle zod so the first SSR request doesn't trigger a Vite
	// optimize+reload mid-test (drops hydration on the floor, breaks e2e).
	optimizeDeps: { include: ['zod'] },
});
