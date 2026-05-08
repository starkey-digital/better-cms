<script lang="ts">
import { onMount } from 'svelte';

type Props = {
	client: {
		auth: {
			login(password: string, turnstileToken?: string): Promise<{ ok: true } | { error: string }>;
		};
	};
	turnstileSiteKey?: string;
	onLogin: () => void;
};

const { client, turnstileSiteKey, onLogin }: Props = $props();

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
let scriptLoaded = false;

function loadTurnstile() {
	if (scriptLoaded || typeof document === 'undefined') return;
	if (document.querySelector(`script[src="${TURNSTILE_SRC}"]`)) {
		scriptLoaded = true;
		return;
	}
	const s = document.createElement('script');
	s.src = TURNSTILE_SRC;
	s.async = true;
	s.defer = true;
	document.head.appendChild(s);
	scriptLoaded = true;
}

onMount(() => {
	if (turnstileSiteKey) loadTurnstile();
});

let password = $state('');
let submitting = $state(false);
let error = $state<string | null>(null);
let needsTurnstile = $state(false);

async function submit(e: SubmitEvent) {
	e.preventDefault();
	if (!password) return;
	const form = e.currentTarget as HTMLFormElement;
	const fd = new FormData(form);
	const turnstileToken = (fd.get('cf-turnstile-response') as string | null) ?? undefined;
	submitting = true;
	error = null;
	try {
		const res = await client.auth.login(password, turnstileToken);
		if ('ok' in res) {
			password = '';
			onLogin();
			return;
		}
		error = res.error;
		if (/turnstile/i.test(res.error)) needsTurnstile = true;
	} catch (e) {
		error = (e as Error).message;
	} finally {
		submitting = false;
	}
}
</script>

<div class="bcms-login">
	<form onsubmit={submit}>
		<h1>better-cms</h1>
		<label>
			<span>Password</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="password"
				bind:value={password}
				autocomplete="current-password"
				autofocus
				disabled={submitting}
				required
			/>
		</label>

		{#if needsTurnstile && turnstileSiteKey}
			<div class="cf-turnstile" data-sitekey={turnstileSiteKey}></div>
		{/if}

		{#if error}<p class="bcms-login-error">{error}</p>{/if}

		<button type="submit" disabled={submitting || !password}>
			{submitting ? 'signing in…' : 'sign in'}
		</button>
	</form>
</div>

<style>
	.bcms-login {
		display: grid;
		place-items: center;
		min-height: 100vh;
		background: #fafafa;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}
	form {
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 10px;
		padding: 2rem;
		width: min(360px, 90vw);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	h1 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #71717a;
		margin: 0;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	label span {
		font-size: 0.875rem;
		color: #3f3f46;
	}
	input {
		padding: 0.625rem 0.75rem;
		border: 1px solid #e4e4e7;
		border-radius: 6px;
		font: inherit;
	}
	input:focus {
		outline: 2px solid #18181b;
		outline-offset: -1px;
	}
	button {
		padding: 0.625rem 1rem;
		background: #18181b;
		color: #fafafa;
		border: 0;
		border-radius: 6px;
		cursor: pointer;
		font: inherit;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.bcms-login-error {
		margin: 0;
		padding: 0.625rem 0.75rem;
		background: #fef2f2;
		color: #991b1b;
		border-radius: 6px;
		font-size: 0.875rem;
	}
</style>
