<script lang="ts">
import type { CmsMeta, CmsMetaCollection } from '@better-cms/sveltekit';
import { onMount } from 'svelte';
import EditView from './EditView.svelte';
import ListView from './ListView.svelte';
import LoginScreen from './LoginScreen.svelte';

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
};

const { client, auth = false, turnstileSiteKey }: Props = $props();

type Route =
	| { kind: 'home' }
	| { kind: 'list'; name: string }
	| { kind: 'new'; name: string }
	| { kind: 'edit'; name: string; id: string }
	| { kind: 'singleton'; name: string };

let ctx = $state<unknown | null>(null);
let authChecked = $state(false);
let meta = $state<CmsMeta | null>(null);
let hash = $state(typeof location === 'undefined' ? '' : location.hash);
let error = $state<string | null>(null);
const gateOpen = $derived(!auth || (authChecked && ctx !== null));

const route: Route = $derived.by(() => {
	if (!meta) return { kind: 'home' };
	const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
	const name = parts[0];
	if (!name) return { kind: 'home' };
	const def = meta.collections[name];
	if (!def) return { kind: 'home' };
	if (def.kind === 'singleton') return { kind: 'singleton', name };
	if (parts.length === 1) return { kind: 'list', name };
	if (parts[1] === 'new') return { kind: 'new', name };
	return { kind: 'edit', name, id: parts[1]! };
});

const entries = $derived(meta ? Object.entries(meta.collections) : []);
const activeName = $derived(route.kind === 'home' ? null : route.name);

function navigate(path: string, replace = false) {
	if (typeof location === 'undefined') return;
	const h = `#/${path.replace(/^\/+/, '')}`;
	if (replace) {
		history.replaceState(null, '', `${location.pathname}${location.search}${h}`);
		hash = h;
	} else {
		location.hash = h;
	}
}

