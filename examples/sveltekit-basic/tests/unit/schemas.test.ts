import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';

// Mirror the schemas from src/lib/cms.remote.ts. We can't import the
// remote module directly (it pulls $app/server which is SvelteKit-only),
// so we duplicate the shape and test the validation contract.
const RecentLimit = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50));
const ToggleInput = v.object({
	id: v.string(),
	published: v.boolean(),
});

describe('RecentLimit (Standard Schema)', () => {
	test('accepts integers in [1, 50]', () => {
		expect(v.safeParse(RecentLimit, 1).success).toBe(true);
		expect(v.safeParse(RecentLimit, 25).success).toBe(true);
		expect(v.safeParse(RecentLimit, 50).success).toBe(true);
	});

	test('rejects 0, negative, > 50, non-integer, non-number', () => {
		expect(v.safeParse(RecentLimit, 0).success).toBe(false);
		expect(v.safeParse(RecentLimit, -1).success).toBe(false);
		expect(v.safeParse(RecentLimit, 51).success).toBe(false);
		expect(v.safeParse(RecentLimit, 1.5).success).toBe(false);
		expect(v.safeParse(RecentLimit, '5').success).toBe(false);
	});
});

describe('ToggleInput (Standard Schema)', () => {
	test('accepts { id: string, published: boolean }', () => {
		expect(v.safeParse(ToggleInput, { id: 'abc', published: true }).success).toBe(true);
		expect(v.safeParse(ToggleInput, { id: 'abc', published: false }).success).toBe(true);
	});

	test('rejects missing id, missing published, wrong types, extra-only payload', () => {
		expect(v.safeParse(ToggleInput, { published: true }).success).toBe(false);
		expect(v.safeParse(ToggleInput, { id: 'abc' }).success).toBe(false);
		expect(v.safeParse(ToggleInput, { id: 123, published: true }).success).toBe(false);
		expect(v.safeParse(ToggleInput, { id: 'abc', published: 'yes' }).success).toBe(false);
		expect(v.safeParse(ToggleInput, null).success).toBe(false);
	});

	test('exposes Standard Schema v1 surface', () => {
		// SvelteKit accepts any validator with a `~standard` property
		expect(ToggleInput).toHaveProperty('~standard');
		const std = (ToggleInput as { '~standard': { version: number; vendor: string } })['~standard'];
		expect(std.version).toBe(1);
		expect(std.vendor).toBe('valibot');
	});
});
