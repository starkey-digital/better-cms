import { describe, expect, test } from 'bun:test';
import { contentKey, extensionForMime } from './media-key.js';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('extensionForMime', () => {
	test('takes the subtype', () => {
		expect(extensionForMime('image/png')).toBe('png');
	});

	test('drops a structured suffix', () => {
		expect(extensionForMime('image/svg+xml')).toBe('svg');
	});

	test('drops parameters', () => {
		expect(extensionForMime('text/plain;charset=utf-8')).toBe('plain');
	});

	test('falls back to bin for an unusable type', () => {
		expect(extensionForMime('nonsense')).toBe('bin');
		expect(extensionForMime('')).toBe('bin');
	});
});

describe('contentKey', () => {
	test('is stable for identical bytes', async () => {
		// This is the property that makes a retry overwrite instead of stranding
		// another copy in the bucket.
		expect(await contentKey(bytes('hello'), 'image/png')).toBe(
			await contentKey(bytes('hello'), 'image/png'),
		);
	});

	test('differs for different bytes', async () => {
		expect(await contentKey(bytes('hello'), 'image/png')).not.toBe(
			await contentKey(bytes('world'), 'image/png'),
		);
	});

	test('carries the extension from the mime type', async () => {
		expect(await contentKey(bytes('x'), 'image/svg+xml')).toMatch(/^[0-9a-f]{32}\.svg$/);
	});

	test('nests under a folder when given one', async () => {
		expect(await contentKey(bytes('x'), 'image/png', 'covers')).toMatch(
			/^covers\/[0-9a-f]{32}\.png$/,
		);
	});

	test('normalizes surrounding slashes on the folder', async () => {
		const a = await contentKey(bytes('x'), 'image/png', '/covers/');
		const b = await contentKey(bytes('x'), 'image/png', 'covers');
		expect(a).toBe(b);
	});

	test('the same bytes under different folders are distinct objects', async () => {
		expect(await contentKey(bytes('x'), 'image/png', 'a')).not.toBe(
			await contentKey(bytes('x'), 'image/png', 'b'),
		);
	});
});
