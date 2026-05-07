import 'dotenv/config';
import { boolean, collection, defineCMS, image, richText, singleton, slug, text } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { passwordAuth } from 'better-cms/sveltekit/auth';

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

export default defineCMS({
	collections: {
		posts: collection({
			fields: {
				title: text({ required: true, max: 120 }),
				slug: slug({ from: 'title' }),
				excerpt: text({ multiline: true, max: 500 }),
				body: richText(),
				cover: image(),
				published: boolean({ defaultValue: false }),
			},
		}),
		settings: singleton({
			fields: {
				siteTitle: text({ required: true }),
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
});
