import 'dotenv/config';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { betterAuthContext } from 'better-cms/auth/better-auth';
import { collection, createCms, richText, slug } from 'better-cms/sveltekit/server';
import { z } from 'zod';
import { auth } from '../../server/auth.ts';

export const PostSchema = z.object({
	title: z.string().min(1).max(120),
	slug: slug(),
	body: richText().optional(),
	published: z.boolean().default(false),
});

export const SettingsSchema = z.object({
	siteTitle: z.string().min(1),
});

// Only accounts with role "admin" get a ctx at all; everyone else is anonymous.
const context = betterAuthContext(auth, { allow: { roles: ['admin'] } });

export const cms = createCms({
	collections: ({ singleton }) => ({
		posts: collection({ schema: PostSchema }),
		settings: singleton({ schema: SettingsSchema }),
	}),
	basePath: '/api/cms',
	adapter: libsqlAdapter({
		url: process.env.DATABASE_URL ?? 'file:./local.db',
		authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
	}),
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
