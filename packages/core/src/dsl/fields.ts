import type { FieldDef } from '../ir/types.js';
import type { StandardSchemaV1 } from '../util/standard-schema.js';

interface BaseOpts<TOut = unknown> {
	label?: string;
	description?: string;
	required?: boolean;
	unique?: boolean;
	indexed?: boolean;
	llm?: { describe: string; examples?: unknown[] };
	editor?: { component: string; props?: Record<string, unknown> };
	/** Bring-your-own validator. Any Standard-Schema schema (zod, valibot, arktype, …). */
	validation?: StandardSchemaV1<unknown, TOut>;
}

interface TextOpts extends BaseOpts<string> {
	multiline?: boolean;
	defaultValue?: string;
}

export function text(opts: TextOpts = {}): FieldDef<string> {
	return {
		kind: 'text',
		storage: 'column',
		columnType: 'text',
		scalarType: 'string',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		unique: opts.unique,
		indexed: opts.indexed,
		defaultValue: opts.defaultValue,
		validation: opts.validation,
		editor: opts.editor ?? {
			component: 'TextField',
			props: { multiline: opts.multiline ?? false },
		},
		llm: opts.llm,
	};
}

export interface RichTextDoc {
	type: 'doc';
	content?: unknown[];
}

interface RichTextOpts extends BaseOpts<RichTextDoc> {
	editorImpl?: 'tiptap' | 'lexical' | 'markdown' | 'plain';
	defaultValue?: unknown;
}

export function richText(opts: RichTextOpts = {}): FieldDef<RichTextDoc> {
	return {
		kind: 'richText',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		defaultValue: opts.defaultValue,
		validation: opts.validation,
		editor: opts.editor ?? {
			component: 'RichTextField',
			props: { impl: opts.editorImpl ?? 'tiptap' },
		},
		llm: opts.llm ?? {
			describe:
				'Rich text content stored as a structured document (ProseMirror/Tiptap-compatible JSON).',
		},
	};
}

interface SlugOpts extends BaseOpts<string> {
	from?: string;
}

export function slug(opts: SlugOpts = {}): FieldDef<string> {
	return {
		kind: 'slug',
		storage: 'column',
		columnType: 'text',
		scalarType: 'string',
		label: opts.label,
		description: opts.description,
		required: opts.required ?? true,
		unique: opts.unique ?? true,
		indexed: true,
		validation: opts.validation,
		editor: opts.editor ?? { component: 'SlugField', props: { from: opts.from } },
		llm: opts.llm,
	};
}

export interface ImageRef {
	key: string;
	url: string;
	mime?: string;
	size?: number;
	width?: number;
	height?: number;
	alt?: string;
}

interface ImageOpts extends BaseOpts<ImageRef> {
	formats?: string[];
	maxSizeMB?: number;
}

export function image(opts: ImageOpts = {}): FieldDef<ImageRef> {
	return {
		kind: 'image',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		validation: opts.validation,
		editor: opts.editor ?? {
			component: 'ImageField',
			props: { formats: opts.formats ?? ['jpg', 'png', 'webp'], maxSizeMB: opts.maxSizeMB ?? 10 },
		},
		llm: opts.llm ?? {
			describe: 'Reference to an uploaded image. Stored as { key, url, alt, width, height }.',
		},
	};
}

export interface FileRef {
	key: string;
	url: string;
	mime?: string;
	size?: number;
	name?: string;
}

interface FileOpts extends BaseOpts<FileRef> {
	mime?: string[];
	maxSizeMB?: number;
}

export function file(opts: FileOpts = {}): FieldDef<FileRef> {
	return {
		kind: 'file',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		validation: opts.validation,
		editor: opts.editor ?? {
			component: 'FileField',
			props: { mime: opts.mime, maxSizeMB: opts.maxSizeMB ?? 50 },
		},
		llm: opts.llm,
	};
}

interface BoolOpts extends BaseOpts<boolean> {
	defaultValue?: boolean;
}
export function boolean(opts: BoolOpts = {}): FieldDef<boolean> {
	return {
		kind: 'boolean',
		storage: 'column',
		columnType: 'integer',
		scalarType: 'boolean',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		defaultValue: opts.defaultValue,
		validation: opts.validation,
		editor: opts.editor ?? { component: 'BooleanField' },
		llm: opts.llm,
	};
}

