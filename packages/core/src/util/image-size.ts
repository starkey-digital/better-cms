export interface ImageSize {
	width: number;
	height: number;
}

const ascii = (bytes: Uint8Array, at: number, length: number) =>
	String.fromCharCode(...bytes.subarray(at, at + length));

function png(bytes: Uint8Array, view: DataView): ImageSize | null {
	if (ascii(bytes, 1, 3) !== 'PNG') return null;
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

function gif(bytes: Uint8Array, view: DataView): ImageSize | null {
	if (ascii(bytes, 0, 3) !== 'GIF') return null;
	return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

/** Walk the marker chain to the first start-of-frame; every SOFn except C4/C8/CC carries the size. */
function jpeg(bytes: Uint8Array, view: DataView): ImageSize | null {
	let at = 2;
	while (at + 9 < bytes.length) {
		if (bytes[at] !== 0xff) return null;
		const marker = bytes[at + 1]!;
		if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
			return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
		}
		at += 2 + view.getUint16(at + 2);
	}
	return null;
}

/** WebP is three containers: lossy `VP8 `, lossless `VP8L`, extended `VP8X`. */
function webp(bytes: Uint8Array, view: DataView): ImageSize | null {
	if (ascii(bytes, 8, 4) !== 'WEBP') return null;
	const chunk = ascii(bytes, 12, 4);
	if (chunk === 'VP8 ') {
		return {
			width: view.getUint16(26, true) & 0x3fff,
			height: view.getUint16(28, true) & 0x3fff,
		};
	}
	if (chunk === 'VP8L') {
		const bits = view.getUint32(21, true);
		return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
	}
	if (chunk === 'VP8X') {
		const at24 = (o: number) => bytes[o]! | (bytes[o + 1]! << 8) | (bytes[o + 2]! << 16);
		return { width: at24(24) + 1, height: at24(27) + 1 };
	}
	return null;
}

/** First `ispe` box in the header region; avoids walking the nested meta box tree. */
function avif(bytes: Uint8Array, view: DataView): ImageSize | null {
	const limit = Math.min(bytes.length - 16, 4096);
	for (let at = 0; at < limit; at++) {
		if (ascii(bytes, at, 4) !== 'ispe') continue;
		return { width: view.getUint32(at + 8), height: view.getUint32(at + 12) };
	}
	return null;
}

/**
 * Pixel size of an image read from its own header — no decoder, so it runs on
 * Cloudflare Workers. Answers null for an unsupported type or unreadable
 * header; callers store the row without dimensions rather than failing.
 */
export function imageSize(bytes: Uint8Array, mime: string): ImageSize | null {
	if (bytes.length < 32) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	try {
		const size =
			mime === 'image/png'
				? png(bytes, view)
				: mime === 'image/jpeg'
					? jpeg(bytes, view)
					: mime === 'image/webp'
						? webp(bytes, view)
						: mime === 'image/gif'
							? gif(bytes, view)
							: mime === 'image/avif'
								? avif(bytes, view)
								: null;
		return size && size.width > 0 && size.height > 0 ? size : null;
	} catch {
		return null;
	}
}
