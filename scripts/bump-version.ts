#!/usr/bin/env bun
/**
 * Bump every published `packages/*` and the Claude Code plugin to a target
 * version. Lockstep — all 8 packages move together (matches the old changeset
 * `fixed` group). Idempotent: skips files already at target.
 *
 * Usage: bun scripts/bump-version.ts 0.2.0
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const target = process.argv[2];
if (!target || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(target)) {
	console.error('usage: bun scripts/bump-version.ts <X.Y.Z>');
	process.exit(1);
}

const root = resolve(import.meta.dir, '..');
const packagesDir = join(root, 'packages');
const pluginPath = join(root, 'plugins/claude-code/plugin.json');

const updated: string[] = [];
const skipped: string[] = [];

function bumpJson(path: string, label: string): void {
	const json = JSON.parse(readFileSync(path, 'utf8')) as {
		name?: string;
		version: string;
		private?: boolean;
	};
	if (json.private === true) {
		skipped.push(`${label} (private)`);
		return;
	}
	if (json.version === target) {
		skipped.push(`${label} (already ${target})`);
		return;
	}
	const before = json.version;
	json.version = target;
	writeFileSync(path, `${JSON.stringify(json, null, '\t')}\n`, 'utf8');
	updated.push(`${label}: ${before} → ${target}`);
}

for (const dir of readdirSync(packagesDir)) {
	const pkgPath = join(packagesDir, dir, 'package.json');
	try {
		const name = (JSON.parse(readFileSync(pkgPath, 'utf8')) as { name: string }).name;
		bumpJson(pkgPath, name);
	} catch {
		// not a package dir, skip
	}
}

bumpJson(pluginPath, 'plugins/claude-code/plugin.json');

if (updated.length) {
	console.log('updated:');
	for (const u of updated) console.log(`  ${u}`);
}
if (skipped.length) {
	console.log('skipped:');
	for (const s of skipped) console.log(`  ${s}`);
}
console.log(`\n→ ${updated.length} bumped, ${skipped.length} skipped`);
