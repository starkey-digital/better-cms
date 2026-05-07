import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false, // tests share a single libsql DB; run serial
	workers: 1,
	retries: 0,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'retain-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		// Reset DB before launching so tests start from a clean slate.
		command: 'rm -f local.db && bun run dev --port 5173',
		port: 5173,
		reuseExistingServer: !process.env.CI,
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: 30_000,
	},
});
