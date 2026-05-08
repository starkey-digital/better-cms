import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import type { CollectionDef } from '../ir/types.js';
import { buildSchema } from './build-schema.js';

const POSTS: CollectionDef = {
	kind: 'collection',
	timestamps: true,
	fields: {
		id: { kind: 'text', storage: 'column', columnType: 'text' },
		title: {
			kind: 'text',
			storage: 'column',
			columnType: 'text',
			scalarType: 'string',
			validation: { required: true, max: 120 },
		},
		slug: {
			kind: 'slug',
			storage: 'column',
			columnType: 'text',
			scalarType: 'string',
			validation: { required: true, pattern: '^[a-z0-9-]+$' },
		},
		published: {
			kind: 'boolean',
			storage: 'column',
			columnType: 'integer',
			scalarType: 'boolean',
			defaultValue: false,
			validation: {},
		},
		createdAt: { kind: 'date', storage: 'column', columnType: 'integer' },
		updatedAt: { kind: 'date', storage: 'column', columnType: 'integer' },
	},
};

describe('buildSchema(create)', () => {
	const schema = buildSchema(POSTS, 'create');

	test('accepts a valid post', () => {
		const r = v.safeParse(schema, { title: 'Hi', slug: 'hi', published: true });
		expect(r.success).toBe(true);
	});

	test('drops system fields (id, createdAt, updatedAt) from the input shape', () => {
		const r = v.safeParse(schema, {
			id: 'should-be-ignored',
			title: 'Hi',
			slug: 'hi',
			createdAt: new Date(),
		});
		// Valibot's default object behaviour ignores unknown keys.
		expect(r.success).toBe(true);
	});

	test('rejects missing required fields', () => {
		expect(v.safeParse(schema, { title: 'no slug' }).success).toBe(false);
		expect(v.safeParse(schema, { slug: 'no-title' }).success).toBe(false);
	});

	test('enforces max length', () => {
		expect(v.safeParse(schema, { title: 'x'.repeat(121), slug: 'ok' }).success).toBe(false);
	});

	test('enforces pattern', () => {
		expect(v.safeParse(schema, { title: 'Hi', slug: 'NoUpperCase' }).success).toBe(false);
	});

	test('accepts non-required fields as optional', () => {
		expect(v.safeParse(schema, { title: 'Hi', slug: 'hi' }).success).toBe(true); // published omitted
	});
});

describe('buildSchema(update)', () => {
	const schema = buildSchema(POSTS, 'update');

	test('requires id (lookup key)', () => {
		expect(v.safeParse(schema, { title: 'no id' }).success).toBe(false);
	});

	test('all other fields are optional', () => {
		expect(v.safeParse(schema, { id: 'abc' }).success).toBe(true);
		expect(v.safeParse(schema, { id: 'abc', title: 'patch' }).success).toBe(true);
	});

	test('still validates types when present', () => {
		expect(v.safeParse(schema, { id: 'abc', published: 'not-a-bool' }).success).toBe(false);
	});
});

describe('buildSchema Standard Schema surface', () => {
	test('returns a valibot schema (Standard Schema v1)', () => {
		const schema = buildSchema(POSTS, 'create');
		expect(schema).toHaveProperty('~standard');
		const std = (schema as { '~standard': { version: number; vendor: string } })['~standard'];
		expect(std.version).toBe(1);
		expect(std.vendor).toBe('valibot');
	});
});
