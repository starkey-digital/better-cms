import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CONFIG_TEMPLATE = `import { defineCMS, collection, text, slug, richText, image, boolean } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { s3Media } from 'better-cms/media/s3';

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
	},
	adapter: libsqlAdapter({
		url: process.env.DATABASE_URL!,
		authToken: process.env.DATABASE_AUTH_TOKEN,
	}),
	media: s3Media({
		bucket: process.env.S3_BUCKET!,
		region: process.env.S3_REGION,
		endpoint: process.env.S3_ENDPOINT,
		accessKeyId: process.env.S3_ACCESS_KEY_ID,
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
		publicBaseUrl: process.env.S3_PUBLIC_URL,
	}),
	auth: {
		getUser: async (_request) => ({ id: 'dev', email: 'dev@example.com', role: 'admin' }),
	},
});
`;

const ENV_TEMPLATE = `DATABASE_URL=file:./local.db
DATABASE_AUTH_TOKEN=

S3_BUCKET=
S3_REGION=auto
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=
`;

export interface InitOpts {
	cwd?: string;
	force?: boolean;
}

export async function init(opts: InitOpts = {}): Promise<{ written: string[] }> {
	const cwd = opts.cwd ?? process.cwd();
	const written: string[] = [];

	const configPath = resolve(cwd, 'src/lib/cms.config.ts');
	if (existsSync(configPath) && !opts.force) {
		console.warn(`[better-cms] ${configPath} exists — skipping (use --force to overwrite)`);
	} else {
		mkdirSync(dirname(configPath), { recursive: true });
		writeFileSync(configPath, CONFIG_TEMPLATE, 'utf8');
		written.push(configPath);
	}

	const envPath = resolve(cwd, '.env.example');
	if (!existsSync(envPath) || opts.force) {
		writeFileSync(envPath, ENV_TEMPLATE, 'utf8');
		written.push(envPath);
	}

	return { written };
}
