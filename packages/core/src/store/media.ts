export interface MediaObject {
	key: string;
	url: string;
	mime: string;
	size: number;
	width?: number;
	height?: number;
	etag?: string;
}

export interface MediaPutOpts {
	key?: string;
	mime?: string;
	folder?: string;
	cacheControl?: string;
	publicRead?: boolean;
	metadata?: Record<string, string>;
}

export interface MediaListPage {
	items: MediaObject[];
	cursor?: string;
}

/**
 * Blob storage adapter. S3-compatible by default but interface is bucket-agnostic.
 */
export interface MediaStore {
	put(
		body: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
		opts?: MediaPutOpts,
	): Promise<MediaObject>;

	delete(key: string): Promise<void>;

	get?(key: string): Promise<{ body: ReadableStream<Uint8Array>; mime: string } | null>;

	presign?(key: string, op: 'read' | 'write', ttlSeconds?: number): Promise<string>;

	list?(prefix?: string, cursor?: string, limit?: number): Promise<MediaListPage>;

	close?(): Promise<void> | void;
}
