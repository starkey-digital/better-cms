import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false, // tests share a single libsql DB; run serial
	workers: 1,
	retries: 0,
	reporter: 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		// Always launch a fresh dev server with a clean DB. Reusing a stale
		// server pollutes state across runs and made `togglePublished` flake.
		command: `rm -f local.db && bun run dev --port ${PORT}`,
		port: PORT,
		reuseExistingServer: false,
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: 30_000,
	},
});
