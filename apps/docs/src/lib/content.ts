import { Marked } from 'marked';
import { createHighlighter, type Highlighter } from 'shiki';

const rawModules = import.meta.glob('../../../../docs/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

let highlighterPromise: Promise<Highlighter> | null = null;

const LANGS = [
	'ts',
	'tsx',
	'js',
	'jsx',
	'svelte',
	'bash',
	'sh',
	'json',
	'sql',
	'html',
	'css',
	'md',
] as const;

function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ['github-light', 'github-dark'],
			langs: LANGS as unknown as string[],
		});
	}
	return highlighterPromise;
}

export type DocEntry = {
	slug: string;
	path: string;
	title: string;
	source: string;
};

function pathToSlug(path: string): string {
	const rel = path.replace(/^.*\/docs\//, '').replace(/\.md$/, '');
	if (rel === 'index') return '';
	return rel.replace(/\/index$/, '');
}

function extractTitle(source: string, fallback: string): string {
	const m = source.match(/^#\s+(.+)$/m);
	return m?.[1]?.trim() ?? fallback;
}

const entries: DocEntry[] = Object.entries(rawModules).map(([path, source]) => {
	const slug = pathToSlug(path);
	return {
		slug,
		path,
		title: extractTitle(source, slug || 'Home'),
		source,
	};
});

export const docs = entries.sort((a, b) => a.slug.localeCompare(b.slug));

export function getDoc(slug: string): DocEntry | undefined {
	return docs.find((d) => d.slug === slug);
}

export async function renderMarkdown(source: string, base = ''): Promise<string> {
	const highlighter = await getHighlighter();
	const supported = new Set<string>(LANGS as unknown as string[]);

	const tokenHtml = new Map<string, string>();

	const instance = new Marked({
		async: true,
		walkTokens(token) {
			if (token.type !== 'code') return;
			const lang = (token.lang ?? '').trim().split(/\s+/)[0] || 'text';
			const safeLang = supported.has(lang) ? lang : 'text';
			const html = highlighter.codeToHtml(token.text, {
				lang: safeLang,
				themes: { light: 'github-light', dark: 'github-dark' },
				defaultColor: false,
			});
			tokenHtml.set(token.raw, html);
		},
		renderer: {
			code(token) {
				return tokenHtml.get(token.raw) ?? `<pre><code>${token.text}</code></pre>`;
			},
		},
	});

	let html = (await instance.parse(source)) as string;
	if (base) html = html.replace(/href="\/(?!\/)/g, `href="${base}/`);
	return html;
}

export type NavGroup = { title: string; items: DocEntry[] };

export function buildNav(): NavGroup[] {
	const groups = new Map<string, DocEntry[]>();
	for (const doc of docs) {
		const top = doc.slug === '' ? '' : (doc.slug.split('/')[0] ?? '');
		const key = top || 'Overview';
		const list = groups.get(key) ?? [];
		list.push(doc);
		groups.set(key, list);
	}
	return [...groups.entries()].map(([title, items]) => ({
		title: title.charAt(0).toUpperCase() + title.slice(1),
		items,
	}));
}
