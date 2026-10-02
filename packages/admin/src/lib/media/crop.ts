/** Crop-box arithmetic, kept out of the component so it is testable without a browser. */

/** A box in source-image pixels. */
export type Box = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/** A crop shape the editor can choose. `ratio: null` keeps the photo's own shape. */
export type Shape = { id: string; label: string; ratio: number | null };

export const DEFAULT_MAX_SIZE = 2400;

const KNOWN_RATIOS: [number, string][] = [
	[1, 'Square'],
	[16 / 9, 'Wide (16:9)'],
	[4 / 3, 'Wide (4:3)'],
	[3 / 2, 'Wide (3:2)'],
	[5 / 4, 'Wide (5:4)'],
	[9 / 16, 'Tall (9:16)'],
	[3 / 4, 'Tall (3:4)'],
	[2 / 3, 'Tall (2:3)'],
	[4 / 5, 'Tall (4:5)'],
];

/** A ratio named in plain words: 1 -> "Square", 16/9 -> "Wide (16:9)". */
export function aspectName(ratio: number): string {
	const known = KNOWN_RATIOS.find(([r]) => Math.abs(r - ratio) < 0.01);
	if (known) return known[1];
	return ratio > 1 ? `Wide (${ratio.toFixed(2)}:1)` : `Tall (1:${(1 / ratio).toFixed(2)})`;
}

const FREE: Shape = { id: 'free', label: 'Free — keep the photo’s own shape', ratio: null };

/**
 * The shapes a field offers, from its `aspect` / `aspectLabel` meta.
 * No `aspect` -> free only. A number or list -> exactly those shapes (a custom
 * label wins over the generated name); `'free'` among them adds the free option.
 */
export function shapesFor(aspect: unknown, aspectLabel?: unknown): Shape[] {
	const list = (Array.isArray(aspect) ? aspect : [aspect]).filter(
		(a): a is number | 'free' => a === 'free' || (typeof a === 'number' && a > 0),
	);
	if (list.length === 0) return [FREE];
	const labels = Array.isArray(aspectLabel) ? aspectLabel : [aspectLabel];
	return list.map((a, i) => {
		if (a === 'free') return FREE;
		const custom = typeof labels[i] === 'string' ? (labels[i] as string) : undefined;
		return { id: `r${a}`, ratio: a, label: custom ?? aspectName(a) };
	});
}

/** The largest centred box of `ratio` that fits the image. With no ratio, the whole image. */
export function largestBox(image: Size, ratio: number | null): Box {
	if (!ratio) return { x: 0, y: 0, ...image };
	const wide = image.width / image.height > ratio;
	const width = wide ? image.height * ratio : image.width;
	const height = wide ? image.height : image.width / ratio;
	return { x: (image.width - width) / 2, y: (image.height - height) / 2, width, height };
}

/** Force a box back inside the image, keeping its size where it can. */
export function clampBox(box: Box, image: Size): Box {
	const width = Math.min(box.width, image.width);
	const height = Math.min(box.height, image.height);
	return {
		width,
		height,
		x: Math.min(Math.max(0, box.x), image.width - width),
		y: Math.min(Math.max(0, box.y), image.height - height),
	};
}

/** Resize a box about its centre. The ratio, when set, wins over the factor. */
export function scaleBox(box: Box, factor: number, image: Size, ratio: number | null): Box {
	const MIN = 32;
	let width = Math.max(MIN, box.width * factor);
	let height = ratio ? width / ratio : Math.max(MIN, box.height * factor);
	if (height > image.height) {
		height = image.height;
		if (ratio) width = height * ratio;
	}
	if (width > image.width) {
		width = image.width;
		if (ratio) height = width / ratio;
	}
	return clampBox(
		{
			width,
			height,
			x: box.x + (box.width - width) / 2,
			y: box.y + (box.height - height) / 2,
		},
		image,
	);
}

/** True when the box covers the whole image (one pixel of float tolerance). */
export function isWholeImage(box: Box, image: Size): boolean {
	return box.x <= 1 && box.y <= 1 && box.width >= image.width - 1 && box.height >= image.height - 1;
}

/** `size` scaled down so its longest edge is at most `max`. Never scales up. */
export function fitWithin(size: Size, max: number): Size {
	const longest = Math.max(size.width, size.height);
	if (longest <= max) return { width: Math.round(size.width), height: Math.round(size.height) };
	const k = max / longest;
	return {
		width: Math.max(1, Math.round(size.width * k)),
		height: Math.max(1, Math.round(size.height * k)),
	};
}

export const sizeLabel = (box: Size) => `${Math.round(box.width)} × ${Math.round(box.height)}`;
