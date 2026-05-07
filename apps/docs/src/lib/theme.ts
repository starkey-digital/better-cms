import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';
const KEY = 'better-cms-docs-theme';

export function getTheme(): Theme {
	if (!browser) return 'light';
	const stored = localStorage.getItem(KEY) as Theme | null;
	if (stored === 'light' || stored === 'dark') return stored;
	return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
	if (!browser) return;
	localStorage.setItem(KEY, theme);
	document.documentElement.dataset.theme = theme;
}

export function toggleTheme(): Theme {
	const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
	setTheme(next);
	return next;
}
