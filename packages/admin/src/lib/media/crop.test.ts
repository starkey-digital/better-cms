import { describe, expect, test } from 'bun:test';
import {
	aspectName,
	clampBox,
	fitWithin,
	isWholeImage,
	largestBox,
	scaleBox,
	shapesFor,
} from './crop.js';

const img = { width: 4000, height: 3000 };

describe('largestBox', () => {
	test('square from landscape is centred', () => {
		expect(largestBox(img, 1)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
	});
	test('wide ratio on a tall image trims top and bottom', () => {
		const b = largestBox({ width: 1000, height: 2000 }, 16 / 9);
		expect(b.width).toBe(1000);
		expect(b.height).toBeCloseTo(562.5);
		expect(b.y).toBeCloseTo(718.75);
	});
	test('no ratio is the whole image', () => {
		expect(isWholeImage(largestBox(img, null), img)).toBe(true);
	});
});

describe('clampBox / scaleBox', () => {
	test('clamp slides along the edge', () => {
		expect(clampBox({ x: -50, y: 9999, width: 100, height: 100 }, img)).toEqual({
			x: 0,
			y: 2900,
			width: 100,
			height: 100,
		});
	});
	test('clamp shrinks an oversize box', () => {
		expect(clampBox({ x: 0, y: 0, width: 9000, height: 9000 }, img)).toMatchObject({
			width: 4000,
			height: 3000,
		});
	});
	test('scale keeps the ratio and the centre', () => {
		const start = largestBox(img, 1);
		const next = scaleBox(start, 0.5, img, 1);
		expect(next.width).toBe(1500);
		expect(next.height).toBe(1500);
		expect(next.x + next.width / 2).toBeCloseTo(start.x + start.width / 2);
	});
	test('scale up stops at the image', () => {
		const next = scaleBox(largestBox(img, 1), 10, img, 1);
		expect(next.width).toBe(3000);
		expect(next.height).toBe(3000);
	});
	test('has a floor', () => {
		expect(scaleBox({ x: 0, y: 0, width: 40, height: 40 }, 0.1, img, 1).width).toBe(32);
	});
});

describe('fitWithin', () => {
	test('downscales the longest edge, keeping the ratio', () => {
		expect(fitWithin({ width: 5000, height: 3500 }, 2400)).toEqual({ width: 2400, height: 1680 });
		expect(fitWithin({ width: 3000, height: 6000 }, 2400)).toEqual({ width: 1200, height: 2400 });
	});
	test('never upscales', () => {
		expect(fitWithin({ width: 800, height: 600 }, 2400)).toEqual({ width: 800, height: 600 });
	});
});

describe('shapes', () => {
	test('no aspect is free only', () => {
		expect(shapesFor(undefined).map((s) => s.ratio)).toEqual([null]);
	});
	test('names are plain words, custom labels win', () => {
		expect(aspectName(1)).toBe('Square');
		expect(aspectName(16 / 9)).toBe('Wide (16:9)');
		const s = shapesFor([1, 16 / 9, 'free'], ['Square — cover art']);
		expect(s.map((x) => x.label)).toEqual([
			'Square — cover art',
			'Wide (16:9)',
			'Free — keep the photo’s own shape',
		]);
	});
	test('a single number is one fixed shape', () => {
		expect(shapesFor(1)).toHaveLength(1);
		expect(shapesFor(1)[0]!.ratio).toBe(1);
	});
});
