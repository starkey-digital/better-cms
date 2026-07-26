import type { CollectionDef, FieldDef } from '../ir/types.js';

/** Per-field codec returned by {@link getFieldCodec}. */
interface FieldCodec {
	serialize(value: unknown): unknown;
	deserialize(value: unknown): unknown;
}

/**
 * Single dispatch for field-level encode/decode logic.
 * Both serializeRow and deserializeRow use this so the two sides stay symmetric.
 */
export function getFieldCodec(field: FieldDef): FieldCodec {
	if (field.storage === 'json') {
		return {
			serialize: (v) => (typeof v === 'string' ? v : JSON.stringify(v)),
			deserialize: (v) => {
				if (typeof v !== 'string') return v;
				try {
					return JSON.parse(v);
				} catch {
					return v;
				}
			},
		};
	}
	if (field.scalarType === 'boolean') {
		return {
			serialize: (v) => (v ? 1 : 0),
			deserialize: (v) => v === 1 || v === true || v === '1',
		};
	}
	if (field.scalarType === 'date') {
		return {
			serialize: (v) => (v instanceof Date ? v.getTime() : v),
			deserialize: (v) => {
				// Numeric epoch (common path — preserved exactly)
				if (typeof v === 'number') return new Date(v);
				// ISO string surviving a JSON round-trip
				if (typeof v === 'string' && v.length > 0) {
					const d = new Date(v);
					if (!Number.isNaN(d.getTime())) return d;
				}
				return v;
			},
		};
	}
	return { serialize: (v) => v, deserialize: (v) => v };
}

/**
 * Serialize a row according to field storage hints. JSON fields get stringified.
 *
 * A present-but-`undefined` key becomes SQL `null`: drivers reject `undefined`
 * as a bind argument, and a caller who included the key at all is saying
 * "this field has no value" — which on a column is null. An absent key is
 * never visited, so a partial update still leaves untouched columns alone.
 * `deserializeRow` drops nulls again, so an optional field survives the
 * round trip as absent rather than as an explicit null.
 */
export function serializeRow(
	def: CollectionDef,
	data: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(data)) {
		if (value === undefined || value === null) {
			out[name] = null;
			continue;
		}
		const field: FieldDef | undefined = def.fields[name];
		out[name] = field ? getFieldCodec(field).serialize(value) : value;
	}
	return out;
}

const WHERE_OPS = ['eq', 'ne', 'in', 'gt', 'gte', 'lt', 'lte', 'like'] as const;
type WhereOpKey = (typeof WHERE_OPS)[number];

function isOperatorCondition(v: unknown): v is Record<WhereOpKey, unknown> {
	if (v == null || typeof v !== 'object' || Array.isArray(v) || v instanceof Date) return false;
	const keys = Object.keys(v);
	return keys.length === 1 && WHERE_OPS.includes(keys[0] as WhereOpKey);
}

/**
 * Push where-clause values through the same field codecs as row writes, so a
 * query written in domain terms matches what is on disk — `{ published: true }`
 * has to become `1` for a sqlite boolean column, and a `Date` has to become an
 * epoch. Without this a caller-supplied filter silently matches nothing.
 *
 * `like` values are left alone: they are SQL patterns, not field values.
 */
export function serializeWhere(
	def: CollectionDef,
	where: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!where) return undefined;
	const out: Record<string, unknown> = {};
	for (const [name, condition] of Object.entries(where)) {
		const field: FieldDef | undefined = def.fields[name];
		if (!field || condition === undefined || condition === null) {
			out[name] = condition;
			continue;
		}
		const codec = getFieldCodec(field);
		if (isOperatorCondition(condition)) {
			const op = Object.keys(condition)[0] as WhereOpKey;
			const value = (condition as Record<string, unknown>)[op];
			out[name] = {
				[op]:
					op === 'like'
						? value
						: op === 'in'
							? (value as unknown[]).map((v) => codec.serialize(v))
							: codec.serialize(value),
			};
			continue;
		}
		out[name] = codec.serialize(condition);
	}
	return out;
}

/**
 * Coerce a string value (querystring, form, etc.) to the field's runtime type.
 * Boolean → libsql expects a real bool/0/1, so `'true'` strings would otherwise
 * miss the index. Numeric and date follow standard parse rules.
 */
export function coerceScalar(field: FieldDef | undefined, raw: string): unknown {
	if (!field) return raw;
	if (field.scalarType === 'boolean') return raw === 'true' || raw === '1';
	if (field.scalarType === 'integer' || field.scalarType === 'number') return Number(raw);
	if (field.scalarType === 'date') return new Date(raw);
	return raw;
}

/**
 * Inverse of serializeRow. Drops null values entirely so optional zod fields
 * (which accept `T | undefined`, not `T | null`) validate cleanly on round-trip
 * read → edit → save. Sqlite stores absent optionals as null; surfacing that
 * as `undefined` matches the zod schema author's intent.
 */
export function deserializeRow(
	def: CollectionDef,
	data: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(data)) {
		if (value === null) continue;
		if (value === undefined) continue;
		const field: FieldDef | undefined = def.fields[name];
		if (!field) {
			out[name] = value;
			continue;
		}
		out[name] = getFieldCodec(field).deserialize(value);
	}
	return out;
}
