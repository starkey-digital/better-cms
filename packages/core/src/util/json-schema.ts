import type { CollectionDef, FieldDef, SchemaIR } from '../ir/types.js';

export interface JsonSchema {
	type?: string | string[];
	description?: string;
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	required?: string[];
	enum?: unknown[];
	minLength?: number;
	maxLength?: number;
	minimum?: number;
	maximum?: number;
	pattern?: string;
}

export function fieldToJsonSchema(field: FieldDef): JsonSchema {
	const out: JsonSchema = {};
	const desc = [field.description ?? field.label, field.llm?.describe].filter(Boolean).join(' — ');
	if (desc) out.description = desc;

	const v = field.validation;

	switch (field.kind) {
		case 'text':
		case 'slug':
			out.type = 'string';
			if (v?.min != null) out.minLength = v.min;
			if (v?.max != null) out.maxLength = v.max;
			if (v?.pattern) out.pattern = v.pattern;
			return out;
		case 'select':
			out.type = 'string';
			if (v?.enum) out.enum = [...v.enum];
			return out;
		case 'boolean':
			out.type = 'boolean';
			return out;
		case 'number':
			out.type = 'number';
			if (v?.min != null) out.minimum = v.min;
			if (v?.max != null) out.maximum = v.max;
			return out;
		case 'integer':
			out.type = 'integer';
			return out;
		case 'date':
			out.type = 'string';
			out.description = `${out.description ?? ''} (ISO 8601 timestamp)`.trim();
			return out;
		case 'image':
		case 'file':
			out.type = 'object';
			out.properties = {
				key: { type: 'string' },
				url: { type: 'string' },
				alt: { type: 'string' },
			};
			out.required = ['key', 'url'];
			return out;
		case 'richText':
			out.type = 'object';
			out.description = `${out.description ?? ''} ProseMirror/Tiptap JSON document.`.trim();
			return out;
		case 'array':
			out.type = 'array';
			if (field.array) out.items = fieldToJsonSchema(field.array.of);
			return out;
		case 'object':
			out.type = 'object';
			if (field.object) {
				out.properties = {};
				const required: string[] = [];
				for (const [n, f] of Object.entries(field.object.fields)) {
					out.properties[n] = fieldToJsonSchema(f);
					if (f.validation?.required) required.push(n);
				}
				if (required.length) out.required = required;
			}
			return out;
		case 'relation':
			if (field.relation?.many) {
				out.type = 'array';
				out.items = { type: 'string' };
			} else {
				out.type = 'string';
			}
			if (field.relation) {
				out.description = `${out.description ?? ''} (${
					field.relation.many ? 'ids' : 'id'
				} of ${field.relation.target})`.trim();
			}
			return out;
		case 'json':
			out.type = ['object', 'array', 'string', 'number', 'boolean', 'null'];
			return out;
	}
	return out;
}

export function collectionToJsonSchema(def: CollectionDef): JsonSchema {
	const props: Record<string, JsonSchema> = {};
	const required: string[] = [];
	for (const [name, field] of Object.entries(def.fields)) {
		props[name] = fieldToJsonSchema(field);
		if (field.validation?.required && name !== 'id') required.push(name);
	}
	return { type: 'object', properties: props, required };
}

export function schemaToJsonSchemas(schema: SchemaIR): Record<string, JsonSchema> {
	const out: Record<string, JsonSchema> = {};
	for (const [name, def] of Object.entries(schema.collections)) {
		out[name] = collectionToJsonSchema(def);
	}
	return out;
}
