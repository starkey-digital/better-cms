import 'dotenv/config';
import { boolean, collection, defineCMS, image, richText, singleton, slug, text } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { passwordAuth } from 'better-cms/sveltekit/auth';
import { createCms } from 'better-cms/sveltekit/server';
import { z } from 'zod';

function required(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is required (set it in .env)`);
	return v;
}

const auth = passwordAuth({
	password: required('CMS_PASSWORD'),
	secret: required('CMS_AUTH_SECRET'),
	cookieSecure: process.env.NODE_ENV === 'production',
});

// Shared zod fragments — reused by per-field validation. The same schemas
// flow through to the SvelteKit `command` / `query` validators (they both
// accept Standard Schema), so there is one source of truth per field.
const zSlug = z.string().regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and dashes only');
const zTitle = z.string().min(1).max(120);
const zExcerpt = z.string().max(500);
const zImageRef = z.object({
	key: z.string(),
	url: z.string(),
	mime: z.string().optional(),
	size: z.number().optional(),
	width: z.number().optional(),
	height: z.number().optional(),
	alt: z.string().optional(),
});

const config = defineCMS({
	collections: {
		posts: collection({
			fields: {
				title: text({ required: true, validation: zTitle }),
				slug: slug({ from: 'title', validation: zSlug }),
				excerpt: text({ multiline: true, validation: zExcerpt }),
				body: richText(),
				cover: image({ validation: zImageRef }),
				published: boolean({ defaultValue: false }),
			},
		}),
		settings: singleton({
			fields: {
				siteTitle: text({ required: true, validation: z.string().min(1) }),
				tagline: text(),
			},
		}),
	},
	adapter: libsqlAdapter({
		url: process.env.DATABASE_URL ?? 'file:./local.db',
		authToken: process.env.DATABASE_AUTH_TOKEN,
	}),
	plugins: [auth],
	auth: { getUser: auth.getUser },
	// Optional integration: zod 4's built-in JSON Schema converter enriches
	// admin form hints and MCP tool descriptors with min/max/pattern/etc.
	validator: { toJsonSchema: (s) => z.toJSONSchema(s as never) },
});

export default config;
export const cms = createCms(config);
