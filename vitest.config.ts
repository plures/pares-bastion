import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
		environment: 'jsdom',
	},
});
