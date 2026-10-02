import type { CollectionAdminIR, FieldsRecord } from '@better-cms/core';

const PLACEHOLDER = /\{(\w+)\}/g;

function assertField(fields: FieldsRecord, option: string, name: string): void {
	if (name in fields) return;
	throw new Error(
		`[better-cms/zod] ${option} references unknown field "${name}". Known fields: ${Object.keys(fields).join(', ')}`,
	);
}

/** A template is `{field}` placeholders mixed with literal text; a bare string with no braces is a single field name. */
function assertTemplate(fields: FieldsRecord, option: string, value: string): void {
	const names = [...value.matchAll(PLACEHOLDER)].map((m) => m[1]!);
	for (const name of names) assertField(fields, option, name);
}

/** Throw at config time on a typo, rather than letting the admin render a blank title. */
export function validateAdminOptions(
	fields: FieldsRecord,
	admin: CollectionAdminIR | undefined,
): void {
	if (!admin) return;
	if (admin.title !== undefined) {
		if (admin.title.includes('{')) assertTemplate(fields, 'admin.title', admin.title);
		else assertField(fields, 'admin.title', admin.title);
	}
	if (admin.previewUrl !== undefined) assertTemplate(fields, 'admin.previewUrl', admin.previewUrl);
	if (admin.sort) {
		const { field, direction } = admin.sort;
		assertField(fields, 'admin.sort.field', field);
		if (fields[field]!.storage !== 'column') {
			throw new Error(
				`[better-cms/zod] admin.sort.field "${field}" is not sortable: only scalar fields are stored as columns.`,
			);
		}
		if (direction !== 'asc' && direction !== 'desc') {
			throw new Error(`[better-cms/zod] admin.sort.direction must be 'asc' or 'desc'.`);
		}
	}
	if (admin.group !== undefined && !admin.group.trim()) {
		throw new Error('[better-cms/zod] admin.group must not be empty.');
	}
	if (admin.itemLabel !== undefined && !admin.itemLabel.trim()) {
		throw new Error('[better-cms/zod] admin.itemLabel must not be empty.');
	}
}
