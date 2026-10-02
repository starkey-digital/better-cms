<script lang="ts">
import type { CmsMeta } from '@better-cms/sveltekit';
import { onMount } from 'svelte';
import './admin.css';
import './form.css';
import LoginScreen from './LoginScreen.svelte';
import MagicLinkScreen, { type MagicLinkOptions } from './MagicLinkScreen.svelte';
import Shell from './Shell.svelte';
import { parseRoute } from './route.js';

type AnyClient = {
	auth: {
		context(): Promise<unknown | null>;
		login(password: string, turnstileToken?: string): Promise<{ ok: true } | { error: string }>;
		logout(): Promise<void>;
	};
	meta(): Promise<CmsMeta>;
	uploadMedia(file: File | Blob, folder?: string): Promise<{ key: string; url: string }>;
	[k: string]: unknown;
};

type Props = {
	client: AnyClient;
	auth?: boolean;
	turnstileSiteKey?: string;
	/**
	 * Sign in with an emailed link via an external auth provider (better-auth's
	 * magic-link plugin by default) instead of the password form. `true` uses the
	 * defaults.
	 */
	magicLink?: boolean | MagicLinkOptions;
	/** Send signed-out visitors to this external sign-in page instead of the password form. */
	signInUrl?: string;
	/**
	 * POSTed on sign out, then the admin returns to its sign-in screen. Defaults to
	 * better-auth's `/api/auth/sign-out` when `magicLink` is set; otherwise the
	 * CMS's own `/logout` is used.
	 */
	signOutUrl?: string;
	/** Name shown at the top of the sidebar. */
	title?: string;
};

const {
	client,
	auth = false,
	turnstileSiteKey,
	magicLink = false,
	signInUrl,
	signOutUrl,
	title = 'better-cms',
}: Props = $props();

const magicOptions = $derived(typeof magicLink === 'object' ? magicLink : {});
const effectiveSignOutUrl = $derived(signOutUrl ?? (magicLink ? '/api/auth/sign-out' : undefined));

let ctx = $state<unknown | null>(null);
let authChecked = $state(false);
let meta = $state<CmsMeta | null>(null);
let hash = $state(typeof location === 'undefined' ? '' : location.hash);
let error = $state<string | null>(null);
let linkExpired = $state(false);
let notAllowed = $state(false);
const gateOpen = $derived(!auth || (authChecked && ctx !== null));

const route = $derived(parseRoute(hash, meta));

function navigate(path: string, replace = false) {
	if (typeof location === 'undefined') return;
	const h = `#/${path.replace(/^\/+/, '')}`;
	if (replace) {
		history.replaceState(null, '', `${location.pathname}${location.search}${h}`);
	} else {
		location.hash = h;
	}
	hash = h;
}

async function checkAuth() {
	const params = new URLSearchParams(location.search);
	linkExpired = params.has('error');
	const returnedFromLink = params.has('signed_in');
	try {
		ctx = await client.auth.context();
	} catch {
		ctx = null;
	} finally {
		authChecked = true;
	}
	notAllowed = returnedFromLink && ctx === null && !linkExpired;
	if (linkExpired || returnedFromLink) {
		params.delete('error');
		params.delete('signed_in');
		const query = params.size ? `?${params}` : '';
		history.replaceState(null, '', `${location.pathname}${query}${location.hash}`);
	}
}

async function loadMeta() {
	try {
		meta = await client.meta();
	} catch (e) {
		error = (e as Error).message;
	}
}

async function logout() {
	if (effectiveSignOutUrl) {
		await fetch(effectiveSignOutUrl, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});
	} else {
		await client.auth.logout();
	}
	ctx = null;
}

onMount(() => {
	const onHash = () => {
		hash = location.hash;
	};
	window.addEventListener('hashchange', onHash);
	void (async () => {
		await Promise.all([auth ? checkAuth() : Promise.resolve(), loadMeta()]);
		if (!location.hash && meta) {
			const first = Object.keys(meta.collections)[0];
			if (first) navigate(first, true);
		}
		hash = location.hash;
	})();
	return () => window.removeEventListener('hashchange', onHash);
});
</script>

{#if auth && !authChecked}
	<div class="bcms-loading">
		<div class="bcms-spinner" aria-hidden="true"></div>
	</div>
{:else if auth && !gateOpen && signInUrl}
	<div class="bcms bcms-login">
		<div class="bcms-login-card">
			<h1 class="bcms-login-title">Sign in</h1>
			<p class="bcms-login-sub">Sign in to manage this site.</p>
			<a class="bcms-btn bcms-btn-primary bcms-login-submit" href={signInUrl}>Sign in</a>
		</div>
	</div>
{:else if auth && !gateOpen && magicLink}
	<MagicLinkScreen options={magicOptions} expired={linkExpired} {notAllowed} />
{:else if auth && !gateOpen}
	<LoginScreen
		{client}
		{turnstileSiteKey}
		onlogin={() => {
			void (async () => {
				await checkAuth();
				if (!ctx) return;
				if (!meta) await loadMeta();
			})();
		}}
	/>
{:else if !meta}
	<div class="bcms-loading">
		<div class="bcms-spinner" aria-hidden="true"></div>
	</div>
{:else}
	<Shell
		{client}
		{meta}
		{route}
		{title}
		{error}
		canSignOut={auth && !!ctx}
		{navigate}
		onsignout={logout}
	/>
{/if}
