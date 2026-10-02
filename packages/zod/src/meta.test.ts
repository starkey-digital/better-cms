import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { collection, singleton } from './collection.js';
import { image, slug } from './helpers.js';
import { zodToFields } from './walker.js';

describe('field meta', () => {
	test('label, description, placeholder, hidden land on FieldDef', () => {
		const f = zodToFields(
			z.object({
				title: z
					.string()
					.meta({ label: 'Headline', description: 'Shown on the card', placeholder: 'Tour' }),
				secret: z.string().meta({ hidden: true }),
			}),
		);
		expect(f.title).toMatchObject({
			label: 'Headline',
			description: 'Shown on the card',
			placeholder: 'Tour',
		});
		expect(f.secret?.hidden).toBe(true);
	});

	test('.describe() maps to description', () => {
		const f = zodToFields(z.object({ title: z.string().describe('Help text') }));
		expect(f.title?.description).toBe('Help text');
	});

	test('multiline sets editor.props.multiline on strings; dateOnly on dates', () => {
		const f = zodToFields(
			z.object({
				blurb: z.string().meta({ multiline: true }),
				plain: z.string(),
				day: z.date().meta({ dateOnly: true }),
				at: z.date(),
			}),
		);
		expect(f.blurb?.editor?.props?.multiline).toBe(true);
		expect(f.plain?.editor?.props?.multiline).toBe(false);
		expect(f.day?.editor?.props?.dateOnly).toBe(true);
		expect(f.at?.editor?.props?.dateOnly).toBeUndefined();
	});

	test('meta survives optional / nullable / default wrappers in either order', () => {
		const m = { label: 'L', multiline: true };
		const f = zodToFields(
			z.object({
				a: z.string().meta(m).optional(),
				b: z.string().optional().meta(m),
				c: z.string().meta(m).nullable().default('x'),
				d: z.string().default('x').nullable().meta(m),
				e: z.string().meta(m).optional().nullable(),
			}),
		);
		for (const k of ['a', 'b', 'c', 'd', 'e']) {
			expect(f[k]?.label).toBe('L');
			expect(f[k]?.editor?.props?.multiline).toBe(true);
		}
		expect(f.a?.required).toBe(false);
	});

	test('outer meta wins over inner', () => {
		const f = zodToFields(
			z.object({ a: z.string().meta({ label: 'inner' }).optional().meta({ label: 'outer' }) }),
		);
		expect(f.a?.label).toBe('outer');
	});

	test('arrays of objects carry per-subfield meta and itemLabel', () => {
		const f = zodToFields(
			z.object({
				tracks: z
					.array(
						z.object({
							title: z.string().meta({ label: 'Song' }),
							length: z.string().optional().meta({ label: 'Length' }),
						}),
					)
					.meta({ label: 'Tracks', itemLabel: 'Track' }),
			}),
		);
		expect(f.tracks).toMatchObject({ kind: 'array', label: 'Tracks' });
		expect(f.tracks?.editor?.props?.itemLabel).toBe('Track');
		const sub = f.tracks?.array?.of.object?.fields;
		expect(sub?.title?.label).toBe('Song');
		expect(sub?.length?.label).toBe('Length');
	});

	test('meta composes with helpers that register their own kind', () => {
		const f = zodToFields(z.object({ slug: slug().meta({ label: 'URL' }) }));
		expect(f.slug).toMatchObject({ kind: 'slug', label: 'URL' });
	});
});

