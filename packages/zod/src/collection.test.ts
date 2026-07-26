import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { collection } from './collection.js';
import { slug } from './helpers.js';

const posts = collection({
	schema: z.object({
		title: z.string().min(1),
		slug: slug(),
		views: z.number().default(0),
		published: z.boolean().default(false),
		archived: z.boolean().default(true).optional(),
	}),
});

const parse = (variant: 'create' | 'update', input: Record<string, unknown>) =>
	posts.schemas[variant]['~standard'].validate(input) as Promise<{
		issues?: readonly unknown[];
		value?: Record<string, unknown>;
	}>;

describe('schemas.update', () => {
	test('does not inject defaults for fields the patch left out', async () => {
		// The bug this guards: `.partial()` makes a key optional but zod still
		// applies its `.default()` when absent, so a patch touching only `title`
		// used to come back carrying `published: false` — which then overwrote a
		// published post on its way to the store.
		const res = await parse('update', { id: 'abc', title: 'Edited' });
		expect(res.issues).toBeUndefined();
		expect(res.value).toEqual({ id: 'abc', title: 'Edited' });
	});

	test('strips defaults regardless of which side .optional() sits on', async () => {
		const res = await parse('update', { id: 'abc' });
		expect(res.issues).toBeUndefined();
		expect(Object.keys(res.value ?? {})).toEqual(['id']);
	});

	test('still applies a value the patch does supply', async () => {
		const res = await parse('update', { id: 'abc', published: true });
		expect(res.value).toEqual({ id: 'abc', published: true });
	});

	test('still validates the fields it was given', async () => {
		const res = await parse('update', { id: 'abc', slug: 'Not Valid!' });
		expect(res.issues).toBeDefined();
	});
});

describe('schemas.create', () => {
	test('keeps applying defaults — they belong to create', async () => {
		const res = await parse('create', { title: 't', slug: 'a-slug' });
		expect(res.issues).toBeUndefined();
		expect(res.value).toMatchObject({ views: 0, published: false });
	});
});
