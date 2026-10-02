<script lang="ts" module>
export type MagicLinkOptions = {
	/** better-auth's magic-link route. Default `/api/auth/sign-in/magic-link`. */
	endpoint?: string;
	/** Where the link lands after sign-in. Default: this page. */
	callbackURL?: string;
	/** Shown in the "check your email" message. Match your `expiresIn`. Default 30. */
	expiresInMinutes?: number;
};

export const DEFAULT_MAGIC_LINK_ENDPOINT = '/api/auth/sign-in/magic-link';
</script>

<script lang="ts">
type Props = {
	options?: MagicLinkOptions;
	/** The link was used or opened too late (better-auth sends `?error=`). */
	expired?: boolean;
	/** They signed in, but their address is not allowed to edit. */
	notAllowed?: boolean;
	/** Name shown above the form. */
	title?: string;
};

const { options = {}, expired = false, notAllowed = false, title = 'better-cms' }: Props = $props();

const minutes = $derived(options.expiresInMinutes ?? 30);

let email = $state('');
let sentTo = $state<string | null>(null);
let submitting = $state(false);
let error = $state<string | null>(null);

const message = $derived(
	error ??
		(expired
			? 'That sign-in link has expired or has already been used. Enter your email to get a new one.'
			: null),
);

async function send(e?: SubmitEvent) {
	e?.preventDefault();
	const address = email.trim();
	if (!address || submitting) return;
	submitting = true;
	error = null;
	try {
		const res = await fetch(options.endpoint ?? DEFAULT_MAGIC_LINK_ENDPOINT, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				email: address,
				callbackURL:
					options.callbackURL ?? `${location.pathname}${location.search ? `${location.search}&` : '?'}signed_in=1`,
			}),
		});
		if (res.status === 429) {
			error = 'Too many tries. Please wait a minute and try again.';
		} else if (!res.ok) {
			error = "We couldn't send a link to that address. Check it's spelled correctly and try again.";
		} else {
			sentTo = address;
		}
	} catch {
		error = "We couldn't reach the server. Check your internet connection and try again.";
	} finally {
		submitting = false;
	}
}

function changeEmail() {
	sentTo = null;
	error = null;
}
</script>

<div class="bcms bcms-login">
	{#if sentTo}
		<div class="bcms-login-card" role="status">
			<p class="bcms-login-brand">
				<span class="bcms-login-title">{title}</span>
			</p>
			<h1 class="bcms-login-heading" tabindex="-1" {@attach (el) => el.focus()}>Check your email</h1>
			<p class="bcms-login-text">
				We've sent a link to <strong class="bcms-login-email">{sentTo}</strong>. It works for {minutes}
				minutes. Open it on this device to sign in.
			</p>
			<p class="bcms-login-sub">Can't see it? Look in your spam or junk folder.</p>
			<div class="bcms-login-actions">
				<button type="button" class="bcms-btn" onclick={() => send()} disabled={submitting}>
					{submitting ? 'Sending…' : 'Send it again'}
				</button>
				<button type="button" class="bcms-btn" onclick={changeEmail}>Use a different email</button>
			</div>
			{#if error}<p class="bcms-login-error" role="alert">{error}</p>{/if}
		</div>
	{:else}
		<form class="bcms-login-card" onsubmit={send}>
			<p class="bcms-login-brand">
				<span class="bcms-login-title">{title}</span>
			</p>
			<h1 class="bcms-login-heading">Sign in</h1>
			<p class="bcms-login-sub">We'll email you a link. There's no password to remember.</p>

			{#if notAllowed}
				<p class="bcms-login-error" role="alert">
					You're signed in, but this email address isn't set up to edit this site. Ask the site owner to
					add it, or try a different email.
				</p>
			{/if}

			<label class="bcms-field">
				<span class="bcms-label">Your email address</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="bcms-input"
					type="email"
					name="email"
					bind:value={email}
					autocomplete="email"
					autofocus
					required
					disabled={submitting}
					aria-invalid={message ? 'true' : undefined}
					aria-describedby={message ? 'bcms-magic-error' : undefined}
				/>
			</label>

			{#if message}<p id="bcms-magic-error" class="bcms-login-error" role="alert">{message}</p>{/if}

			<button
				type="submit"
				class="bcms-btn bcms-btn-primary bcms-login-submit"
				disabled={submitting || !email.trim()}
			>
				{submitting ? 'Sending…' : 'Email me a sign-in link'}
			</button>
		</form>
	{/if}
</div>

<style>
	:global(.bcms-login-card) {
		background-color: var(--bcms-surface);
		border: 1px solid var(--bcms-border);
		border-radius: var(--bcms-radius-lg);
		padding: 32px;
		width: min(420px, 100%);
		display: flex;
		flex-direction: column;
		gap: 14px;
		box-shadow: var(--bcms-shadow-lg);
	}
	:global(.bcms-login-card .bcms-login-heading) {
		margin: 0;
		outline: none;
		font-size: var(--bcms-text-lg);
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	:global(.bcms-login-text) {
		margin: 0;
		font-size: var(--bcms-text-base, 1rem);
		line-height: 1.5;
	}
	:global(.bcms-login-email) {
		overflow-wrap: anywhere;
	}
	:global(.bcms-login-actions) {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
