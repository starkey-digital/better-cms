import 'dotenv/config';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { passwordAuth } from 'better-cms/sveltekit/auth';
import { createCms } from 'better-cms/sveltekit/server';
import { defineCMS } from 'better-cms/zod';
import { collections } from '../schemas.js';

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

const config = defineCMS({
	collections,
	adapter: libsqlAdapter({
		url: process.env.DATABASE_URL ?? 'file:./local.db',
		authToken: process.env.DATABASE_AUTH_TOKEN,
	}),
	plugins: [auth],
	auth: { getUser: auth.getUser },
});

export default config;
export const cms = createCms(config);
