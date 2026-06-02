import { pbkdf2 as pbkdf2Cb, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2 = promisify(pbkdf2Cb);

const PBKDF2_ITER = 100_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_SALTLEN = 16;

const CTRL_C = '';
const CTRL_D = '';
const BACKSPACE = '';
const BS = '';

function b64url(buf: Buffer): string {
	return buf.toString('base64url');
}

export async function hashPasswordCli(input?: string): Promise<string> {
	const password = input ?? (await prompt('Password: '));
	if (!password || password.length < 8) {
		throw new Error('password must be ≥8 characters');
	}
	const salt = randomBytes(PBKDF2_SALTLEN);
	const hash = await pbkdf2(password, salt, PBKDF2_ITER, PBKDF2_KEYLEN, 'sha256');
	return `pbkdf2$sha256$${PBKDF2_ITER}$${b64url(salt)}$${b64url(hash)}`;
}

export function genSecret(bytes = 32): string {
	return randomBytes(bytes).toString('hex');
}

function prompt(question: string): Promise<string> {
	return new Promise((resolve) => {
		const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
		const out = process.stdout;
		out.write(question);
		let buf = '';
		const finish = (): void => {
			stdin.removeListener('data', onData);
			stdin.setRawMode?.(false);
			stdin.pause();
			out.write('\n');
		};
		const onData = (ch: Buffer): void => {
			const c = ch.toString();
			if (c === '\n' || c === '\r' || c === CTRL_D) {
				finish();
				resolve(buf);
			} else if (c === CTRL_C) {
				finish();
				process.exit(130);
			} else if (c === BACKSPACE || c === BS) {
				buf = buf.slice(0, -1);
			} else {
				buf += c;
			}
		};
		stdin.setRawMode?.(true);
		stdin.resume();
		stdin.on('data', onData);
	});
}