describe('collection admin options', () => {
	const schema = z.object({
		venue: z.string(),
		date: z.date(),
		notes: z.array(z.string()),
		slug: z.string(),
	});

	test('accepts valid options and stores them on the def', () => {
		const def = collection({
			schema,
			label: 'Shows',
			description: 'Gigs',
			admin: {
				title: '{date} {venue}',
				sort: { field: 'date', direction: 'desc' },
				previewUrl: '/shows/{slug}',
				group: 'Live',
				itemLabel: 'show',
			},
		});
		expect(def.admin?.itemLabel).toBe('show');
		expect(def.label).toBe('Shows');
		expect(def.admin?.sort).toEqual({ field: 'date', direction: 'desc' });
	});

	test('itemLabel must not be blank', () => {
		expect(() => collection({ schema, admin: { itemLabel: ' ' } })).toThrow(/itemLabel/);
	});

	test('a bare title is a field name', () => {
		expect(() => collection({ schema, admin: { title: 'venue' } })).not.toThrow();
		expect(() => collection({ schema, admin: { title: 'nope' } })).toThrow(/admin\.title.*"nope"/);
	});

	test('unknown field in a template throws a clear error', () => {
		expect(() => collection({ schema, admin: { title: '{date} {city}' } })).toThrow(/"city"/);
		expect(() => singleton({ schema, admin: { previewUrl: '/{missing}' } })).toThrow(
			/admin\.previewUrl.*"missing"/,
		);
	});

	test('sort must name a column field', () => {
		expect(() =>
			collection({ schema, admin: { sort: { field: 'ghost', direction: 'asc' } } }),
		).toThrow(/"ghost"/);
		expect(() =>
			collection({ schema, admin: { sort: { field: 'notes', direction: 'asc' } } }),
		).toThrow(/not sortable/);
		expect(() =>
			collection({ schema, admin: { sort: { field: 'date', direction: 'up' as 'asc' } } }),
		).toThrow(/direction/);
	});

	test('system fields are valid sort targets', () => {
		expect(() =>
			collection({ schema, admin: { sort: { field: 'createdAt', direction: 'desc' } } }),
		).not.toThrow();
	});
});

describe('date coercion in create/update schemas', () => {
	const def = collection({
		schema: z.object({
			at: z.date(),
			day: z.date().meta({ dateOnly: true }),
			maybe: z.date().optional(),
		}),
	});
	const validate = (variant: 'create' | 'update', input: unknown) =>
		def.schemas[variant]['~standard'].validate(input) as Promise<{
			value?: Record<string, unknown>;
			issues?: unknown[];
		}>;

	test('datetime ISO string becomes the same instant', async () => {
		const r = await validate('create', { at: '2026-05-01T20:30:00.000Z', day: '2026-05-01' });
		expect((r.value?.at as Date).toISOString()).toBe('2026-05-01T20:30:00.000Z');
	});

	test('dateOnly YYYY-MM-DD is stored as UTC midnight', async () => {
		const r = await validate('create', { at: '2026-05-01T00:00:00Z', day: '2026-05-01' });
		expect((r.value?.day as Date).toISOString()).toBe('2026-05-01T00:00:00.000Z');
	});

	test('dateOnly drops the time of a full instant', async () => {
		const r = await validate('create', {
			at: '2026-05-01T00:00:00Z',
			day: '2026-05-01T23:59:59.000Z',
		});
		expect((r.value?.day as Date).toISOString()).toBe('2026-05-01T00:00:00.000Z');
	});

	test('update accepts strings and leaves absent fields absent', async () => {
		const r = await validate('update', { id: 'x', day: '2026-06-02' });
		expect(r.issues).toBeUndefined();
		expect(r.value).not.toHaveProperty('at');
		expect((r.value?.day as Date).toISOString()).toBe('2026-06-02T00:00:00.000Z');
	});

	test('optional date may be omitted; garbage is still rejected', async () => {
		expect(
			(await validate('create', { at: '2026-05-01', day: '2026-05-01' })).issues,
		).toBeUndefined();
		expect(
			(await validate('create', { at: 'tomorrow-ish', day: '2026-05-01' })).issues,
		).toBeDefined();
	});

	test('form schema applies dateOnly too', async () => {
		const r = (await def.schemas.form['~standard'].validate({
			at: '2026-05-01T10:00:00Z',
			day: '2026-05-01T10:00:00Z',
		})) as { value?: Record<string, Date> };
		expect(r.value?.day?.toISOString()).toBe('2026-05-01T00:00:00.000Z');
	});
});

describe('image field meta', () => {
	test('aspect, aspectLabel and maxSize reach editor props', () => {
		const f = zodToFields(
			z.object({
				cover: image().meta({
					aspect: [1, 16 / 9],
					aspectLabel: ['Square', 'Banner'],
					maxSize: 1600,
				}),
				plain: image(),
			}),
		);
		expect(f.cover?.editor?.props).toEqual({
			aspect: [1, 16 / 9],
			aspectLabel: ['Square', 'Banner'],
			maxSize: 1600,
		});
		expect(f.plain?.editor?.props).toBeUndefined();
	});
});
