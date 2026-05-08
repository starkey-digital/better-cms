import type { CollectionDef, CollectionSchemas, FieldDef } from '../ir/types.js';
import type { StandardSchemaV1 } from './standard-schema.js';

export type SchemaVariant = 'create' | 'update' | 'full';

/**
 * Attach lazy `schemas.{create,update,full}` getters to a collection definition.
 * Used by both the DSL `collection()` builder and the `getCmsTables` system-
 * collection layer so every CollectionDef in the runtime carries schemas.
 */
export function attachSchemas<T extends Omit<CollectionDef, 'schemas'>>(
	def: T,
): T & { schemas: CollectionSchemas } {
	const schemas: CollectionSchemas = {
		get create() {
			return composeSchema(def as unknown as CollectionDef, 'create');
		},
		get update() {
			return composeSchema(def as unknown as CollectionDef, 'update');
		},
		get full() {
			return composeSchema(def as unknown as CollectionDef, 'full');
		},
	};
	return Object.assign(def, { schemas });
}

const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

/**
 * Compose a Standard Schema from a CollectionDef.
 *
 * Per-field `validation` slot is honoured (any zod / valibot / arktype schema works).
 * Fields without a validation slot fall through unchecked — the user opted out.
 *
 *   create — system fields stripped, required honoured.
 *   update — every field optional, id required (lookup key).
 *   full   — every field optional from the schema's POV (read shape).
 *
 * If the collection carries a `validation[variant]` override, that schema is
 * returned verbatim. Otherwise the per-field schemas are composed into an
 * object validator that aggregates issues with proper paths.
 */
export function composeSchema(
	def: CollectionDef,
	variant: SchemaVariant = 'create',
): StandardSchemaV1<Record<string, unknown>, Record<string, unknown>> {
	const override = def.validation?.[variant];
	if (override)
		return override as StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>;

	const entries: Array<{ name: string; field: FieldDef; required: boolean }> = [];
	if (variant === 'update') {
		const idField: FieldDef = (def.fields.id as FieldDef | undefined) ?? {
			kind: 'text',
			storage: 'column',
			columnType: 'text',
			scalarType: 'string',
		};
		entries.push({ name: 'id', field: idField, required: true });
	}
	for (const [name, field] of Object.entries(def.fields)) {
		if (SYSTEM_FIELDS.has(name)) continue;
		const required = variant === 'create' && Boolean(field.required);
		entries.push({ name, field, required });
	}

	return {
		'~standard': {
			version: 1,
			vendor: 'better-cms',
			validate: async (value) => {
				if (value === null || typeof value !== 'object' || Array.isArray(value)) {
					return { issues: [{ message: 'expected object' }] };
				}
				const input = value as Record<string, unknown>;
				const out: Record<string, unknown> = {};
				const issues: StandardSchemaV1.Issue[] = [];

				for (const { name, field, required } of entries) {
					const present = name in input;
					const v = input[name];

					if (variant === 'update' && name === 'id') {
						if (typeof v !== 'string' || v.length === 0) {
							issues.push({ message: 'id is required', path: [name] });
						} else {
							out[name] = v;
						}
						continue;
					}

					if (!present || v === undefined) {
						if (required && field.defaultValue === undefined) {
							issues.push({ message: `${name} is required`, path: [name] });
						}
						continue;
					}

					if (v === null) {
						if (required) {
							issues.push({ message: `${name} is required`, path: [name] });
						} else {
							out[name] = null;
						}
						continue;
					}

					const schema = field.validation;
					if (!schema) {
						out[name] = v;
						continue;
					}

					const result = await schema['~standard'].validate(v);
					if (result.issues) {
						for (const issue of result.issues) {
							issues.push({
								message: issue.message,
								path: [name, ...((issue.path ?? []) as Array<PropertyKey>)],
							});
						}
					} else {
						out[name] = result.value;
					}
				}

				if (issues.length) return { issues };
				return { value: out };
			},
		},
	};
}
