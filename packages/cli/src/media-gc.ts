import { getCmsTables } from '@better-cms/core';
import type { CmsConfig, MediaObject } from '@better-cms/core';
import { loadConfig } from './load-config.js';

export interface MediaGcOpts {
	cwd?: string;
	configPath?: string;
	/** Ignore objects newer than this many hours. Default 24. */
	minAgeHours?: number;
	/** Restrict the sweep to one key prefix. */
	prefix?: string;
	/** Actually delete. Without it the command only reports. */
	apply?: boolean;
}

export interface MediaGcResult {
	scanned: number;
	referenced: number;
	orphans: MediaObject[];
	deleted: string[];
	skippedTooNew: number;
	applied: boolean;
}

const PAGE = 500;

/**
 * Reclaim bucket objects that no `cms_media` row references.
 *
 * Uploads write the blob before the row that references it. That window is
 * compensated in the request path, but a process that dies mid-upload — or a
 * compensating delete that itself fails — still leaves an object nothing
 * points at and nothing will ever look for. This is the sweep that finds
 * them; it is the only mechanism that catches crash-orphans, since by
 * definition no handler survived to clean up.
 *
 * Reports by default. Deleting from a bucket is not something to do as a
 * side effect of asking what is in it.
 */
export async function mediaGc(opts: MediaGcOpts = {}): Promise<MediaGcResult> {
	const cwd = opts.cwd ?? process.cwd();
	const { config } = await loadConfig(cwd, opts.configPath);
	const result = await sweepMedia(config as CmsConfig, opts);
	await (config as CmsConfig).adapter.close?.();
	await (config as CmsConfig).media?.close?.();
	return result;
}

/**
 * The sweep itself, against an already-resolved config. Split out so it can be
 * exercised directly — the CLI entry point's job is only to find the config
 * and close what it opened.
 */
export async function sweepMedia(
	cms: CmsConfig,
	opts: Omit<MediaGcOpts, 'cwd' | 'configPath'> = {},
): Promise<MediaGcResult> {
	const media = cms.media;
	if (!media) throw new Error('[better-cms] no media store configured — nothing to sweep');
	if (!media.list) {
		throw new Error('[better-cms] the configured media store cannot list objects');
	}

	// Ensure the adapter knows the schema before we query cms_media.
	if (cms.adapter.init) await cms.adapter.init(getCmsTables(cms));

	const referenced = await referencedKeys(cms);
	const minAgeMs = (opts.minAgeHours ?? 24) * 60 * 60 * 1000;
	const cutoff = Date.now() - minAgeMs;

	const orphans: MediaObject[] = [];
	let scanned = 0;
	let skippedTooNew = 0;
	let cursor: string | undefined;

	do {
		const page = await media.list(opts.prefix, cursor, PAGE);
		for (const object of page.items) {
			scanned++;
			if (referenced.has(object.key)) continue;
			// An object with no timestamp could be seconds old and mid-upload.
			// Refusing to judge it is the safe default for a delete.
			const at = object.lastModified?.getTime();
			if (at === undefined || at > cutoff) {
				skippedTooNew++;
				continue;
			}
			orphans.push(object);
		}
		cursor = page.cursor;
	} while (cursor);

	const deleted: string[] = [];
	if (opts.apply) {
		for (const object of orphans) {
			await media.delete(object.key);
			deleted.push(object.key);
		}
	}

	return {
		scanned,
		referenced: referenced.size,
		orphans,
		deleted,
		skippedTooNew,
		applied: Boolean(opts.apply),
	};
}

/** Every key `cms_media` knows about, paged so a large library does not land in one query. */
async function referencedKeys(cms: CmsConfig): Promise<Set<string>> {
	const keys = new Set<string>();
	let offset = 0;
	while (true) {
		const rows = await cms.adapter.findMany('cms_media', {
			limit: PAGE,
			offset,
			select: ['key'],
		});
		for (const row of rows) {
			if (typeof row.key === 'string') keys.add(row.key);
		}
		if (rows.length < PAGE) return keys;
		offset += PAGE;
	}
}

export function formatMediaGc(result: MediaGcResult): string {
	const lines = [
		`scanned ${result.scanned} object(s); ${result.referenced} referenced by cms_media`,
	];
	if (result.skippedTooNew > 0) {
		lines.push(`skipped ${result.skippedTooNew} too new (or with no timestamp) to judge`);
	}
	if (result.orphans.length === 0) {
		lines.push('no orphans found');
		return lines.join('\n');
	}
	const bytes = result.orphans.reduce((sum, o) => sum + (o.size ?? 0), 0);
	lines.push(`${result.orphans.length} orphan(s), ${(bytes / 1024 / 1024).toFixed(2)} MiB:`);
	for (const o of result.orphans) lines.push(`  ${o.key}`);
	lines.push(
		result.applied
			? `deleted ${result.deleted.length} object(s)`
			: 'dry run — re-run with --apply to delete',
	);
	return lines.join('\n');
}
