import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/visual',
	snapshotDir: './tests/visual/snapshots',
	outputDir: './tests/visual/results',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium-dark',
			use: {
				...devices['Desktop Chrome'],
				colorScheme: 'dark',
			},
		},
	],
	webServer: {
		command: 'npm run preview',
		port: 4173,
		reuseExistingServer: !process.env.CI,
	},
});
