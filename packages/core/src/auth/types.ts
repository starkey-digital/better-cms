export interface CMSUser {
	id: string;
	email?: string;
	role?: string;
	[key: string]: unknown;
}

export type GetUserFn = (request: Request) => Promise<CMSUser | null> | CMSUser | null;
