/** Shape returned by `GET /media` and `POST /media`. */
export interface MediaItem {
	id: string;
	key: string;
	url: string;
	mime: string;
	size: number;
	width: number | null;
	height: number | null;
	alt: string;
	createdAt: number;
}

export interface MediaPage {
	items: MediaItem[];
	cursor?: string;
}

/** An error whose message is fit to show an editor as-is. */
export class MediaError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean,
	) {
		super(message);
	}
}

/** Turn an API failure into a sentence a non-technical editor can act on. */
export function plainError(
	status: number,
	serverMessage: string,
	doing: 'upload' | 'list',
): MediaError {
	const m = serverMessage.toLowerCase();
	if (status === 403 || status === 401) {
		return new MediaError(
			doing === 'upload'
				? 'You are not allowed to add photos. Ask whoever looks after the website to give you access.'
				: 'You are not allowed to see the photo library. Ask whoever looks after the website to give you access.',
			false,
		);
	}
	if (status === 413 || (status === 400 && m.includes('limit'))) {
		return new MediaError(
			'That photo is too big to upload. Pick a smaller one, or crop it tighter.',
			false,
		);
	}
	if (status === 400 && m.includes('mime')) {
		return new MediaError('That kind of file is not allowed here. Please choose a photo.', false);
	}
	if (status === 400 && m.includes('not configured')) {
		return new MediaError('Photo storage has not been set up on this website yet.', false);
	}
	return new MediaError(
		doing === 'upload'
			? 'Something went wrong while saving the photo. Please try again.'
			: 'Something went wrong while loading your photos. Please try again.',
		true,
	);
}

const OFFLINE = 'Could not reach the website. Check your internet connection and try again.';

async function failure(res: Response, doing: 'upload' | 'list'): Promise<MediaError> {
	const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
	return plainError(res.status, body?.error?.message ?? '', doing);
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export function createMediaApi(
	basePath: string,
	fetcher: Fetcher = (url, init) => fetch(url, init),
) {
	return {
		async list(cursor?: string, signal?: AbortSignal): Promise<MediaPage> {
			const url = new URL(`${basePath}/media`, 'http://x');
			if (cursor) url.searchParams.set('cursor', cursor);
			const res = await fetcher(`${basePath}/media${url.search}`, { signal }).catch((e) => {
				if (e?.name === 'AbortError') throw e;
				throw new MediaError(OFFLINE, true);
			});
			if (!res.ok) throw await failure(res, 'list');
			return (await res.json()) as MediaPage;
		},

		async upload(
			file: Blob,
			opts: { alt?: string; name?: string; folder?: string },
			signal?: AbortSignal,
		): Promise<MediaItem> {
			const fd = new FormData();
			fd.append('file', file, opts.name);
			if (opts.alt) fd.append('alt', opts.alt);
			if (opts.folder) fd.append('folder', opts.folder);
			const res = await fetcher(`${basePath}/media`, { method: 'POST', body: fd, signal }).catch(
				(e) => {
					if (e?.name === 'AbortError') throw e;
					throw new MediaError(OFFLINE, true);
				},
			);
			if (!res.ok) throw await failure(res, 'upload');
			return (await res.json()) as MediaItem;
		},
	};
}

export type MediaApi = ReturnType<typeof createMediaApi>;
