import type { CollectionDef, FieldDef } from '../ir/types.js';
import { errors } from './result.js';

const PATTERN_CACHE = new Map<string, RegExp>();
function patternRe(p: string): RegExp {
	let re = PATTERN_CACHE.get(p);
	if (!re) {
		re = new RegExp(p);
		PATTERN_CACHE.set(p, re);
	}
	return re;
}

/**
 * Validate a row against a collection's IR. Throws CmsError on first failure.
 * `partial` skips required-field checks (for update operations).
 */
export function validateRow(
	collection: string,
	def: CollectionDef,
	data: Record<string, unknown>,
	partial = false,
): void {
	for (const [name, field] of Object.entries(def.fields)) {
		const present = name in data;
		const value = data[name];

		if (!partial && field.validation?.required && (value === undefined || value === null)) {
			if (field.defaultValue !== undefined) continue;
			if (name === 'id' || name === 'createdAt' || name === 'updatedAt') continue;
			throw errors.validation(`${collection}.${name} is required`);
		}

		if (!present || value === undefined || value === null) continue;

		const v = field.validation;
		if (!v) continue;

		if (field.scalarType === 'string' && typeof value !== 'string')
			throw errors.validation(`${collection}.${name} must be a string`);
		if (field.scalarType === 'number' && typeof value !== 'number')
			throw errors.validation(`${collection}.${name} must be a number`);
		if (field.scalarType === 'integer' && !Number.isInteger(value))
			throw errors.validation(`${collection}.${name} must be an integer`);
		if (field.scalarType === 'boolean' && typeof value !== 'boolean')
			throw errors.validation(`${collection}.${name} must be a boolean`);

		if (typeof value === 'string') {
			if (v.min != null && value.length < v.min)
				throw errors.validation(`${collection}.${name} too short (min ${v.min})`);
			if (v.max != null && value.length > v.max)
				throw errors.validation(`${collection}.${name} too long (max ${v.max})`);
			if (v.pattern && !patternRe(v.pattern).test(value))
				throw errors.validation(`${collection}.${name} does not match pattern`);
		}
		if (typeof value === 'number') {
			if (v.min != null && value < v.min)
				throw errors.validation(`${collection}.${name} below min ${v.min}`);
			if (v.max != null && value > v.max)
				throw errors.validation(`${collection}.${name} above max ${v.max}`);
		}
		if (v.enum && !v.enum.includes(value as string | number))
			throw errors.validation(`${collection}.${name} not in allowed values`);

		if (field.kind === 'array' && field.array && Array.isArray(value)) {
			if (v.min != null && value.length < v.min)
				throw errors.validation(`${collection}.${name} array too short`);
			if (v.max != null && value.length > v.max)
				throw errors.validation(`${collection}.${name} array too long`);
		}
	}
}

/** Serialize a row according to field storage hints. JSON fields get stringified. */
export function serializeRow(
	def: CollectionDef,
	data: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(data)) {
		const field: FieldDef | undefined = def.fields[name];
		if (!field) {
			out[name] = value;
			continue;
		}
		if (value === undefined || value === null) {
			out[name] = value;
			continue;
		}
		if (field.storage === 'json') {
			out[name] = typeof value === 'string' ? value : JSON.stringify(value);
		} else if (field.scalarType === 'boolean') {
			out[name] = value ? 1 : 0;
		} else if (field.scalarType === 'date') {
			out[name] = value instanceof Date ? value.getTime() : value;
		} else {
			out[name] = value;
		}
	}
	return out;
}

/** Inverse of serializeRow. */
export function deserializeRow(
	def: CollectionDef,
	data: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(data)) {
		const field: FieldDef | undefined = def.fields[name];
		if (!field) {
			out[name] = value;
			continue;
		}
		if (value === undefined || value === null) {
			out[name] = value;
			continue;
		}
		if (field.storage === 'json' && typeof value === 'string') {
			try {
				out[name] = JSON.parse(value);
			} catch {
				out[name] = value;
			}
		} else if (field.scalarType === 'boolean') {
			out[name] = value === 1 || value === true || value === '1';
		} else if (field.scalarType === 'date' && typeof value === 'number') {
			out[name] = new Date(value);
		} else {
			out[name] = value;
		}
	}
	return out;
}
