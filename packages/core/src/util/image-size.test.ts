import { describe, expect, test } from 'bun:test';
import { imageSize } from './image-size.js';

const pad = (b: number[], len = 64) =>
	Uint8Array.from([...b, ...new Array(Math.max(0, len - b.length)).fill(0)]);
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('imageSize', () => {
	test('PNG', () => {
		const b = pad([
			0x89,
			...str('PNG'),
			13,
			10,
			26,
			10,
			...be32(13),
			...str('IHDR'),
			...be32(640),
			...be32(480),
		]);
		expect(imageSize(b, 'image/png')).toEqual({ width: 640, height: 480 });
	});

	test('JPEG skips non-frame segments and reads SOF', () => {
		const app0 = [0xff, 0xe0, ...be16(16), ...new Array(14).fill(0)];
		const sof = [0xff, 0xc2, ...be16(17), 8, ...be16(3500), ...be16(5000), 3, 0, 0, 0];
		const b = pad([0xff, 0xd8, ...app0, ...sof]);
		expect(imageSize(b, 'image/jpeg')).toEqual({ width: 5000, height: 3500 });
	});

	test('GIF', () => {
		const b = pad([...str('GIF89a'), ...le16(320), ...le16(200)]);
		expect(imageSize(b, 'image/gif')).toEqual({ width: 320, height: 200 });
	});

	test('WebP lossy, lossless and extended', () => {
		const head = (chunk: string) => [
			...str('RIFF'),
			0,
			0,
			0,
			0,
			...str('WEBP'),
			...str(chunk),
			0,
			0,
			0,
			0,
		];
		const lossy = pad([...head('VP8 '), 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(800), ...le16(600)]);
		expect(imageSize(lossy, 'image/webp')).toEqual({ width: 800, height: 600 });

		const bits = (1023 | (767 << 14)) >>> 0;
		const ll = pad([
			...head('VP8L'),
			0x2f,
			bits & 255,
			(bits >> 8) & 255,
			(bits >> 16) & 255,
			(bits >>> 24) & 255,
		]);
		expect(imageSize(ll, 'image/webp')).toEqual({ width: 1024, height: 768 });

		const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
		const ext = pad([...head('VP8X'), 0, 0, 0, 0, ...le24(1199), ...le24(799)]);
		expect(imageSize(ext, 'image/webp')).toEqual({ width: 1200, height: 800 });
	});

	test('truncated, wrong type or garbage answer null', () => {
		expect(imageSize(new Uint8Array(8), 'image/png')).toBeNull();
		expect(imageSize(pad([0xff, 0xd8, 0xff, 0xe0, ...be16(9999)]), 'image/jpeg')).toBeNull();
		expect(imageSize(pad([1, 2, 3]), 'application/pdf')).toBeNull();
	});
});
