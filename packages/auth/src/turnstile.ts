export interface TurnstileOpts {
	siteKey: string;
	secret: string;
	after?: number;
	endpoint?: string;
}

export interface TurnstileVerifyResult {
	success: boolean;
	errorCodes?: string[];
}

const DEFAULT_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
	token: string | undefined | null,
	opts: TurnstileOpts,
	remoteIp?: string,
): Promise<TurnstileVerifyResult> {
	if (!token) return { success: false, errorCodes: ['missing-input-response'] };
	const body = new URLSearchParams({ secret: opts.secret, response: token });
	if (remoteIp) body.set('remoteip', remoteIp);
	const res = await fetch(opts.endpoint ?? DEFAULT_ENDPOINT, {
		method: 'POST',
		body,
	});
	if (!res.ok) return { success: false, errorCodes: [`http-${res.status}`] };
	const json = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
	return { success: json.success, errorCodes: json['error-codes'] };
}
