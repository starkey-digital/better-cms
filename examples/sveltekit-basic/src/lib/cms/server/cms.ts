import 'dotenv/config';
import type { AuthContextFn } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { passwordAuth } from 'better-cms/sveltekit/auth';
import { createCms, image, richText, slug } from 'better-cms/sveltekit/server';
import { z } from 'zod';

function required(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is required (set it in .env)`);
	return v;
}

export type AppCtx = { user: { id: string; role: 'admin' | 'editor' } } | null;

export const PostSchema = z.object({
	title: z.string().min(1).max(120),
	slug: slug(),
	excerpt: z.string().max(500).optional(),
	body: richText().optional(),
	cover: image().optional(),
	published: z.boolean().default(false),
	authorId: z.string().optional(),
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
