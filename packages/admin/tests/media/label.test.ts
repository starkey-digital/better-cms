import { describe, expect, test } from 'bun:test';
import { optionLabels } from '../../src/lib/media/label.js';

describe('optionLabels', () => {
	test('unique descriptions are left alone', () => {
		expect(optionLabels([{ alt: 'Stage' }, { alt: 'Crowd' }])).toEqual(['Stage', 'Crowd']);
	});
	test('duplicates are numbered by position, ignoring stray spaces', () => {
		expect(
			optionLabels([{ alt: 'Dancer' }, { alt: 'Stage' }, { alt: 'Dancer ' }, { alt: 'Dancer' }]),
		).toEqual(['Dancer · 1 of 3', 'Stage', 'Dancer · 2 of 3', 'Dancer · 3 of 3']);
	});
	test('blank descriptions get a plain placeholder and are numbered together', () => {
		expect(optionLabels([{ alt: '' }, { alt: null }, {}])).toEqual([
			'Photo without a description · 1 of 3',
			'Photo without a description · 2 of 3',
			'Photo without a description · 3 of 3',
		]);
	});
	test('labels are unique by construction', () => {
		const labels = optionLabels(Array.from({ length: 20 }, () => ({ alt: 'Dancer' })));
		expect(new Set(labels).size).toBe(20);
	});
});
