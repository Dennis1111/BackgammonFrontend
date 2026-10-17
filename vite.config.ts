import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		port: 5173,
		proxy: {
			// Forwards API calls to the C++ BackgammonServer during local dev.
			'/api': {
				target: 'http://localhost:8080',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ''),
			},
		},
	},
});
