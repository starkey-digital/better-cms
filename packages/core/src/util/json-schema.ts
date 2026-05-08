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

/**
 * Thin DSL-only JSON Schema for a single field. Carries kind + description +
 * select options. Min/max/pattern are *not* derived — those live in the
 * schema-first builder's validator and surface via `def.toJsonSchema()`.
 */
export function fieldToJsonSchema(field: FieldDef): JsonSchema {
	const out: JsonSchema = {};
	const desc = [field.description ?? field.label, field.llm?.describe].filter(Boolean).join(' — ');
	if (desc) out.description = desc;

	switch (field.kind) {
		case 'text':
		case 'slug':
			out.type = 'string';
			return out;
		case 'select':
			out.type = 'string';
			if (field.options) out.enum = [...field.options];
			return out;
		case 'boolean':
			out.type = 'boolean';
			return out;
		case 'number':
			out.type = 'number';
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
					if (f.required) required.push(n);
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

/**
 * JSON Schema for a collection's `create` shape.
 *
 * Schema-first builders (e.g. `@better-cms/zod`) bake `def.toJsonSchema()`
 * which produces rich constraint metadata (min/max/pattern/enum/etc.).
 * Falls back to the thin DSL-only emitter when no converter is attached.
 */
export function collectionToJsonSchema(def: CollectionDef): JsonSchema {
	if (def.toJsonSchema) {
		try {
			const result = def.toJsonSchema();
			if (result && typeof result === 'object') return result as JsonSchema;
		} catch {
			// fall through to DSL-only
		}
	}
	const props: Record<string, JsonSchema> = {};
	const required: string[] = [];
	for (const [name, field] of Object.entries(def.fields)) {
		props[name] = fieldToJsonSchema(field);
		if (field.required && name !== 'id') required.push(name);
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
