import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { collection } from './collection.js';
import { image, richText, slug } from './helpers.js';

const posts = collection({
	schema: z.object({
		title: z.string().min(1),
		slug: slug(),
		body: richText().optional(),
		cover: image().optional(),
		views: z.number().int().optional(),
		publishedAt: z.date().optional(),
		tags: z.array(z.string()).optional(),
		published: z.boolean().default(false),
	}),
});

const parse = (input: Record<string, unknown>) =>
	posts.schemas.form['~standard'].validate(input) as Promise<{
		issues?: readonly unknown[];
		value?: Record<string, unknown>;
	}>;

describe('schemas.form', () => {
	test('coerces the string forms FormData submits', async () => {
		const res = await parse({
			title: 't',
			slug: 'a-slug',
			views: '42',
			publishedAt: '2024-01-02T03:04:05.000Z',
			tags: '["a","b"]',
			published: 'on',
		});
		expect(res.issues).toBeUndefined();
		expect(res.value).toMatchObject({
			views: 42,
			publishedAt: new Date('2024-01-02T03:04:05.000Z'),
			tags: ['a', 'b'],
			published: true,
		});
	});

	test('an absent checkbox falls through to the default rather than reading as true', async () => {
		const res = await parse({ title: 't', slug: 'a-slug' });
		expect(res.issues).toBeUndefined();
		expect(res.value?.published).toBe(false);
	});

	test('blank optional fields read as undefined, not empty strings', async () => {
		// The key survives; the value does not. `serializeRow` turns a
		// present-but-undefined value into the SQL null that clears the column,
		// which is what blanking the input is asking for.
		const res = await parse({ title: 't', slug: 'a-slug', body: '' });
		expect(res.issues).toBeUndefined();
		expect(res.value?.body).toBeUndefined();
	});

	test('a blank required field still reports its own message', async () => {
		const res = await parse({ title: '', slug: 'a-slug' });
		expect(res.issues).toBeDefined();
	});

	test('keeps richText bodies that happen to look like JSON as strings', async () => {
		// richText() is a z.string() stored as json. Parsing it would turn a body
		// of `2024` into a number and reject it as "expected string".
		for (const body of ['2024', 'true', 'null', '{"a": 1}', '[1,2]', '<p>hi</p>']) {
			const res = await parse({ title: 't', slug: 'a-slug', body });
			expect(res.issues).toBeUndefined();
			expect(res.value?.body).toBe(body);
		}
	});

	test('still parses genuinely structured json fields', async () => {
		const res = await parse({
			title: 't',
			slug: 'a-slug',
			cover: '{"key":"k","url":"/u"}',
		});
		expect(res.issues).toBeUndefined();
		expect(res.value?.cover).toEqual({ key: 'k', url: '/u' });
	});

	test('accepts an optional id so one schema covers create and edit', async () => {
		const res = await parse({ id: 'abc', title: 't', slug: 'a-slug' });
		expect(res.issues).toBeUndefined();
		expect(res.value?.id).toBe('abc');
	});
});
