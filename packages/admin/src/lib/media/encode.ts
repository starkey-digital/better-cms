import { type Box, type Size, fitWithin, isWholeImage } from './crop.js';

const KEEP_AS_IS = ['image/jpeg', 'image/png', 'image/webp'];
const QUALITY = 0.86;

let webpOk: boolean | undefined;
/** Safari cannot encode WebP from a canvas; it silently answers PNG, which is how we tell. */
function canEncodeWebp(): boolean {
	webpOk ??= document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
	return webpOk;
}

/** Formats a browser shows as an <img> but which others (and the server limit) cannot take. */
export const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

/** GIF and SVG would be flattened or rasterised by a canvas, so they are uploaded untouched. */
export const isUntouchable = (f: File) => f.type === 'image/gif' || f.type === 'image/svg+xml';

/**
 * Crop and downscale in the browser so what is stored is what the editor saw,
 * and a 12-megapixel phone photo does not blow the upload limit.
 *
 * Returns the original file when nothing would change (whole image, already
 * small enough, a format that is fine as it is) — re-encoding costs quality.
 * Output is WebP where the browser can encode it, otherwise JPEG; PNG stays
 * PNG when WebP is unavailable so transparency survives.
 */
export async function prepareImage(
	file: File,
	natural: Size,
	box: Box | null,
	maxSize: number,
): Promise<File> {
	const source = box ?? { x: 0, y: 0, ...natural };
	const target = fitWithin(source, maxSize);
	const unchanged =
		isWholeImage(source, natural) &&
		target.width === natural.width &&
		target.height === natural.height;
	if (unchanged && KEEP_AS_IS.includes(file.type)) return file;

	const bitmap = await createImageBitmap(file);
	try {
		const canvas = document.createElement('canvas');
		canvas.width = target.width;
		canvas.height = target.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('canvas unavailable');
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(
			bitmap,
			Math.round(source.x),
			Math.round(source.y),
			Math.round(source.width),
			Math.round(source.height),
			0,
			0,
			target.width,
			target.height,
		);
		const type = canEncodeWebp()
			? 'image/webp'
			: file.type === 'image/png'
				? 'image/png'
				: 'image/jpeg';
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, type, type === 'image/png' ? undefined : QUALITY),
		);
		if (!blob) throw new Error('could not encode');
		if (unchanged && blob.size >= file.size) return file;
		const ext = type === 'image/jpeg' ? 'jpg' : type.slice(6);
		return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${ext}`, { type });
	} finally {
		bitmap.close();
	}
}