interface NumberOpts extends BaseOpts<number> {
	int?: boolean;
	defaultValue?: number;
}
export function number(opts: NumberOpts = {}): FieldDef<number> {
	return {
		kind: opts.int ? 'integer' : 'number',
		storage: 'column',
		columnType: opts.int ? 'integer' : 'real',
		scalarType: opts.int ? 'integer' : 'number',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		defaultValue: opts.defaultValue,
		validation: opts.validation,
		editor: opts.editor ?? { component: 'NumberField' },
		llm: opts.llm,
	};
}

interface DateOpts extends BaseOpts<Date> {
	defaultValue?: Date | (() => Date);
}
export function date(opts: DateOpts = {}): FieldDef<Date> {
	return {
		kind: 'date',
		storage: 'column',
		columnType: 'integer',
		scalarType: 'date',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		defaultValue: opts.defaultValue,
		validation: opts.validation,
		editor: opts.editor ?? { component: 'DateField' },
		llm: opts.llm,
	};
}

interface SelectOpts<T extends string> extends BaseOpts<T> {
	options: ReadonlyArray<T>;
	defaultValue?: T;
}
export function select<T extends string>(opts: SelectOpts<T>): FieldDef<T> {
	return {
		kind: 'select',
		storage: 'column',
		columnType: 'text',
		scalarType: 'string',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		defaultValue: opts.defaultValue,
		options: opts.options,
		validation: opts.validation,
		editor: opts.editor ?? { component: 'SelectField', props: { options: opts.options } },
		llm: opts.llm,
	};
}

interface JsonOpts<T = unknown> extends BaseOpts<T> {
	defaultValue?: unknown;
}
export function json<T = unknown>(opts: JsonOpts<T> = {}): FieldDef<T> {
	return {
		kind: 'json',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		defaultValue: opts.defaultValue,
		validation: opts.validation,
		editor: opts.editor ?? { component: 'JsonField' },
		llm: opts.llm,
	};
}

interface ArrayOpts<F extends FieldDef<unknown>, TOut> extends BaseOpts<TOut> {
	of: F;
}
export function array<F extends FieldDef<unknown>>(
	opts: ArrayOpts<F, F extends FieldDef<infer T> ? T[] : never>,
): FieldDef<F extends FieldDef<infer T> ? T[] : never> {
	return {
		kind: 'array',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		validation: opts.validation,
		array: { of: opts.of },
		editor: opts.editor ?? { component: 'ArrayField' },
		llm: opts.llm,
	};
}

interface ObjectOpts<F extends Record<string, FieldDef<unknown>>, TOut> extends BaseOpts<TOut> {
	fields: F;
}
export function object<F extends Record<string, FieldDef<unknown>>>(
	opts: ObjectOpts<F, { [K in keyof F]: F[K] extends FieldDef<infer T> ? T : never }>,
): FieldDef<{ [K in keyof F]: F[K] extends FieldDef<infer T> ? T : never }> {
	return {
		kind: 'object',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		validation: opts.validation,
		object: { fields: opts.fields },
		editor: opts.editor ?? { component: 'ObjectField' },
		llm: opts.llm,
	};
}

interface RelationOpts<M extends boolean, TOut> extends BaseOpts<TOut> {
	many?: M;
	onDelete?: 'cascade' | 'set null' | 'restrict';
}
export function relation<M extends boolean = false>(
	target: string,
	opts: RelationOpts<M, M extends true ? string[] : string> = {} as RelationOpts<
		M,
		M extends true ? string[] : string
	>,
): FieldDef<M extends true ? string[] : string> {
	const many = (opts.many ?? false) as boolean;
	return {
		kind: 'relation',
		storage: many ? 'json' : 'column',
		columnType: 'text',
		scalarType: many ? undefined : 'string',
		label: opts.label,
		description: opts.description,
		required: opts.required,
		indexed: !many,
		validation: opts.validation,
		relation: { target, many, onDelete: opts.onDelete ?? 'set null' },
		editor: opts.editor ?? { component: 'RelationField', props: { target, many } },
		llm: opts.llm,
	};
}
