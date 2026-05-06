import type { FieldDef } from '../ir/types.js';

interface BaseOpts {
	label?: string;
	description?: string;
	required?: boolean;
	unique?: boolean;
	indexed?: boolean;
	llm?: { describe: string; examples?: unknown[] };
	editor?: { component: string; props?: Record<string, unknown> };
}

interface TextOpts extends BaseOpts {
	min?: number;
	max?: number;
	pattern?: RegExp;
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
		unique: opts.unique,
		indexed: opts.indexed,
		defaultValue: opts.defaultValue,
		validation: {
			required: opts.required,
			min: opts.min,
			max: opts.max,
			pattern: opts.pattern?.source,
		},
		editor: opts.editor ?? {
			component: 'TextField',
			props: { multiline: opts.multiline ?? false },
		},
		llm: opts.llm,
	};
}

interface RichTextOpts extends BaseOpts {
	editorImpl?: 'tiptap' | 'lexical' | 'markdown' | 'plain';
	max?: number;
	defaultValue?: unknown;
}

export interface RichTextDoc {
	type: 'doc';
	content?: unknown[];
}

export function richText(opts: RichTextOpts = {}): FieldDef<RichTextDoc> {
	return {
		kind: 'richText',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		defaultValue: opts.defaultValue,
		validation: { required: opts.required, max: opts.max },
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

interface SlugOpts extends BaseOpts {
	from?: string;
	max?: number;
}

export function slug(opts: SlugOpts = {}): FieldDef<string> {
	return {
		kind: 'slug',
		storage: 'column',
		columnType: 'text',
		scalarType: 'string',
		label: opts.label,
		description: opts.description,
		unique: opts.unique ?? true,
		indexed: true,
		validation: {
			required: opts.required ?? true,
			max: opts.max ?? 200,
			pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
		},
		editor: opts.editor ?? { component: 'SlugField', props: { from: opts.from } },
		llm: opts.llm,
	};
}

interface ImageOpts extends BaseOpts {
	formats?: string[];
	maxSizeMB?: number;
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

export function image(opts: ImageOpts = {}): FieldDef<ImageRef> {
	return {
		kind: 'image',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		validation: { required: opts.required },
		editor: opts.editor ?? {
			component: 'ImageField',
			props: { formats: opts.formats ?? ['jpg', 'png', 'webp'], maxSizeMB: opts.maxSizeMB ?? 10 },
		},
		llm: opts.llm ?? {
			describe: 'Reference to an uploaded image. Stored as { key, url, alt, width, height }.',
		},
	};
}

interface FileOpts extends BaseOpts {
	mime?: string[];
	maxSizeMB?: number;
}

export interface FileRef {
	key: string;
	url: string;
	mime?: string;
	size?: number;
	name?: string;
}

export function file(opts: FileOpts = {}): FieldDef<FileRef> {
	return {
		kind: 'file',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		validation: { required: opts.required },
		editor: opts.editor ?? {
			component: 'FileField',
			props: { mime: opts.mime, maxSizeMB: opts.maxSizeMB ?? 50 },
		},
		llm: opts.llm,
	};
}

interface BoolOpts extends BaseOpts {
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
		defaultValue: opts.defaultValue,
		validation: { required: opts.required },
		editor: opts.editor ?? { component: 'BooleanField' },
		llm: opts.llm,
	};
}

interface NumberOpts extends BaseOpts {
	int?: boolean;
	min?: number;
	max?: number;
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
		defaultValue: opts.defaultValue,
		validation: { required: opts.required, min: opts.min, max: opts.max },
		editor: opts.editor ?? { component: 'NumberField' },
		llm: opts.llm,
	};
}

interface DateOpts extends BaseOpts {
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
		defaultValue: opts.defaultValue,
		validation: { required: opts.required },
		editor: opts.editor ?? { component: 'DateField' },
		llm: opts.llm,
	};
}

interface SelectOpts<T extends string> extends BaseOpts {
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
		defaultValue: opts.defaultValue,
		validation: { required: opts.required, enum: opts.options },
		editor: opts.editor ?? { component: 'SelectField', props: { options: opts.options } },
		llm: opts.llm,
	};
}

interface JsonOpts extends BaseOpts {
	defaultValue?: unknown;
}
export function json<T = unknown>(opts: JsonOpts = {}): FieldDef<T> {
	return {
		kind: 'json',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		defaultValue: opts.defaultValue,
		validation: { required: opts.required },
		editor: opts.editor ?? { component: 'JsonField' },
		llm: opts.llm,
	};
}

interface ArrayOpts<F extends FieldDef<unknown>> extends BaseOpts {
	of: F;
	min?: number;
	max?: number;
}
export function array<F extends FieldDef<unknown>>(
	opts: ArrayOpts<F>,
): FieldDef<F extends FieldDef<infer T> ? T[] : never> {
	return {
		kind: 'array',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		validation: { required: opts.required, min: opts.min, max: opts.max },
		array: { of: opts.of, min: opts.min, max: opts.max },
		editor: opts.editor ?? { component: 'ArrayField' },
		llm: opts.llm,
	};
}

interface ObjectOpts<F extends Record<string, FieldDef<unknown>>> extends BaseOpts {
	fields: F;
}
export function object<F extends Record<string, FieldDef<unknown>>>(
	opts: ObjectOpts<F>,
): FieldDef<{ [K in keyof F]: F[K] extends FieldDef<infer T> ? T : never }> {
	return {
		kind: 'object',
		storage: 'json',
		columnType: 'text',
		label: opts.label,
		description: opts.description,
		validation: { required: opts.required },
		object: { fields: opts.fields },
		editor: opts.editor ?? { component: 'ObjectField' },
		llm: opts.llm,
	};
}

interface RelationOpts<M extends boolean = false> extends BaseOpts {
	many?: M;
	onDelete?: 'cascade' | 'set null' | 'restrict';
}
export function relation<M extends boolean = false>(
	target: string,
	opts: RelationOpts<M> = {} as RelationOpts<M>,
): FieldDef<M extends true ? string[] : string> {
	const many = (opts.many ?? false) as boolean;
	return {
		kind: 'relation',
		storage: many ? 'json' : 'column',
		columnType: 'text',
		scalarType: many ? undefined : 'string',
		label: opts.label,
		description: opts.description,
		indexed: !many,
		validation: { required: opts.required },
		relation: { target, many, onDelete: opts.onDelete ?? 'set null' },
		editor: opts.editor ?? { component: 'RelationField', props: { target, many } },
		llm: opts.llm,
	};
}
