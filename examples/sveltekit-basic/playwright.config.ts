import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;
// Capture dev-server stdout+stderr to test-results/dev-server.log so failed
// runs can surface "module X failed to import"-style errors that don't show
// up in browser traces. tee preserves the live stream Playwright reads via
// `stdout: 'pipe'` so port detection still works.
const LOG_PATH = 'test-results/dev-server.log';

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
		// Output tee'd to test-results/dev-server.log so failed runs leave a
		// readable server log alongside the trace.zip / video.webm.
		command: `mkdir -p test-results && rm -f local.db && bun run dev --port ${PORT} 2>&1 | tee ${LOG_PATH}`,
		port: PORT,
		reuseExistingServer: !!process.env.PW_REUSE,
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: 30_000,
	},
});
