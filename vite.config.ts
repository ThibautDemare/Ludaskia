import { defineConfig } from 'vitest/config';
export default defineConfig({
	base: '/Ludaskia/',
	build: { outDir: 'dist' },
	test: { environment: 'happy-dom' },
});
