#!/usr/bin/env bun
/**
 * Publish every workspace package via `bun publish`, which rewrites
 * `workspace:*` → resolved version in the produced tarball.
 *
 * Skip packages whose current version is already on the registry. Allows
 * partial reruns after a bad publish without throwing on "version exists".
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const packagesDir = join(root, 'packages');

const dirs = readdirSync(packagesDir).filter((d) => {
	const pkgPath = join(packagesDir, d, 'package.json');
	try {
		return JSON.parse(readFileSync(pkgPath, 'utf8')).private !== true;
	} catch {
		return false;
	}
});

const failures: string[] = [];

for (const dir of dirs) {
	const pkgPath = join(packagesDir, dir, 'package.json');
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name: string; version: string };
	const cwd = join(packagesDir, dir);

	const enc = encodeURIComponent(pkg.name);
	const headRes = spawnSync(
		'curl',
		['-s', '-o', '/dev/null', '-w', '%{http_code}', `https://registry.npmjs.org/${enc}/${pkg.version}`],
		{ encoding: 'utf8' },
	);
	if (headRes.stdout?.trim() === '200') {
		console.log(`✓ skip ${pkg.name}@${pkg.version} (already on registry)`);
		continue;
	}

	console.log(`→ publishing ${pkg.name}@${pkg.version}`);
	const res = spawnSync('bun', ['publish', '--access', 'public'], { cwd, stdio: 'inherit' });
	if (res.status !== 0) {
		console.error(`✗ failed ${pkg.name}@${pkg.version}`);
		failures.push(pkg.name);
	}
}

if (failures.length) {
	console.error(`\n${failures.length} failed: ${failures.join(', ')}`);
	process.exit(1);
}
console.log(`\n✓ all packages handled`);
