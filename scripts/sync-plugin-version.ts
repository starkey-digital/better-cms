#!/usr/bin/env bun
/**
 * Sync the Claude Code plugin version with the published `better-cms` package.
 * Runs after `changeset version` so the plugin marketplace picks up the same
 * version as every published npm package.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const pkgPath = resolve(root, 'packages/better-cms/package.json');
const pluginPath = resolve(root, 'plugins/claude-code/plugin.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
const plugin = JSON.parse(readFileSync(pluginPath, 'utf8')) as { version: string };

if (plugin.version === pkg.version) {
	console.log(`plugin already at ${pkg.version} — no change`);
	process.exit(0);
}

const before = plugin.version;
plugin.version = pkg.version;
writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`, 'utf8');
console.log(`plugin version: ${before} → ${pkg.version}`);
