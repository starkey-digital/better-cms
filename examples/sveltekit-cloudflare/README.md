# better-cms · sveltekit-cloudflare example

The [sveltekit-basic](../sveltekit-basic) app on Cloudflare Workers: `@sveltejs/adapter-cloudflare`, libsql over HTTP, password auth, rate limiting stored in the CMS database, optional S3/R2 media. See [Deploying to Cloudflare Workers](../../docs/integrations/cloudflare-workers.md).

## Run locally in workerd

```sh
bun install
bun run --filter './packages/*' build
sqld --http-listen-addr 127.0.0.1:8081 -d /tmp/bcms-sqld   # any libsql HTTP endpoint works
cp .dev.vars.example .dev.vars
bun run preview        # vite build && wrangler dev  -> http://localhost:8787
```

`bun run dev` runs plain `vite dev` in Node, reading the same `.dev.vars`.

## Deploy

```sh
wrangler secret put CMS_AUTH_SECRET
wrangler secret put CMS_PASSWORD
wrangler secret put DATABASE_AUTH_TOKEN
# set DATABASE_URL under "vars" in wrangler.jsonc
bun run deploy
```
