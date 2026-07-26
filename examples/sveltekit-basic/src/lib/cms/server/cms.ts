import 'dotenv/config';
import type { AuthContextFn } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { passwordAuth } from 'better-cms/auth';
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
	if (!v) throw new Error(`${name} is required (set it in .env)`);
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

const password = passwordAuth({
	password: required('CMS_PASSWORD'),
	secret: required('CMS_AUTH_SECRET'),
	cookieSecure: process.env.NODE_ENV === 'production',
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
	adapter: libsqlAdapter({
		url: process.env.DATABASE_URL ?? 'file:./local.db',
		authToken: process.env.DATABASE_AUTH_TOKEN,
	}),
	plugins: [password],
	// No media store is wired in this example, but the policy is what decides
	// whether POST /api/cms/media is reachable at all — uploads are denied
	// until an explicit policy allows them.
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
