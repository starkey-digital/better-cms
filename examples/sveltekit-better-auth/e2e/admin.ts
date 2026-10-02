/**
 * End-to-end drive of the admin against a running dev server, on a desktop and
 * a phone viewport. Not part of CI: it needs a real Chrome and the example's
 * local S3 for the photo step.
 *
 *   # 1. local S3 for photos (any S3 works; set S3_* in .env to match)
 *   mkdir -p /tmp/bcms-s3/bcms && rclone serve s3 /tmp/bcms-s3 --addr 127.0.0.1:9000
 *   # 2. the example, on a port that matches BETTER_AUTH_URL in .env
 *   bun run dev --port 5273
 *   # 3. this script
 *   BASE_URL=http://localhost:5273 bun run e2e
 *
 * Signs in with the example's `login-link` script, so it needs the same .env as
 * the dev server. Screenshots land in SHOT_DIR (default /tmp) as final-*.png.
 * Uses playwright-core with the installed Chrome (`channel: 'chrome'`), so no
 * browser download happens.
 */
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { type Locator, type Page, chromium } from 'playwright-core';

const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const EMAIL = process.env.E2E_EMAIL ?? 'editor@example.com';
const SHOTS = process.env.SHOT_DIR ?? '/tmp';
const TITLE = process.env.E2E_TITLE ?? 'PELLT';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
	if (!ok) failures++;
};

function crc32(buf: Uint8Array): number {
	let c = ~0;
	for (const b of buf) {
		c ^= b;
		for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
	}
	return ~c >>> 0;
}

/** A w*h gradient PNG, so the cropper has something non-square to work with. */
function makePng(w: number, h: number): Buffer {
	const raw = Buffer.alloc((w * 3 + 1) * h);
	for (let y = 0; y < h; y++) {
		const row = y * (w * 3 + 1);
		for (let x = 0; x < w; x++) {
			raw[row + 1 + x * 3] = (x * 255) / w;
			raw[row + 2 + x * 3] = (y * 255) / h;
			raw[row + 3 + x * 3] = 160;
		}
	}
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type), data]);
		const out = Buffer.alloc(body.length + 8);
		out.writeUInt32BE(data.length, 0);
		body.copy(out, 4);
		out.writeUInt32BE(crc32(body), body.length + 4);
		return out;
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

function loginLink(): string {
	const res = spawnSync('bun', ['run', 'login-link', EMAIL], {
		cwd: new URL('..', import.meta.url).pathname,
		encoding: 'utf8',
	});
	const link = /https?:\/\/\S+/.exec(res.stdout)?.[0];
	if (!link) throw new Error(`no login link:\n${res.stdout}\n${res.stderr}`);
	return link;
}

const isWrite = (r: { url(): string; request(): { method(): string } }) =>
	r.url().includes('/api/cms/') && r.request().method() !== 'GET';

/** Run `action` and wait for the write it triggers to come back. */
async function saving(page: Page, action: () => Promise<unknown>) {
	await Promise.all([page.waitForResponse(isWrite, { timeout: 8000 }), action()]);
	await page.waitForTimeout(150);
}

async function type(page: Page, field: Locator, value: string) {
	await saving(page, async () => {
		await field.fill(value);
		await field.press('Tab');
	});
}

/** For a value that causes no write: one the browser refuses, or a field of a record not yet created. */
async function typeNoSave(page: Page, field: Locator, value: string) {
	await field.fill(value);
	await field.press('Tab');
	await page.waitForTimeout(300);
}

/** Clearing a value is the same gesture; named for what the test means. */
const clear = (page: Page, field: Locator) => type(page, field, '');

