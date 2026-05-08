import { describe, expect, test } from 'bun:test';
import { collection } from '../dsl/collection.js';
import { boolean, text } from '../dsl/fields.js';
import type { StandardSchemaV1 } from './standard-schema.js';

// Tiny hand-rolled Standard Schema validators so the test pulls in zero deps.
function stringMin(n: number, msg = 'too short'): StandardSchemaV1<unknown, string> {
	return {
		'~standard': {
			version: 1,
			vendor: 'test',
			validate: (value) => {
				if (typeof value !== 'string') return { issues: [{ message: 'expected string' }] };
				if (value.length < n) return { issues: [{ message: msg }] };
				return { value };
			},
		},
	};
}

function regex(re: RegExp, msg = 'pattern mismatch'): StandardSchemaV1<unknown, string> {
	return {
		'~standard': {
			version: 1,
			vendor: 'test',
			validate: (value) => {
				if (typeof value !== 'string') return { issues: [{ message: 'expected string' }] };
				if (!re.test(value)) return { issues: [{ message: msg }] };
				return { value };
			},
		},
	};
}

const POSTS = collection({
	fields: {
		title: text({ required: true, validation: stringMin(1, 'title required') }),
		slug: text({ required: true, validation: regex(/^[a-z0-9-]+$/) }),
		published: boolean(),
	},
});

describe('schemas.create', () => {
	test('accepts a valid post', async () => {
		const r = await POSTS.schemas.create['~standard'].validate({
			title: 'Hi',
			slug: 'hi',
			published: true,
		});
		expect(r.issues).toBeUndefined();
		expect(r.value).toEqual({ title: 'Hi', slug: 'hi', published: true });
	});

	test('rejects missing required fields', async () => {
		const r = await POSTS.schemas.create['~standard'].validate({ slug: 'hi' });
		expect(r.issues).toBeDefined();
		expect(r.issues!.some((i) => (i.path?.[0] as string) === 'title')).toBe(true);
	});

	test('runs per-field validation and surfaces field path', async () => {
		const r = await POSTS.schemas.create['~standard'].validate({
			title: 'Hi',
			slug: 'NotASlug',
		});
		expect(r.issues).toBeDefined();
		expect(r.issues![0]!.path?.[0]).toBe('slug');
	});

	test('passes through fields with no validation slot', async () => {
		const r = await POSTS.schemas.create['~standard'].validate({
			title: 'Hi',
			slug: 'hi',
			published: 'not-a-bool',
		});
		expect(r.issues).toBeUndefined();
		expect((r.value as { published: unknown }).published).toBe('not-a-bool');
	});
});

describe('schemas.update', () => {
	test('requires id', async () => {
		const r = await POSTS.schemas.update['~standard'].validate({ title: 'no id' });
		expect(r.issues).toBeDefined();
		expect(r.issues![0]!.path?.[0]).toBe('id');
	});

	test('all other fields are optional', async () => {
		const r = await POSTS.schemas.update['~standard'].validate({ id: 'abc' });
		expect(r.issues).toBeUndefined();
	});

	test('still runs per-field validation when present', async () => {
		const r = await POSTS.schemas.update['~standard'].validate({ id: 'abc', slug: 'BAD' });
		expect(r.issues).toBeDefined();
	});
});

describe('collection-level override', () => {
	const fixed: StandardSchemaV1<unknown, { ok: true }> = {
		'~standard': {
			version: 1,
			vendor: 'test',
			validate: () => ({ value: { ok: true } as const }),
		},
	};
	const OVERRIDDEN = collection({
		fields: { title: text({ required: true }) },
		validation: { create: fixed as StandardSchemaV1 },
	});

	test('replaces the auto-composed schema verbatim', async () => {
		const r = await OVERRIDDEN.schemas.create['~standard'].validate({});
		expect(r.issues).toBeUndefined();
		expect(r.value).toEqual({ ok: true } as never);
	});
});

describe('Standard Schema surface', () => {
	test('exposes the spec marker', () => {
		const std = POSTS.schemas.create['~standard'];
		expect(std.version).toBe(1);
		expect(typeof std.vendor).toBe('string');
		expect(typeof std.validate).toBe('function');
	});
});
