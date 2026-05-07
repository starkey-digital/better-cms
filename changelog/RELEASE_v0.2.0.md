# Release v0.2.0

**Released:** 2026-05-07
**Previous version:** v0.1.1

This release adds drop-in password authentication for SvelteKit projects and ships the first public documentation site.

## New Features

### Password auth for SvelteKit

A new `passwordAuth()` helper in `@better-cms/sveltekit` covers the most common case: a single shared admin password, without pulling in a full auth library. BYO auth still works through `config.auth.getUser`.

- PBKDF2 + HMAC via the Web Crypto API — runs unchanged on Cloudflare Workers, Node, and Bun
- Stateless signed session cookies, no database tables required
- Pluggable rate-limit store: in-memory (default), Cloudflare Durable Objects, or Upstash REST
- Per-IP and global counters with exponential backoff
- Optional Cloudflare Turnstile escalation after repeated failed attempts
- Mounts `/login`, `/logout`, and `/me` under your `config.basePath`

The admin UI gains `auth` and `turnstileSiteKey` props on `<CMSAdmin>`. A login screen renders automatically when `/me` returns `null`, and the Turnstile widget loads on demand when the server signals `TURNSTILE_REQUIRED`. A sign-out button is now available in the sidebar.

### CLI helpers

Two new commands ship with `@better-cms/cli`:

- `bcms hash-password [pw]` — prompts via masked TTY, prints a PBKDF2 hash string ready to paste into your config
- `bcms gen-secret [bytes]` — generates a random hex secret for `CMS_AUTH_SECRET`

### Documentation site

The first public documentation site is live at <https://starkey-digital.github.io/better-cms/>. Built with SvelteKit, Tailwind v4, and Shiki for syntax highlighting. Source markdown lives in `docs/` at the repo root, deployed automatically on every `v*` tag push via GitHub Actions.

Initial content covers getting started, collections, fields, operations, the libSQL and Drizzle adapters, the SvelteKit integration, and the CLI reference. More to come.

## Improvements

- Auth helper caches its HMAC `CryptoKey` per secret to keep the `getUser` hot path lean
- Per-IP and global rate-limit counters are incremented in parallel, not sequentially
- Exported `PASSWORD_AUTH_ERROR_CODES` constants make error handling type-safe
