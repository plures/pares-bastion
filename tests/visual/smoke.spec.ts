import { test, expect } from '@playwright/test';

const pages = [
	{ name: 'dashboard', path: '/' },
	{ name: 'scan', path: '/scan' },
	{ name: 'health', path: '/health' },
	{ name: 'config', path: '/config' },
	{ name: 'inventory', path: '/inventory' },
	{ name: 'vault', path: '/vault' },
	{ name: 'tunnels', path: '/tunnels' },
	{ name: 'partitions', path: '/partitions' },
	{ name: 'settings', path: '/settings' },
	{ name: 'license', path: '/license' },
];

for (const { name, path } of pages) {
	test(`${name} page loads without errors`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		await page.goto(path);
		await page.waitForLoadState('networkidle');

		expect(errors).toEqual([]);
	});

	test(`${name} page visual snapshot`, async ({ page }) => {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		await expect(page).toHaveScreenshot(`${name}.png`, {
			maxDiffPixelRatio: 0.01,
		});
	});
}