async function checkAuth() {
	try {
		ctx = await client.auth.context();
	} catch {
		ctx = null;
	} finally {
		authChecked = true;
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
	await client.auth.logout();
	ctx = null;
}

function selectFromSidebar(name: string) {
	navigate(name);
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
{:else if auth && !gateOpen}
	<LoginScreen
		{client}
		{turnstileSiteKey}
		onLogin={() => {
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
	<div class="bcms bcms-shell">
		<aside class="bcms-sidebar">
			<h1 class="bcms-brand">
				<span class="bcms-brand-dot" aria-hidden="true"></span>
				<span class="bcms-brand-name">better-cms</span>
			</h1>

			<nav>
				{#each entries as [name, def] (name)}
					{@const d = def as CmsMetaCollection}
					<button
						type="button"
						class:active={activeName === name}
						onclick={() => selectFromSidebar(name)}
					>
						<span class="bcms-nav-name">{name}</span>
						<small>{d.kind === 'singleton' ? 'single' : 'list'}</small>
					</button>
				{/each}
			</nav>

			<div class="bcms-sidebar-footer">
				{#if auth && ctx}
					<button type="button" class="bcms-logout" onclick={logout}>sign out</button>
				{/if}
			</div>
		</aside>

		<main class="bcms-main">
			{#if error}<div class="bcms-error">{error}</div>{/if}

			{#if route.kind === 'home'}
				<div class="bcms-empty">
					<h2>No collections</h2>
					<p>Define a collection in your CMS config to get started.</p>
				</div>
			{:else if route.kind === 'list'}
				{@const def = meta.collections[route.name]}
				{#if def}
					<ListView
						{client}
						name={route.name}
						{def}
						onnew={() => navigate(`${route.name}/new`)}
						onpick={(id) => navigate(`${route.name}/${encodeURIComponent(id)}`)}
					/>
				{/if}
			{:else if route.kind === 'new'}
				{@const def = meta.collections[route.name]}
				{#if def}
					<EditView
						{client}
						name={route.name}
						{def}
						mode="new"
						onback={() => navigate(route.name)}
						onsaved={(id) =>
							navigate(`${route.name}/${encodeURIComponent(id)}`, true)}
						ondeleted={() => navigate(route.name)}
					/>
				{/if}
			{:else if route.kind === 'edit'}
				{@const def = meta.collections[route.name]}
				{#if def}
					<EditView
						{client}
						name={route.name}
						id={route.id}
						{def}
						mode="edit"
						onback={() => navigate(route.name)}
						onsaved={() => {}}
						ondeleted={() => navigate(route.name)}
					/>
				{/if}
			{:else if route.kind === 'singleton'}
				{@const def = meta.collections[route.name]}
				{#if def}
					<EditView
						{client}
						name={route.name}
						{def}
						mode="singleton"
						onback={() => {}}
						onsaved={() => {}}
						ondeleted={() => {}}
					/>
				{/if}
			{/if}
		</main>
	</div>
{/if}

<style>
	:global(.bcms) {
		/* Typography */
		--bcms-font:
			'InterVariable', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto,
			'Helvetica Neue', sans-serif;
		--bcms-font-mono:
			ui-monospace, SFMono-Regular, 'JetBrains Mono', 'Menlo', 'Consolas', monospace;
		--bcms-text-xs: 0.75rem;
		--bcms-text-sm: 0.8125rem;
		--bcms-text-base: 0.9375rem;
		--bcms-text-md: 1rem;
		--bcms-text-lg: 1.125rem;
		--bcms-text-xl: 1.375rem;
		--bcms-text-2xl: 1.625rem;

		/* Color tokens */
		--bcms-bg: #fafafa;
		--bcms-surface: #ffffff;
		--bcms-fg: #0f172a;
		--bcms-fg-soft: #334155;
		--bcms-muted: #64748b;
		--bcms-subtle: #f1f5f9;
		--bcms-border: #e2e8f0;
		--bcms-border-strong: #cbd5e1;

		--bcms-primary: #0f172a;
		--bcms-primary-fg: #ffffff;
		--bcms-primary-hover: #1e293b;

		--bcms-accent: #6366f1;
		--bcms-accent-fg: #ffffff;

		--bcms-success: #16a34a;
		--bcms-success-soft: #dcfce7;
		--bcms-success-fg: #14532d;

		--bcms-warning: #d97706;
		--bcms-warning-soft: #fef3c7;
		--bcms-warning-fg: #78350f;

		--bcms-danger: #dc2626;
		--bcms-danger-soft: #fee2e2;
		--bcms-danger-fg: #7f1d1d;

		--bcms-ring: #6366f1;

		/* Geometry */
		--bcms-radius-sm: 6px;
		--bcms-radius: 8px;
		--bcms-radius-md: 10px;
		--bcms-radius-lg: 14px;

		/* Shadows */
		--bcms-shadow-sm: 0 1px 2px 0 rgb(15 23 42 / 0.05);
		--bcms-shadow:
			0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.06);
		--bcms-shadow-lg:
			0 10px 25px -5px rgb(15 23 42 / 0.08), 0 8px 10px -6px rgb(15 23 42 / 0.04);

		/* Layout */
		--bcms-sidebar-w: 248px;

		background-color: var(--bcms-bg);
		color: var(--bcms-fg);
		font-family: var(--bcms-font);
		font-size: var(--bcms-text-base);
		line-height: 1.5;
		-webkit-font-smoothing: antialiased;
	}

	:global(.bcms-shell) {
		display: grid;
		grid-template-columns: var(--bcms-sidebar-w) 1fr;
		min-height: 100vh;
	}

	:global(.bcms *),
	:global(.bcms *::before),
	:global(.bcms *::after) {
		box-sizing: border-box;
	}

	:global(.bcms-loading) {
		display: grid;
		place-items: center;
		min-height: 100vh;
		background-color: var(--bcms-bg, #fafafa);
	}
	:global(.bcms-spinner) {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid var(--bcms-border, #e2e8f0);
		border-top-color: var(--bcms-primary, #0f172a);
		animation: bcms-spin 0.6s linear infinite;
	}
	@keyframes bcms-spin {
		to {
			transform: rotate(1turn);
		}
	}

	:global(.bcms-sidebar) {
		display: flex;
		flex-direction: column;
		background-color: var(--bcms-surface);
		border-right: 1px solid var(--bcms-border);
		padding: 20px 14px;
		gap: 18px;
		position: sticky;
		top: 0;
		height: 100vh;
	}

	:global(.bcms-brand) {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 8px 14px;
		border-bottom: 1px solid var(--bcms-border);
		margin: 0;
		font-size: var(--bcms-text-sm);
		font-weight: 600;
	}
	:global(.bcms-brand-dot) {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--bcms-accent), var(--bcms-primary));
	}
	:global(.bcms-brand-name) {
		font-size: var(--bcms-text-sm);
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--bcms-fg);
	}

	:global(.bcms-sidebar nav) {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		overflow-y: auto;
	}
	:global(.bcms-sidebar nav button) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 10px;
		background: transparent;
		border: 0;
		border-radius: var(--bcms-radius-sm);
		text-align: left;
		cursor: pointer;
		font: inherit;
		font-size: var(--bcms-text-sm);
		color: var(--bcms-fg-soft);
		transition:
			background 120ms ease,
			color 120ms ease;
	}
	:global(.bcms-sidebar nav button:hover) {
		background-color: var(--bcms-subtle);
		color: var(--bcms-fg);
	}
	:global(.bcms-sidebar nav button.active) {
		background-color: var(--bcms-primary);
		color: var(--bcms-primary-fg);
	}
	:global(.bcms-sidebar nav button.active small) {
		color: var(--bcms-primary-fg);
		opacity: 0.7;
	}
	:global(.bcms-nav-name) {
		font-weight: 500;
		text-transform: capitalize;
	}
	:global(.bcms-sidebar nav small) {
		font-size: 0.6875rem;
		color: var(--bcms-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	:global(.bcms-sidebar-footer) {
		padding-top: 12px;
		border-top: 1px solid var(--bcms-border);
	}
	:global(.bcms-logout) {
		display: block;
		width: 100%;
		padding: 7px 10px;
		background: transparent;
		color: var(--bcms-muted);
		border: 1px solid var(--bcms-border);
		border-radius: var(--bcms-radius-sm);
		text-align: left;
		cursor: pointer;
		font: inherit;
		font-size: var(--bcms-text-sm);
		transition: background-color 120ms ease;
	}
	:global(.bcms-logout:hover) {
		background-color: var(--bcms-subtle);
		color: var(--bcms-fg);
	}

	:global(.bcms-main) {
		padding: 28px 36px 56px;
		overflow: auto;
		max-width: 1200px;
		width: 100%;
	}

	:global(.bcms-empty) {
		text-align: center;
		padding: 64px 16px;
		color: var(--bcms-muted);
	}
	:global(.bcms-empty h2) {
		margin: 0 0 6px;
		font-size: var(--bcms-text-lg);
		color: var(--bcms-fg);
	}
	:global(.bcms-empty p) {
		margin: 0;
		font-size: var(--bcms-text-sm);
	}

	:global(.bcms-error) {
		background-color: var(--bcms-danger-soft);
		color: var(--bcms-danger-fg);
		padding: 10px 14px;
		border: 1px solid color-mix(in oklab, var(--bcms-danger) 30%, transparent);
		border-radius: var(--bcms-radius);
		margin-bottom: 16px;
		font-size: var(--bcms-text-sm);
	}

	@media (max-width: 720px) {
		:global(.bcms-shell) {
			grid-template-columns: 1fr;
		}
		:global(.bcms-sidebar) {
			height: auto;
			position: static;
			border-right: 0;
			border-bottom: 1px solid var(--bcms-border);
		}
		:global(.bcms-sidebar nav) {
			flex-direction: row;
			flex-wrap: wrap;
		}
		:global(.bcms-main) {
			padding: 20px;
		}
	}
</style>
