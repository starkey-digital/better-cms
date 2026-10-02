import type { MediaApi } from '../api/media.js';
import { errors } from '../util/result.js';

export type { MediaItem } from '../api/media.js';

/**
 * HTTP adapter over the media API: `POST /media` (upload), `GET /media`
 * (list, newest first), `DELETE /media/:id`. Parsing and formatting only —
 * policies and row access live in `createMediaApi`.
 */
export function createMediaRoutes(media: MediaApi) {
	return {
		async post(request: Request): Promise<Response> {
			await media.assertCanUpload();
			const form = await request.formData();
			const file = form.get('file');
			if (!(file instanceof Blob)) throw errors.badRequest('expected a "file" field');
			const folder = form.get('folder');
			const alt = form.get('alt');
			return Response.json(
				await media.upload(file, {
					folder: typeof folder === 'string' ? folder : undefined,
					alt: typeof alt === 'string' ? alt : undefined,
				}),
			);
		},
		async list(url: URL): Promise<Response> {
			const limit = url.searchParams.get('limit');
			return Response.json(
				await media.list({
					limit: limit === null ? undefined : Number(limit),
					cursor: url.searchParams.get('cursor') ?? undefined,
				}),
			);
		},
		async remove(id: string): Promise<Response> {
			await media.remove(id);
			return Response.json({ ok: true });
		},
	};
}
