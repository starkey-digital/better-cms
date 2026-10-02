import 'dotenv/config';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { magicLink } from 'better-auth/plugins';

// Relative imports and process.env only: scripts/login-link.ts loads this
// outside Vite, where `$lib` and `$app/*` don't resolve.

const url = process.env.DATABASE_URL ?? 'file:./local.db';
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

export const ADMIN_ROLE = 'admin';
const LINK_MINUTES = 30;

const adminEmails = (process.env.ADMIN_EMAILS ?? '')
	.split(',')
	.map((e) => e.trim().toLowerCase())
	.filter(Boolean);

// Without ADMIN_EMAILS the first sign-in claims admin. That is fine on a laptop
// and an open door on a live site, so refuse to start there.
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RESEND_API_KEY);

function assertAdminClaimIsSafe() {
	if (!isProduction || adminEmails.length) return;
	throw new Error(
		'ADMIN_EMAILS is required in production: without it the first person to sign in becomes the admin. Set ADMIN_EMAILS=you@example.com (comma-separated for several). To get a first sign-in link without email, run ADMIN_EMAILS=you@example.com bun run login-link you@example.com.',
	);
}

type Deliver = (message: { email: string; url: string }) => Promise<void>;

async function sendByResend({ email, url }: { email: string; url: string }) {
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			from: process.env.MAIL_FROM,
			to: email,
			subject: 'Your link to sign in',
			text: `Open this link to sign in. It works once and expires in ${LINK_MINUTES} minutes.\n\n${url}\n\nIf you didn't ask for this, ignore this email.`,
		}),
	});
	if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
}

const deliverByDefault: Deliver = async (message) => {
	if (process.env.RESEND_API_KEY) return sendByResend(message);
	console.log(`\n[better-auth] sign-in link for ${message.email}:\n${message.url}\n`);
};

export function createAuth(deliver: Deliver = deliverByDefault) {
	assertAdminClaimIsSafe();
	const dialect = new LibsqlDialect({ url, authToken });

	// One conditional UPDATE per grant, so two sign-ins racing on an empty
	// database cannot both become admin.
	const client = createClient({ url, authToken });
	const run = (sql: string, args: string[]) => client.execute({ sql, args });

	return betterAuth({
		secret: process.env.BETTER_AUTH_SECRET,
		baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
		database: { dialect, type: 'sqlite' },
		user: {
			additionalFields: {
				role: { type: 'string', defaultValue: 'user', input: false },
			},
		},
		databaseHooks: {
			user: {
				create: {
					// With no ADMIN_EMAILS (development only) the first account becomes the admin. With a list,
					// only listed addresses can be admin, so a stranger can't claim the site.
					after: async (user) => {
						if (adminEmails.length) return;
						await run(
							'UPDATE user SET role = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM user WHERE role = ?)',
							[ADMIN_ROLE, user.id, ADMIN_ROLE],
						);
					},
				},
			},
			session: {
				create: {
					// On every sign-in, so adding an address to ADMIN_EMAILS promotes an
					// account that already exists.
					after: async (session) => {
						if (!adminEmails.length) return;
						await run(
							`UPDATE user SET role = ? WHERE id = ? AND role <> ? AND lower(email) IN (${adminEmails.map(() => '?').join(',')})`,
							[ADMIN_ROLE, session.userId, ADMIN_ROLE, ...adminEmails],
						);
					},
				},
			},
		},
		plugins: [
			magicLink({
				expiresIn: LINK_MINUTES * 60,
				sendMagicLink: ({ email, url }) => deliver({ email, url }),
			}),
		],
	});
}

export const auth = createAuth();

/** Creates better-auth's tables in the CMS database if they aren't there yet. */
export async function migrateAuth(
	instance: { options: Parameters<typeof getMigrations>[0] } = auth,
) {
	const { runMigrations } = await getMigrations(instance.options);
	await runMigrations();
}
