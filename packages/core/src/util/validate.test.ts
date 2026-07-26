import { describe, expect, test } from 'bun:test';
import type { CollectionDef, FieldDef } from '../ir/types.js';
import { deserializeRow, serializeRow, serializeWhere } from './validate.js';

const fields: Record<string, FieldDef> = {
	title: { kind: 'text', storage: 'column', columnType: 'text', scalarType: 'string' },
	published: { kind: 'boolean', storage: 'column', columnType: 'integer', scalarType: 'boolean' },
	createdAt: { kind: 'date', storage: 'column', columnType: 'integer', scalarType: 'date' },
	tags: { kind: 'array', storage: 'json', columnType: 'text' },
};

const def = { kind: 'collection', fields } as unknown as CollectionDef;

describe('serializeRow', () => {
	test('encodes booleans, dates and json per field storage', () => {
		const at = new Date('2024-01-02T03:04:05.000Z');
		expect(serializeRow(def, { title: 'x', published: true, createdAt: at, tags: ['a'] })).toEqual({
			title: 'x',
			published: 1,
			createdAt: at.getTime(),
			tags: '["a"]',
		});
	});

	test('maps present-but-undefined to null so drivers can bind it', () => {
		// libsql (and most drivers) reject `undefined` outright. A cleared
		// optional form field arrives this way.
		expect(serializeRow(def, { title: undefined })).toEqual({ title: null });
		expect(serializeRow(def, { title: null })).toEqual({ title: null });
	});

	test('leaves absent keys absent so partial updates do not clear columns', () => {
		expect(serializeRow(def, { title: 'only' })).toEqual({ title: 'only' });
	});

	test('passes unknown fields through untouched', () => {
		expect(serializeRow(def, { extra: 'raw' })).toEqual({ extra: 'raw' });
	});
});

describe('deserializeRow', () => {
	test('is the inverse of serializeRow for the supported types', () => {
		const at = new Date('2024-01-02T03:04:05.000Z');
		const row = serializeRow(def, {
			title: 'x',
			published: false,
			createdAt: at,
			tags: ['a', 'b'],
		});
		expect(deserializeRow(def, row)).toEqual({
			title: 'x',
			published: false,
			createdAt: at,
			tags: ['a', 'b'],
		});
	});

	test('drops nulls so optional fields read back as absent', () => {
		expect(deserializeRow(def, { title: 'x', tags: null })).toEqual({ title: 'x' });
	});
});

describe('serializeWhere', () => {
	test('encodes plain equality values through the field codec', () => {
		expect(serializeWhere(def, { published: true })).toEqual({ published: 1 });
	});

	test('encodes values inside operator conditions', () => {
		const at = new Date('2024-01-02T03:04:05.000Z');
		expect(serializeWhere(def, { createdAt: { gt: at } })).toEqual({
			createdAt: { gt: at.getTime() },
		});
	});

	test('encodes every member of an `in` list', () => {
		expect(serializeWhere(def, { published: { in: [true, false] } })).toEqual({
			published: { in: [1, 0] },
		});
	});

	test('encodes every operator in a multi-op condition', () => {
		// Adapters AND together every key of an operator bag, so a range is a
		// legal condition. Encoding only the first would leave the rest as raw
		// Dates against an integer column and match the wrong rows.
		const from = new Date('2024-01-01T00:00:00.000Z');
		const to = new Date('2024-02-01T00:00:00.000Z');
		expect(serializeWhere(def, { createdAt: { gte: from, lte: to } })).toEqual({
			createdAt: { gte: from.getTime(), lte: to.getTime() },
		});
	});

	test('keeps a multi-op condition intact rather than collapsing it to a value', () => {
		expect(serializeWhere(def, { published: { ne: false, eq: true } })).toEqual({
			published: { ne: 0, eq: 1 },
		});
	});

	test('mixes `like` with other operators without encoding the pattern', () => {
		expect(serializeWhere(def, { title: { like: '%draft%', ne: 'skip' } })).toEqual({
			title: { like: '%draft%', ne: 'skip' },
		});
	});

	test('leaves `like` patterns alone — they are patterns, not field values', () => {
		expect(serializeWhere(def, { title: { like: '%draft%' } })).toEqual({
			title: { like: '%draft%' },
		});
	});

	test('passes unknown fields and nullish conditions through', () => {
		expect(serializeWhere(def, { nope: 'x', title: null })).toEqual({ nope: 'x', title: null });
	});

	test('returns undefined for an absent clause', () => {
		expect(serializeWhere(def, undefined)).toBeUndefined();
	});
});
