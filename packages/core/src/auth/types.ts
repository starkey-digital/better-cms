export interface CmsUser {
	id: string;
	email?: string;
	role?: string;
	[key: string]: unknown;
}

export type GetUserFn = (request: Request) => Promise<CmsUser | null> | CmsUser | null;
