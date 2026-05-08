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
		// Default: fresh server + clean DB per invocation (reuse pollutes state
		// across runs, made togglePublished flake). Local iter loops can opt
		// out with PW_REUSE=1 to skip the ~500ms cold-start.
		command: `rm -f local.db && bun run dev --port ${PORT}`,
		port: PORT,
		reuseExistingServer: !!process.env.PW_REUSE,
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: 30_000,
	},
});
