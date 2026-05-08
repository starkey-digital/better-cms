import type { CollectionDef, FieldDef } from '@better-cms/core';

// id / createdAt / updatedAt are always present on a persisted row — emit
// them non-optional so callers don't have to non-null-assert every access.
const ALWAYS_REQUIRED = new Set(['id', 'createdAt', 'updatedAt']);

export function tsFields(def: CollectionDef, indent: string): string {
	const lines: string[] = [];
	const fields = def.fields as Record<string, FieldDef>;
	for (const [field, fd] of Object.entries(fields)) {
		const required = ALWAYS_REQUIRED.has(field) || fd.required;
		lines.push(`${indent}${field}${required ? '' : '?'}: ${tsType(fd)};`);
	}
	return lines.join('\n');
}

export function tsType(field: FieldDef): string {
	if (field.kind === 'array' && field.array) return `Array<${tsType(field.array.of)}>`;
	if (field.kind === 'object' && field.object) {
		const inner = Object.entries(field.object.fields)
			.map(([n, f]) => `${n}${f.required ? '' : '?'}: ${tsType(f)}`)
			.join('; ');
		return `{ ${inner} }`;
	}
	if (field.kind === 'image' || field.kind === 'file')
		return '{ key: string; url: string; mime?: string; size?: number; width?: number; height?: number; alt?: string }';
	if (field.kind === 'richText') return 'unknown';
	if (field.kind === 'json') return 'unknown';
	if (field.kind === 'relation' && field.relation)
		return field.relation.many ? 'string[]' : 'string';
	if (field.kind === 'select' && field.options)
		return field.options.map((v) => JSON.stringify(v)).join(' | ');
	switch (field.scalarType) {
		case 'boolean':
			return 'boolean';
		case 'integer':
		case 'number':
			return 'number';
		case 'date':
			return 'Date';
		default:
			return 'string';
	}
}

export function pascalCase(s: string): string {
	return s.replace(/(^|[_-])(\w)/g, (_, _sep, c: string) => c.toUpperCase());
}

export function camelCase(s: string): string {
	return s.replace(/[_-](\w)/g, (_, c: string) => c.toUpperCase());
}
