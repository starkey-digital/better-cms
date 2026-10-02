/**
 * Prints a sign-in link instead of emailing it.
 *
 *   bun run login-link you@example.com
 *
 * The way back in when mail is misconfigured or not set up yet. Anyone who can
 * run this already has the database credentials, so it grants nothing new.
 */
import { createAuth, migrateAuth } from '../src/lib/server/auth';

const [email, callbackURL = '/cms'] = process.argv.slice(2);
if (!email) {
	console.error('Usage: bun run login-link <email> [/callback-path]');
	process.exit(1);
}

let link: string | undefined;
const auth = createAuth(async ({ url }) => {
	link = url;
});

await migrateAuth(auth);
await auth.api.signInMagicLink({ body: { email, callbackURL }, headers: new Headers() });

if (!link) {
	console.error(`No link generated for ${email}.`);
	process.exit(1);
}
console.log(`\nSign-in link for ${email} (works once, expires in 30 minutes):\n\n${link}\n`);
