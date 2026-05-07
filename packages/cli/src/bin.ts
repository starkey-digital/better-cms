#!/usr/bin/env bun
import { generate } from './generate.js';
import { genSecret, hashPasswordCli } from './hash-password.js';
import { init } from './init.js';
import { startMcpServer } from './mcp.js';

const args = process.argv.slice(2);
const cmd = args[0];

function flag(name: string): string | undefined {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
}

function bool(name: string): boolean {
	return args.includes(`--${name}`);
}

const HELP = `better-cms <command>

Commands:
  init                       Scaffold cms.config.ts and .env.example
  generate                   Emit drizzle schema file from cms.config.ts
  generate --target=types    Emit TypeScript interfaces for collections
  mcp                        Run MCP server (stdio) — for Claude Code / Desktop
  hash-password [pw]         PBKDF2 hash for CMS_PASSWORD_HASH (prompts if omitted)
  gen-secret [bytes]         Random hex secret for CMS_AUTH_SECRET (default 32 bytes)

Flags:
  --config <path>            Path to cms.config (default: auto-detected)
  --out <path>               Output file
  --force                    Overwrite existing files
`;

async function main() {
	try {
		switch (cmd) {
			case 'init': {
				const res = await init({ force: bool('force') });
				for (const p of res.written) console.log(`✓ wrote ${p}`);
				if (res.written.length === 0) console.log('nothing written');
				break;
			}
			case 'generate': {
				const target = flag('target') === 'types' ? 'types' : 'drizzle';
				const res = await generate({
					configPath: flag('config'),
					out: flag('out'),
					target,
				});
				console.log(`✓ wrote ${res.path}`);
				break;
			}
			case 'mcp': {
				await startMcpServer({ configPath: flag('config') });
				break;
			}
			case 'hash-password': {
				const hash = await hashPasswordCli(args[1]);
				console.log(hash);
				break;
			}
			case 'gen-secret': {
				const bytes = args[1] ? Number(args[1]) : 32;
				if (!Number.isFinite(bytes) || bytes < 16) throw new Error('bytes must be ≥16');
				console.log(genSecret(bytes));
				break;
			}
			default:
				console.log(HELP);
				if (cmd && cmd !== '--help' && cmd !== '-h') process.exit(1);
		}
	} catch (e) {
		console.error((e as Error).message);
		process.exit(1);
	}
}

void main();
