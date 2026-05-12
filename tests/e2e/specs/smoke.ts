describe('Pares Bastion Smoke Test', () => {
	it('should load the main window', async () => {
		// Wait for the app to render
		const body = await $('body');
		await body.waitForExist({ timeout: 10000 });
	});

	it('should display navigation sidebar', async () => {
		const nav = await $('nav[aria-label="Main navigation"]');
		await expect(nav).toExist();
	});

	it('should navigate to scan page', async () => {
		const scanLink = await $('a[href="/scan"]');
		await scanLink.click();
		const heading = await $('h1');
		await expect(heading).toHaveText('Scan Runner');
	});

	it('should navigate to health page', async () => {
		const healthLink = await $('a[href="/health"]');
		await healthLink.click();
		const heading = await $('h1');
		await expect(heading).toExist();
	});
});
