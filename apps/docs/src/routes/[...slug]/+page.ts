import { resolve } from '$app/paths';
import { error } from '@sveltejs/kit';
import { docs, getDoc, renderMarkdown } from '#lib/content.ts';

export const prerender = true;

export function entries() {
	return docs.map((d) => ({ slug: d.slug }));
}

export async function load({ params }: { params: { slug: string } }) {
	const doc = getDoc(params.slug);
	if (!doc) throw error(404, `No doc at ${params.slug}`);
	return {
		title: doc.title,
		html: await renderMarkdown(doc.source, resolve('').replace(/\/$/, '')),
	};
}
