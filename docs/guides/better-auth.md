# Sign in with better-auth

Let [better-auth](https://www.better-auth.com) decide who is signed in, and let better-cms trust it. Editors get a one-field sign-in: type an email, open the link, and they are in. No password to remember, reset or leak.

better-cms stays bring-your-own-auth. It never sees tokens or users; it asks your better-auth instance "who is this request?" through `auth.context`.

A complete app is in [`examples/sveltekit-better-auth`](https://github.com/starkey-digital/better-cms/tree/main/examples/sveltekit-better-auth).

## 1. Connect the CMS to better-auth

```ts
// src/lib/cms/server/cms.ts
import { betterAuthContext } from 'better-cms/auth/better-auth';
import { auth } from '../../server/auth'; // your betterAuth({...}) instance

export const cms = createCms({
  // ...collections, adapter
  auth: { context: betterAuthContext(auth, { allow: { roles: ['admin'] } }) },
  access: {
    read: () => true,
    create: (ctx) => ctx?.user.role === 'admin',
    update: (ctx) => ctx?.user.role === 'admin',
    delete: (ctx) => ctx?.user.role === 'admin',
  },
});
```

`betterAuthContext(auth, opts?)` calls `auth.api.getSession({ headers: request.headers })`. It only uses `fetch`-style APIs, so it runs on Cloudflare Workers. `better-auth` is an optional peer dependency and is never imported by better-cms; install it yourself.

| Option | Type | Notes |
|---|---|---|
| `allow` | `(session) => boolean`, or `{ roles?, emails?, allowUnverifiedEmails? }` | Sessions that do not pass get a `null` ctx, as if signed out. `roles` matches the user's `role` (comma-separated values such as `"admin,editor"` work). `emails` is an allowlist, compared case-insensitively, and only matches users whose `emailVerified` is `true`, so nobody can sign up with an allowlisted address they do not own. Set `allowUnverifiedEmails: true` only if you verify ownership some other way (default `false`). Matching either `roles` or `emails` is enough. |
| `map` | `(session) => Ctx \| null` | Shape the ctx your access policies and hooks receive. Return `null` to deny. Runs after `allow`. |

Without `map` the ctx is `{ user: { id, email, name, role } }` (`role` is `null` when the user has none).

### Mapping roles to access policies

Anyone better-auth signs in but `allow` rejects is anonymous to the CMS, so `read` policies still apply to them. To have several roles, allow them all and decide per collection:

```ts
auth: {
  context: betterAuthContext(auth, {
    allow: { roles: ['admin', 'editor'] },
    map: (s) => ({ user: { id: s.user.id, role: s.user.role === 'admin' ? 'admin' : 'editor' } }),
  }),
},
access: {
  read: () => true,
  create: (ctx) => !!ctx,
  update: (ctx) => !!ctx,
  delete: (ctx) => ctx?.user.role === 'admin',
},
```

## 2. Set up better-auth with the magic-link plugin

```ts
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { LibsqlDialect } from '@libsql/kysely-libsql';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: { dialect: new LibsqlDialect({ url, authToken }), type: 'sqlite' },
  user: { additionalFields: { role: { type: 'string', defaultValue: 'user', input: false } } },
  plugins: [
    magicLink({
      expiresIn: 30 * 60,
      sendMagicLink: async ({ email, url }) => { /* send the email, see below */ },
    }),
  ],
});
```

Using the same libsql database as the CMS keeps everything in one place. Create better-auth's tables with `getMigrations(auth.options)` (see the example), or run `npx @better-auth/cli migrate`. If you use drizzle, use `drizzleAdapter` and drizzle-kit instead.

Mount better-auth's routes in `hooks.server.ts` next to the CMS handle:

```ts
const authHandle: Handle = ({ event, resolve }) =>
  event.url.pathname.startsWith('/api/auth/') ? auth.handler(event.request) : resolve(event);

export const handle = sequence(authHandle, cmsHandle(cms));
```

## 3. The sign-in screen

```svelte
<CmsAdmin client={cmsClient} auth magicLink />
```

The admin shows one email field and an "Email me a sign-in link" button, then "Check your email. We've sent a link to ... It works for 30 minutes." It posts with plain `fetch` to `/api/auth/sign-in/magic-link`, with a `callbackURL` back to the admin page. Nothing from better-auth is bundled into the admin.

If the link has expired or was already used, the screen says so and invites them to ask for a new one. If they sign in with an address that is not allowed to edit, it tells them to ask the site owner.

| Prop | Notes |
|---|---|
| `magicLink` | `true`, or `{ endpoint?, callbackURL?, expiresInMinutes? }`. Set `expiresInMinutes` to match your `expiresIn`. |
| `signOutUrl` | POSTed on sign out. Defaults to `/api/auth/sign-out` when `magicLink` is set. |
| `signInUrl` | For any other provider (Google, SSO): show a "Sign in" button that goes to your own login page instead. |

Sign out works for both: with `magicLink` or `signOutUrl` the admin POSTs there; otherwise it calls the CMS's own `/logout` as before. `<CmsAdmin auth />` on its own is still the password screen.

## 4. Sending the email

`sendMagicLink` is yours. In development, log the link. In production use any provider:

```ts
// Resend: plain fetch, works on Workers
await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ from: 'My Site <login@example.com>', to: email, subject: 'Your link to sign in', text: `Open this link to sign in (it works once, for 30 minutes):\n\n${url}` }),
});
```

For SMTP on Node use nodemailer. On Workers use an HTTP API (Resend, Postmark) or Cloudflare Email Service; raw SMTP sockets are not available. Always put the full URL in the body as well as behind a button, so a mail client that strips buttons cannot lock someone out. Verify your sending domain (SPF and DKIM) or the link lands in spam.

## 5. Who becomes admin

The example combines two patterns:

- **`ADMIN_EMAILS`**: a comma-separated list. Whenever one of these addresses signs in, the account is promoted to `admin`. Matching is case-insensitive and applied on every sign-in, so adding an address promotes an account that already exists.
- **First sign-in claims admin**: when `ADMIN_EMAILS` is empty, the first account to sign in becomes admin, in a single conditional `UPDATE` so two simultaneous sign-ins cannot both win. Claim it at deploy time, before anyone else can. With a list set, claiming is off so a stranger cannot take the site.

## 6. Escape hatch: a link without email

If mail is broken or not configured yet, nobody can sign in. The example ships a script that builds the same link and prints it:

```sh
bun run login-link kayleigh@example.com
```

It needs the database credentials and `BETTER_AUTH_SECRET`, which already grant more than the link does.

## Workers notes

- `betterAuthContext` is plain `fetch`/`Headers`; no Node APIs.
- Use `@libsql/client/web` (or a drizzle libsql web driver) against Turso. A `file:` database is Node only.
- Do not run `getMigrations` per request on Workers. Run migrations from the CLI or a deploy step.
- Set `baseURL` to the public origin. better-auth recognises its own routes only on a matching origin, and the emailed link is built from it.
- Read `BETTER_AUTH_SECRET` and the Resend key from your Worker environment, not at module scope.
