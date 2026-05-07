import {
	boolean,
	collection,
	defineCMS,
	image,
	richText,
	singleton,
	slug,
	text,
} from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';

const url = process.env.DATABASE_URL ?? 'file:./local.db';

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
	adapter: libsqlAdapter({ url, authToken: process.env.DATABASE_AUTH_TOKEN }),
	auth: {
		getUser: async () => ({ id: 'dev', email: 'dev@example.com', role: 'admin' }),
	},
});
