import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const dev = process.env.NODE_ENV !== 'production';
const base = (dev ? '' : (process.env.BASE_PATH ?? '/better-cms')) as '' | `/${string}`;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				fallback: '404.html',
				precompress: false,
				strict: true,
			}),
			paths: { base, relative: false },
			prerender: { entries: ['*'] },
		}),
	],
	server: {
		fs: { allow: ['../..'] },
	},
});
