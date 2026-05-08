import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { _resolveRelations, collection } from './collection.js';
import { file, image, indexed, relation, richText, slug, unique } from './helpers.js';
import { zodToFields } from './walker.js';

describe('zodToFields — primitives', () => {
	test('z.string → text/string', () => {
		const f = zodToFields(z.object({ title: z.string() }));
		expect(f.title).toMatchObject({
			kind: 'text',
			storage: 'column',
			columnType: 'text',
			scalarType: 'string',
			required: true,
		});
	});

	test('z.number → number/real', () => {
		const f = zodToFields(z.object({ score: z.number() }));
		expect(f.score).toMatchObject({ kind: 'number', columnType: 'real', scalarType: 'number' });
	});

	test('z.int → integer', () => {
		const f = zodToFields(z.object({ count: z.int() }));
		expect(f.count).toMatchObject({
			kind: 'integer',
			columnType: 'integer',
			scalarType: 'integer',
		});
	});

	test('z.boolean → boolean', () => {
		const f = zodToFields(z.object({ ok: z.boolean() }));
		expect(f.ok).toMatchObject({
			kind: 'boolean',
			columnType: 'integer',
			scalarType: 'boolean',
		});
	});

	test('z.date → date', () => {
		const f = zodToFields(z.object({ at: z.date() }));
		expect(f.at).toMatchObject({ kind: 'date', columnType: 'integer', scalarType: 'date' });
	});

	test('z.enum → select + options', () => {
		const f = zodToFields(z.object({ status: z.enum(['draft', 'published']) }));
		expect(f.status).toMatchObject({
			kind: 'select',
			scalarType: 'string',
			options: ['draft', 'published'],
		});
	});
});

describe('zodToFields — wrappers', () => {
	test('optional → required: false', () => {
		const f = zodToFields(z.object({ excerpt: z.string().optional() }));
		expect(f.excerpt!.required).toBe(false);
		expect(f.excerpt!.kind).toBe('text');
	});

	test('default → required: false + defaultValue', () => {
		const f = zodToFields(z.object({ published: z.boolean().default(false) }));
		expect(f.published!.required).toBe(false);
		expect(f.published!.defaultValue).toBe(false);
	});

	test('nullable → required: false (drizzle column allows NULL)', () => {
		const f = zodToFields(z.object({ note: z.string().nullable() }));
		expect(f.note!.required).toBe(false);
	});

	test('arrays unwrap element type', () => {
		const f = zodToFields(z.object({ tags: z.array(z.string()) }));
		expect(f.tags).toMatchObject({ kind: 'array', storage: 'json' });
		expect(f.tags!.array?.of.kind).toBe('text');
	});

	test('nested object → object kind, json storage', () => {
		const f = zodToFields(z.object({ author: z.object({ name: z.string() }) }));
		expect(f.author).toMatchObject({ kind: 'object', storage: 'json' });
		expect(f.author!.object?.fields.name?.kind).toBe('text');
	});
});

describe('zodToFields — helper tags', () => {
	test('richText() → kind: richText, json storage', () => {
		const f = zodToFields(z.object({ body: richText() }));
		expect(f.body).toMatchObject({ kind: 'richText', storage: 'json' });
	});

	test('image() → kind: image', () => {
		const f = zodToFields(z.object({ cover: image() }));
		expect(f.cover!.kind).toBe('image');
	});

	test('file() → kind: file', () => {
		const f = zodToFields(z.object({ doc: file() }));
		expect(f.doc!.kind).toBe('file');
	});

	test('slug() → kind: slug, unique + indexed', () => {
		const f = zodToFields(z.object({ slug: slug() }));
		expect(f.slug).toMatchObject({ kind: 'slug', unique: true, indexed: true });
	});

	test('unique() / indexed() → flags', () => {
		const f = zodToFields(
			z.object({
				email: unique(z.string()),
				tag: indexed(z.string()),
			}),
		);
		expect(f.email!.unique).toBe(true);
		expect(f.tag!.indexed).toBe(true);
	});
});

describe('zodToFields — system field auto-injection', () => {
	test('id, createdAt, updatedAt added when absent', () => {
		const f = zodToFields(z.object({ title: z.string() }));
		expect(f.id?.kind).toBe('text');
		expect(f.createdAt?.kind).toBe('date');
		expect(f.updatedAt?.kind).toBe('date');
	});
});

describe('zodToFields — fallback for unsupported', () => {
	test('union → json kind', () => {
		const f = zodToFields(z.object({ data: z.union([z.string(), z.number()]) }));
		expect(f.data!.kind).toBe('json');
	});

	test('transform → json kind', () => {
		const f = zodToFields(z.object({ upper: z.string().transform((s) => s.toUpperCase()) }));
		expect(f.upper!.kind).toBe('json');
	});
});

describe('relation() + _resolveRelations', () => {
	test('direct ref resolves CollectionDef → name string', () => {
		const AuthorSchema = z.object({ name: z.string() });
		const PostSchema = z.object({
			title: z.string(),
			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			author: relation(() => authors),
		});
		const authors = collection({ schema: AuthorSchema });
		const posts = collection({ schema: PostSchema });
		_resolveRelations({ authors, posts });
		expect(posts.fields.author?.relation?.target).toBe('authors');
	});

	test('many: true → array of strings, json storage', () => {
		const TagSchema = z.object({ name: z.string() });
		const PostSchema = z.object({
			tags: relation(() => tags, { many: true }),
		});
		const tags = collection({ schema: TagSchema });
		const posts = collection({ schema: PostSchema });
		_resolveRelations({ tags, posts });
		expect(posts.fields.tags?.relation?.many).toBe(true);
		expect(posts.fields.tags?.storage).toBe('json');
	});

	test('unregistered target throws', () => {
		const Orphaned = z.object({ name: z.string() });
		const orphan = collection({ schema: Orphaned });
		const PostSchema = z.object({
			ghost: relation(orphan),
		});
		const posts = collection({ schema: PostSchema });
		expect(() => _resolveRelations({ posts })).toThrow(/relation target is not registered/);
	});
});

describe('schemas.{create,update,full}', () => {
	const PostSchema = z.object({
		title: z.string().min(1).max(120),
		published: z.boolean().default(false),
	});
	const posts = collection({ schema: PostSchema });

	test('create rejects too-short title', async () => {
		const r = await posts.schemas.create['~standard'].validate({ title: '' });
		expect(r.issues).toBeDefined();
	});

	test('create accepts valid input + applies default', async () => {
		const r = await posts.schemas.create['~standard'].validate({ title: 'Hi' });
		expect(r.issues).toBeUndefined();
		expect((r as { value: { published: boolean } }).value.published).toBe(false);
	});

	test('update requires id', async () => {
		const r = await posts.schemas.update['~standard'].validate({ title: 'x' });
		expect(r.issues).toBeDefined();
	});

	test('update accepts partial with id', async () => {
		const r = await posts.schemas.update['~standard'].validate({ id: 'abc' });
		expect(r.issues).toBeUndefined();
	});
});
