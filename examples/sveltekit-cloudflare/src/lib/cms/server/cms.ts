import { createClient } from '@libsql/client';
import type { AuthContextFn } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { libsqlStore, passwordAuth } from 'better-cms/auth';
import { s3Media } from 'better-cms/media/s3';
import {
	collection,
	createCms,
	image,
	relation,
	richText,
	slug,
} from 'better-cms/sveltekit/server';
import { z } from 'zod';

function required(name: string): string {
	const v = process.env[name];
	if (!v)
		throw new Error(
			`${name} is required (set it in .dev.vars locally, or with wrangler secret put)`,
		);
	return v;
}

export type AppCtx = { user: { id: string; role: 'admin' | 'editor' } } | null;

export const AuthorSchema = z.object({
	name: z.string().min(1).max(120),
	bio: z.string().max(500).optional(),
});

// Declared before PostSchema so `relation(authors)` can take the def directly.
// Use a `() => authors` thunk instead when the reference points forward.
export const authors = collection({ schema: AuthorSchema });

export const PostSchema = z.object({
	title: z.string().min(1).max(120),
	slug: slug(),
	excerpt: z.string().max(500).optional(),
	body: richText().optional(),
	cover: image().optional(),
	published: z.boolean().default(false),
	authorId: relation(authors).optional(),
});

export const SettingsSchema = z.object({
	siteTitle: z.string().min(1),
	tagline: z.string().optional(),
});

export const SecretSchema = z.object({
	name: z.string().min(1),
	value: z.string().min(1),
});

// One client for the adapter and the rate limiter. Workers have no shared memory
// between isolates, so login throttling lives in the CMS database itself.
const client = createClient({
	url: required('DATABASE_URL'),
	authToken: process.env.DATABASE_AUTH_TOKEN,
});

// CMS_PASSWORD_HASH (from `bcms hash-password`) keeps the plaintext out of env
// dumps but costs PBKDF2 CPU on every login; see docs/integrations/cloudflare-workers.md.
const credential = process.env.CMS_PASSWORD_HASH
	? { passwordHash: process.env.CMS_PASSWORD_HASH }
	: { password: required('CMS_PASSWORD') };

const password = passwordAuth({
	...credential,
	secret: required('CMS_AUTH_SECRET'),
	cookieSecure: process.env.CMS_COOKIE_SECURE !== 'false',
	rateLimit: { store: libsqlStore(client) },
});

const context: AuthContextFn<AppCtx> = async (request) => {
	const ctx = await password.context(request);
	if (!ctx) return null;
	return { user: { id: ctx.user.id, role: 'admin' } };
};

export const cms = createCms({
	collections: ({ collection, singleton }) => ({
		posts: collection({
			schema: PostSchema,
			hooks: {
				beforeDelete: ({ prev }) => {
					if (prev?.published) {
						throw new Error('cannot delete a published post — unpublish it first');
					}
				},
			},
		}),
		authors,
		settings: singleton({ schema: SettingsSchema }),
		secrets: collection({
			schema: SecretSchema,
			access: {
				read: (ctx) => ctx?.user.role === 'admin',
			},
		}),
	}),
	basePath: '/api/cms',
	adapter: libsqlAdapter({ client }),
	plugins: [password],
	// Optional: uploads are enabled when S3_BUCKET is set (R2, Wasabi, AWS...).
	media: process.env.S3_BUCKET
		? s3Media({
				bucket: process.env.S3_BUCKET,
				endpoint: process.env.S3_ENDPOINT,
				region: process.env.S3_REGION,
				accessKeyId: process.env.S3_ACCESS_KEY_ID,
				secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
				publicBaseUrl: process.env.S3_PUBLIC_URL,
			})
		: undefined,
	// Uploads are denied until an explicit policy allows them.
	mediaAccess: { upload: (ctx) => ctx?.user.role === 'admin' },
	auth: { context },
	access: {
		read: () => true,
		create: (ctx) => ctx?.user.role === 'admin',
		update: (ctx) => ctx?.user.role === 'admin',
		delete: (ctx) => ctx?.user.role === 'admin',
	},
});

export default cms;
export type Cms = typeof cms;
