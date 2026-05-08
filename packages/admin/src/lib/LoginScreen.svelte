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

<div class="bcms bcms-login">
	<form onsubmit={submit}>
		<h1 class="bcms-login-brand">
			<span class="bcms-brand-dot" aria-hidden="true"></span>
			<span class="bcms-login-title">better-cms</span>
		</h1>
		<p class="bcms-login-sub">Sign in to manage content</p>

		<label class="bcms-field">
			<span class="bcms-label">Password</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="bcms-input"
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

		<button
			type="submit"
			class="bcms-btn bcms-btn-primary bcms-login-submit"
			disabled={submitting || !password}
		>
			{submitting ? 'Signing in…' : 'Sign in'}
		</button>
	</form>
</div>

<style>
	:global(.bcms-login) {
		display: grid;
		place-items: center;
		min-height: 100vh;
		background: var(--bcms-bg);
		grid-template-columns: 1fr;
		padding: 16px;
	}
	:global(.bcms-login form) {
		background: var(--bcms-surface);
		border: 1px solid var(--bcms-border);
		border-radius: var(--bcms-radius-lg);
		padding: 32px;
		width: min(380px, 100%);
		display: flex;
		flex-direction: column;
		gap: 14px;
		box-shadow: var(--bcms-shadow-lg);
	}
	:global(.bcms-login-brand) {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		font-size: var(--bcms-text-lg);
		font-weight: 600;
	}
	:global(.bcms-login-title) {
		font-size: var(--bcms-text-lg);
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	:global(.bcms-login-sub) {
		margin: -6px 0 6px;
		font-size: var(--bcms-text-sm);
		color: var(--bcms-muted);
	}
	:global(.bcms-login-submit) {
		justify-content: center;
		padding: 11px 14px;
	}
	:global(.bcms-login-error) {
		margin: 0;
		padding: 9px 12px;
		background: var(--bcms-danger-soft);
		color: var(--bcms-danger-fg);
		border-radius: var(--bcms-radius-sm);
		font-size: var(--bcms-text-sm);
		border: 1px solid color-mix(in oklab, var(--bcms-danger) 25%, transparent);
	}
</style>