async function run(tag: 'desktop' | 'phone', viewport: { width: number; height: number }) {
	const shot = (n: string, fullPage = true) =>
		page.screenshot({ path: `${SHOTS}/final-${tag}-${n}.png`, fullPage });
	const go = async (hash: string, ready: string) => {
		await page.goto(`${BASE}/cms#/${hash}`);
		await page.reload();
		await page.waitForSelector(ready);
		await page.waitForTimeout(400);
	};
	const stripText = () => page.locator('.bcms-strip').innerText();
	const confirmDelete = async (button = 'Yes, delete') => {
		await page.getByRole('dialog').getByRole('button', { name: button }).click();
		await page.waitForTimeout(300);
	};
	const clearRepeater = async (group: Locator) => {
		while ((await group.getByRole('button', { name: /^Delete / }).count()) > 0) {
			await group
				.getByRole('button', { name: /^Delete / })
				.first()
				.click();
			if (await page.getByRole('dialog').isVisible()) await confirmDelete();
			await page.waitForTimeout(500);
		}
	};

	const browser = await chromium.launch({ channel: 'chrome' });
	const ctx = await browser.newContext({
		viewport,
		hasTouch: tag === 'phone',
		isMobile: tag === 'phone',
	});
	const page = await ctx.newPage();
	page.on('pageerror', (e) => check(`${tag}: no page errors`, false, e.message));
	page.on('console', (m) => {
		if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()))
			check(`${tag}: no console errors`, false, m.text());
	});
	const label = (re: RegExp | string) => page.getByLabel(re);
	const when = `${tag}-${Date.now().toString(36)}`;

	await page.goto(loginLink());
	await page.waitForSelector('.bcms-shell');
	await page.waitForTimeout(500);
	await shot('01-signed-in');
	if (tag === 'phone') {
		await page.getByText('Menu', { exact: true }).click();
		await page.waitForTimeout(400);
		await shot('02-menu', false);
		await page.getByRole('link', { name: 'Home page' }).click();
		await page.waitForTimeout(400);
	}

	// ---- singleton ----
	await go('site', '.bcms-form');
	const headline = page.getByRole('group', { name: /Headline lines/ });
	const ways = page.getByRole('group', { name: /Ways to support us/ });
	await clearRepeater(headline);
	await clearRepeater(ways);

	await type(page, label(/^About the band/), `We play loud.\nSecond line (${when}).`);
	await headline.getByRole('button', { name: /Add a line/ }).click();
	await type(page, headline.getByLabel('Line 1', { exact: true }), 'Loud songs');
	await headline.getByRole('button', { name: /Add a line/ }).click();
	await type(page, headline.getByLabel('Line 2', { exact: true }), 'Quiet band');

	await ways.getByRole('button', { name: /Add a way to support/ }).click();
	await type(page, ways.getByLabel('Name'), 'Patreon');
	await type(page, ways.getByLabel('What it is'), 'Monthly support');
	await type(page, ways.getByLabel('Link'), 'https://patreon.com/pellt');

	await typeNoSave(page, label(/^Patreon link/), 'not a link');
	const err = page.getByText(/isn't a web address/);
	check(`${tag}: bad URL shows an inline error`, await err.first().isVisible());
	check(
		`${tag}: URL control is type=url`,
		(await label(/^Patreon link/).getAttribute('type')) === 'url',
	);
	await shot('03-site-bad-url');
	await type(page, label(/^Patreon link/), 'https://www.patreon.com/pellt');
	check(`${tag}: error clears when fixed`, (await err.count()) === 0);
	check(`${tag}: saved receipt`, /All changes saved/.test(await stripText()), await stripText());
	await shot('04-site-saved');

	// optional URL cleared
	await clear(page, label(/^Patreon link/));
	await page.reload();
	await page.waitForSelector('.bcms-form');
	await page.waitForTimeout(400);
	check(
		`${tag}: cleared optional URL stays cleared`,
		(await label(/^Patreon link/).inputValue()) === '',
	);
	await type(page, label(/^Patreon link/), 'https://www.patreon.com/pellt');

	// ---- shows ----
	await go('shows', '.bcms-empty-card, .bcms-list');
	check(
		`${tag}: add button uses itemLabel`,
		await page.getByRole('link', { name: '+ Add a show' }).first().isVisible(),
	);
	await page.getByRole('link', { name: '+ Add a show' }).first().click();
	await page.waitForSelector('.bcms-form');
	await typeNoSave(page, label(/^Venue/), `The Fleece ${when}`);
	await saving(page, async () => {
		await label(/^Date/).fill('2026-09-03');
		await label(/^Date/).press('Tab');
	});
	await page.waitForFunction(() => !location.hash.endsWith('/new'));
	await page.waitForSelector('.bcms-danger-zone');
	await page.waitForTimeout(400);
	await type(page, label(/^City/), 'Bristol');
	await typeNoSave(page, label(/^Ticket link/), 'tickets');
	check(
		`${tag}: show: bad ticket URL error`,
		await page
			.getByText(/isn't a web address/)
			.first()
			.isVisible(),
	);
	await shot('05-show-bad-url');
	await type(page, label(/^Ticket link/), 'https://tickets.example.com/fleece');
	check(`${tag}: show saved`, /All changes saved/.test(await stripText()), await stripText());
	await shot('06-show-saved');

	await page.reload();
	await page.waitForSelector('.bcms-form');
	await page.waitForTimeout(400);
	check(`${tag}: show persisted`, (await label(/^City/).inputValue()) === 'Bristol');
	await clear(page, label(/^City/));
	await clear(page, label(/^Ticket link/));
	await page.reload();
	await page.waitForSelector('.bcms-form');
	await page.waitForTimeout(400);
	check(
		`${tag}: cleared optional text + URL stay cleared`,
		(await label(/^City/).inputValue()) === '' && (await label(/^Ticket link/).inputValue()) === '',
	);

	await go('shows', '.bcms-list');
	const rowText = await page.locator('.bcms-row', { hasText: `The Fleece ${when}` }).innerText();
	check(
		`${tag}: list title has date and venue`,
		/2026/.test(rowText) && rowText.includes(`The Fleece ${when}`),
		rowText.replace(/\n/g, ' | '),
	);
	await shot('07-shows-list');

	// ---- release: tracks and cover ----
	await go('releases', '.bcms-empty-card, .bcms-list');
	await page.getByRole('link', { name: '+ Add a release' }).first().click();
	await page.waitForSelector('.bcms-form');
	await typeNoSave(page, label(/^Title/), `E2E EP ${when}`);
	await label(/^Type/).selectOption('EP');
	await saving(page, async () => {
		await label(/^Release date/).fill('2026-10-01');
		await label(/^Release date/).press('Tab');
	});
	await page.waitForFunction(() => !location.hash.endsWith('/new'));
	await page.waitForSelector('.bcms-danger-zone');
	await page.waitForTimeout(400);

	const tracks = page.getByRole('group', { name: /Track list/ });
	for (const [i, name] of ['Alpha', 'Bravo', 'Charlie'].entries()) {
		await tracks.getByRole('button', { name: /Add a track/ }).click();
		await type(page, tracks.getByLabel(`Track ${i + 1}`, { exact: true }), name);
	}
	await saving(page, () => tracks.getByRole('button', { name: 'Move track 1 down' }).click());
	check(
		`${tag}: reorder`,
		(await tracks.getByLabel('Track 1', { exact: true }).inputValue()) === 'Bravo',
	);
	await shot('08-tracks');
	await tracks.getByRole('button', { name: 'Delete track 3' }).click();
	await shot('09-track-delete-confirm', false);
	await saving(page, () => confirmDelete());
	check(`${tag}: track deleted`, (await tracks.getByLabel(/^Track \d$/).count()) === 2);

	const cover = page.getByRole('group', { name: /Cover art/ });
	check(
		`${tag}: photo group announced once`,
		(await page.getByRole('group', { name: /Cover art/ }).count()) === 1 &&
			(await page.getByText('Cover art', { exact: true }).count()) === 1,
		`${await page.getByRole('group', { name: /Cover art/ }).count()} groups, ${await page.getByText('Cover art', { exact: true }).count()} labels`,
	);
	await cover.getByRole('button', { name: 'Choose a photo' }).click();
	const dlg = page.locator('dialog.bcms-pick');
	await dlg.waitFor();
	await shot('10-picker', false);
	await dlg.locator('input[type=file]').setInputFiles({
		name: 'cover.png',
		mimeType: 'image/png',
		buffer: makePng(1200, 800),
	});
	await page.waitForSelector('.bcms-crop-box');
	await page.waitForTimeout(500);
	await dlg.getByRole('button', { name: 'Zoom in' }).click();
	await dlg.getByRole('button', { name: 'Zoom in' }).click();
	await page.waitForTimeout(300);
	await shot('11-crop', false);
	await dlg.getByRole('button', { name: 'Use this photo' }).click();
	check(`${tag}: alt text required`, await dlg.getByText(/Please describe the photo/).isVisible());
	await dlg.getByLabel(/Describe the photo/).fill('A purple and green test pattern');
	await saving(page, () => dlg.getByRole('button', { name: 'Use this photo' }).click());
	await dlg.waitFor({ state: 'detached' });
	await page.waitForTimeout(600);
	check(`${tag}: cover shown`, await cover.locator('img').isVisible());
	await shot('12-cover-set');

	await page.reload();
	await page.waitForSelector('.bcms-form');
	await page.waitForTimeout(600);
	check(`${tag}: cover persisted`, await cover.locator('img').isVisible());
	const tracksAfter = await tracks
		.locator('input')
		.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
	check(
		`${tag}: tracks persisted in order`,
		tracksAfter.join() === 'Bravo,Alpha',
		tracksAfter.join(),
	);

	await cover.getByRole('button', { name: 'Remove photo' }).click();
	await shot('13-cover-remove-confirm', false);
	await saving(page, () => page.getByRole('button', { name: 'Yes, remove it' }).click());
	await page.reload();
	await page.waitForSelector('.bcms-form');
	await page.waitForTimeout(600);
	check(`${tag}: removed cover stays removed`, (await cover.locator('img').count()) === 0);
	await shot('14-cover-removed');

	// ---- deletes ----
	await page.getByRole('button', { name: 'Delete this release' }).click();
	await confirmDelete();
	await page.waitForSelector('.bcms-list, .bcms-empty-card');
	await go('shows', '.bcms-list');
	await page.locator('.bcms-row', { hasText: `The Fleece ${when}` }).click();
	await page.waitForSelector('.bcms-danger-zone');
	await page.getByRole('button', { name: 'Delete this show' }).click();
	check(
		`${tag}: confirm names the item`,
		await page.getByRole('dialog').getByText('Delete this show?').isVisible(),
	);
	await shot('15-show-delete-confirm', false);
	await confirmDelete();
	await page.waitForSelector('.bcms-list, .bcms-empty-card');
	check(
		`${tag}: show deleted`,
		(await page.locator('.bcms-row', { hasText: `The Fleece ${when}` }).count()) === 0,
	);
	await shot('16-after-delete');

	// ---- persistence, then sign out ----
	await go('site', '.bcms-form');
	check(
		`${tag}: singleton persisted`,
		(await label(/^About the band/).inputValue()).includes(when) &&
			(await headline.getByLabel('Line 2', { exact: true }).inputValue()) === 'Quiet band' &&
			(await ways.getByLabel('Name').inputValue()) === 'Patreon',
	);
	await shot('17-site-reloaded');
	if (tag === 'phone') await page.getByText('Menu', { exact: true }).click();
	await page.getByRole('button', { name: 'Sign out' }).click();
	await page.waitForSelector('.bcms-login');
	await page.waitForTimeout(400);
	check(
		`${tag}: login screen uses the title prop`,
		(await page.locator('.bcms-login-title').first().innerText()) === TITLE,
	);
	await shot('18-signed-out');

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	check(`${tag}: no sideways scroll`, overflow <= 1, `${overflow}px`);
	await browser.close();
}

await run('desktop', { width: 1440, height: 900 });
await run('phone', { width: 390, height: 844 });
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
