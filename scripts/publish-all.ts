#!/usr/bin/env bun
/**
 * Publish every workspace package by packing with `bun pm pack` and uploading
 * the tarball with `npm publish <tgz>`.
 *
 * Bun remains the package manager; only the upload is npm's. `bun pm pack`
 * resolves `workspace:*` to real versions in the packed package.json — the same
 * rewrite `bun publish` does — so the reason we could not use `npm publish`
 * historically (it leaves the workspace protocol literal when it packs) does
 * not apply once bun has already produced the tarball.
 *
 * Why npm does the upload: `bun publish` supports no OIDC, so it cannot use
 * npm trusted publishing. npm tokens are now capped at 90 days, which makes a
 * token-based release a recurring outage waiting to happen. `npm publish` reads
 * a token from .npmrc when one is present and falls back to OIDC when it is
 * not, so this works for both the bootstrap release and the token-free setup
 * that replaces it.
 *
 * Order is topological, not filesystem order: a package is only published once
 * everything it depends on is already on the registry. `better-cms` re-exports
 * all eight internals, so it goes last. Publishing it early puts a version on
 * npm whose own dependencies do not resolve yet, and npm versions are immutable
 * — that window cannot be taken back.
 *
 * Aborts on the first failure for the same reason. Continuing past a failed
 * publish is how you end up with a half-released version that installs and then
 * breaks; stopping early leaves a gap that a rerun can still fill, because
 * already-published versions are skipped.
 *
 * Skip packages whose current version is already on the registry, so a rerun
 * after a partial release resumes rather than throwing "version exists".
 *
 * `--dry-run` resolves the order and packs every package without uploading, so
 * it needs no credentials and CI can run it on every PR. Since packing is now
 * the same step the real publish uses, the dry run does exercise the
 * `workspace:*` rewrite.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface Pkg {
	dir: string;
	name: string;
	version: string;
	deps: string[];
}

const dryRun = process.argv.includes('--dry-run');

const root = resolve(import.meta.dir, '..');
const packagesDir = join(root, 'packages');

const packages: Pkg[] = [];
for (const dir of readdirSync(packagesDir)) {
	const pkgPath = join(packagesDir, dir, 'package.json');
	let json: {
		name: string;
		version: string;
		private?: boolean;
		dependencies?: Record<string, string>;
	};
	try {
		json = JSON.parse(readFileSync(pkgPath, 'utf8'));
	} catch {
		continue;
	}
	if (json.private === true) continue;
	packages.push({
		dir,
		name: json.name,
		version: json.version,
		deps: Object.keys(json.dependencies ?? {}),
	});
}

const byName = new Map(packages.map((p) => [p.name, p]));

/** Kahn's algorithm, ties broken by name so the order is reproducible. */
function topoSort(pkgs: Pkg[]): Pkg[] {
	const pending = new Map(
		pkgs.map((p) => [p.name, p.deps.filter((d) => byName.has(d) && d !== p.name)]),
	);
	const out: Pkg[] = [];

	while (pending.size > 0) {
		const ready = [...pending.entries()]
			.filter(([, deps]) => deps.every((d) => !pending.has(d)))
			.map(([name]) => name)
			.sort();

		if (ready.length === 0) {
			throw new Error(`dependency cycle among: ${[...pending.keys()].sort().join(', ')}`);
		}
		for (const name of ready) {
			out.push(byName.get(name)!);
			pending.delete(name);
		}
	}
	return out;
}

function onRegistry(name: string, version: string): boolean {
	const res = spawnSync(
		'curl',
		[
			'-s',
			'-o',
			'/dev/null',
			'-w',
			'%{http_code}',
			`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,
		],
		{ encoding: 'utf8' },
	);
	return res.stdout?.trim() === '200';
}

function packageExists(name: string): boolean {
	const res = spawnSync(
		'curl',
		[
			'-s',
			'-o',
			'/dev/null',
			'-w',
			'%{http_code}',
			`https://registry.npmjs.org/${encodeURIComponent(name)}`,
		],
		{ encoding: 'utf8' },
	);
	return res.stdout?.trim() === '200';
}

/**
 * Pack with bun, upload with npm. Packing into a fresh empty directory means we
 * can name the tarball by reading the directory rather than reconstructing npm's
 * scope-flattening filename rule.
 */
function packAndPublish(pkg: Pkg): { status: number | null } {
	const cwd = join(packagesDir, pkg.dir);
	const out = mkdtempSync(join(tmpdir(), 'bcms-pack-'));
	try {
		const packed = spawnSync('bun', ['pm', 'pack', '--destination', out], {
			cwd,
			stdio: ['inherit', 'ignore', 'inherit'],
		});
		if (packed.status !== 0) return packed;

		const tarball = readdirSync(out).find((f) => f.endsWith('.tgz'));
		if (!tarball) {
			console.error(`  no tarball produced for ${pkg.name}`);
			return { status: 1 };
		}

		// --access public is required for the first publish of a scoped package
		// and is a no-op afterwards.
		return spawnSync('npm', ['publish', join(out, tarball), '--access', 'public'], {
			cwd,
			stdio: 'inherit',
		});
	} finally {
		rmSync(out, { recursive: true, force: true });
	}
}

const order = topoSort(packages);

// Creating a scoped package for the first time needs broader credentials than
// publishing a new version of an existing one — a granular token scoped to the
// current package list is not enough. Surface that before anything is published
// rather than discovering it halfway through.
const brandNew = order.filter((p) => !packageExists(p.name));
if (brandNew.length > 0) {
	console.log(
		`\n⚠ first-time publish for ${brandNew.length} package(s): ${brandNew.map((p) => p.name).join(', ')}`,
	);
	console.log('  Creating a new scoped package requires the npm token to have org-level');
	console.log('  read/write on the better-cms org, not just per-package access.\n');
}

console.log(`publish order: ${order.map((p) => p.name).join(' → ')}\n`);
if (dryRun) console.log('DRY RUN — nothing will be published\n');

for (const [i, pkg] of order.entries()) {
	const step = `[${i + 1}/${order.length}]`;

	if (!dryRun && onRegistry(pkg.name, pkg.version)) {
		console.log(`${step} ✓ skip ${pkg.name}@${pkg.version} (already on registry)`);
		continue;
	}

	console.log(`${step} → ${dryRun ? 'packing' : 'publishing'} ${pkg.name}@${pkg.version}`);
	const res = dryRun
		? spawnSync('bun', ['pm', 'pack', '--dry-run'], {
				cwd: join(packagesDir, pkg.dir),
				stdio: ['inherit', 'ignore', 'inherit'],
			})
		: packAndPublish(pkg);

	if (res.status !== 0) {
		if (dryRun) {
			console.error(`\n✗ ${pkg.name}@${pkg.version} failed to pack`);
			process.exit(1);
		}
		console.error(`\n✗ ${pkg.name}@${pkg.version} failed — aborting before anything downstream.`);
		const done = order.slice(0, i).map((p) => p.name);
		if (done.length > 0) {
			console.error(`  already published this run: ${done.join(', ')}`);
			console.error('  fix the cause and rerun — published versions are skipped.');
		}
		if (brandNew.some((p) => p.name === pkg.name)) {
			console.error(`  ${pkg.name} is a first-time publish — check the token's org permissions.`);
		}
		process.exit(1);
	}
}

console.log(dryRun ? '\n✓ dry run clean — order and tarballs OK' : '\n✓ all packages published');
