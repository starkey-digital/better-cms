# better-cms · sveltekit-better-auth example

better-auth (magic-link plugin) signs editors in; better-cms trusts its session. Both store data in the same libsql database. SvelteKit 3.

```sh
bun install
cp examples/sveltekit-better-auth/.env.example examples/sveltekit-better-auth/.env   # set BETTER_AUTH_SECRET
bun run --filter './packages/*' build
cd examples/sveltekit-better-auth && bun run dev
```

Open <http://localhost:5173/cms>, enter an email, and copy the link printed in the server console. With no `ADMIN_EMAILS` the first person to sign in becomes the admin; with it set, listed addresses are promoted on sign-in.

Without a mail provider the link is only logged. Set `RESEND_API_KEY` and `MAIL_FROM` to send real email.

No mail at all? `bun run login-link you@example.com` prints a link.

See [docs/guides/better-auth.md](../../docs/guides/better-auth.md).

## End-to-end check

`bun run e2e` drives the admin in Chrome on a desktop and a phone viewport (singleton, shows, release tracks, cover photo, deletes, sign-out) and writes screenshots to `/tmp/final-*.png`. It is not run in CI. It uses `playwright-core` with your installed Chrome, so nothing is downloaded. It needs the S3 settings in `.env` (see `.env.example`; `rclone serve s3 /tmp/bcms-s3 --addr 127.0.0.1:9000` works locally) and `BASE_URL` pointing at the running dev server:

```sh
bun run dev --port 5273            # BETTER_AUTH_URL in .env must match
BASE_URL=http://localhost:5273 bun run e2e
```
