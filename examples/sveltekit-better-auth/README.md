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
