<script lang="ts">
import type { CmsMeta, CmsMetaCollection } from '@better-cms/sveltekit';
import { onMount } from 'svelte';
import FieldEditor from './FieldEditor.svelte';
import LoginScreen from './LoginScreen.svelte';

// Loose client shape — admin doesn't care about typed collections, just
// dispatches by name through the runtime Proxy. Caller passes a typed
// `CmsClient<C, Ctx>`; TS accepts it as a subtype of this.
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

let ctx = $state<unknown | null>(null);
let authChecked = $state(false);
let meta = $state<CmsMeta | null>(null);
const gateOpen = $derived(!auth || (authChecked && ctx !== null));

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
	rows = [];
	editing = null;
}

const entries = $derived(meta ? Object.entries(meta.collections) : []);
const firstName = $derived(entries[0]?.[0] ?? null);
let selectedName = $state<string | null>(null);
const effectiveName = $derived(selectedName ?? firstName);
const selectedDef = $derived<CmsMetaCollection | null>(
	effectiveName && meta ? (meta.collections[effectiveName] ?? null) : null,
);
const selectedKind = $derived(selectedDef?.kind ?? null);

let rows = $state<Record<string, unknown>[]>([]);
let editing = $state<Record<string, unknown> | null>(null);
let saving = $state(false);
let error = $state<string | null>(null);

onMount(() => {
	void (async () => {
		// /auth/context and /_meta are independent — fetch in parallel.
		await Promise.all([auth ? checkAuth() : Promise.resolve(), loadMeta()]);
		if (auth && !ctx) return;
		if (effectiveName && selectedDef) await load(effectiveName, selectedDef.kind);
	})();
});

function select(name: string, def: CmsMetaCollection) {
	if (selectedName === name) return;
	selectedName = name;
	void load(name, def.kind);
}

// Type-erased view of the cmsClient's per-collection/singleton API. The
// runtime Proxy always exposes both shapes; the kind discriminator decides
// which methods are valid to call.
type ApiMethods = {
	get(idOrSlug?: string): Promise<Record<string, unknown> | null>;
	list(opts?: { limit?: number }): Promise<Record<string, unknown>[]>;
	set(data: Record<string, unknown>): Promise<Record<string, unknown>>;
	create(data: Record<string, unknown>): Promise<Record<string, unknown>>;
	update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
	delete(id: string): Promise<void>;
};

const apiOf = (name: string) => client[name] as unknown as ApiMethods;

async function load(name: string, kind: 'collection' | 'singleton') {
	error = null;
	editing = null;
	try {
		const api = apiOf(name);
		if (kind === 'singleton') {
			rows = [];
			editing = (await api.get()) ?? {};
		} else {
			rows = await api.list({ limit: 50 });
		}
	} catch (e) {
		error = (e as Error).message;
	}
}

function newRecord() {
	if (!selectedDef) return;
	editing = {};
}

function pick(row: Record<string, unknown>) {
	editing = { ...row };
}

async function save() {
	if (!effectiveName || !selectedDef || !editing) return;
	saving = true;
	error = null;
	try {
		const api = apiOf(effectiveName);
		if (selectedDef.kind === 'singleton') {
			await api.set(editing);
		} else if (typeof editing.id === 'string') {
			await api.update(editing.id, editing);
		} else {
			editing = await api.create(editing);
		}
		await load(effectiveName, selectedDef.kind);
	} catch (e) {
		error = (e as Error).message;
	} finally {
		saving = false;
	}
}

async function remove() {
	if (!effectiveName || !selectedDef || !editing || typeof editing.id !== 'string') return;
	if (selectedDef.kind === 'singleton') return;
	saving = true;
	try {
		await apiOf(effectiveName).delete(editing.id);
		editing = null;
		await load(effectiveName, selectedDef.kind);
	} catch (e) {
		error = (e as Error).message;
	} finally {
		saving = false;
	}
}

function setField(name: string, value: unknown) {
	if (!editing) return;
	editing = { ...editing, [name]: value };
}
</script>

{#if auth && !authChecked}
	<div class="bcms-loading">loading…</div>
{:else if auth && !gateOpen}
	<LoginScreen
		{client}
		{turnstileSiteKey}
		onLogin={() => {
			void (async () => {
				await checkAuth();
				if (!ctx) return;
				if (!meta) await loadMeta();
				if (effectiveName && selectedDef) await load(effectiveName, selectedDef.kind);
			})();
		}}
	/>
{:else if !meta}
	<div class="bcms-loading">loading…</div>
{:else}
<div class="bcms">
	<aside class="bcms-sidebar">
		<h1>better-cms</h1>
		{#if auth && ctx}
			<button type="button" class="bcms-logout" onclick={logout}>sign out</button>
		{/if}
		<nav>
			{#each entries as [name, def] (name)}
				{@const d = def as CmsMetaCollection}
				<button
					type="button"
					class:active={effectiveName === name}
					onclick={() => select(name, d)}
				>
					<span>{name}</span>
					<small>{d.kind}</small>
				</button>
			{/each}
		</nav>
	</aside>

	<main class="bcms-main">
		{#if error}<div class="bcms-error">{error}</div>{/if}

		{#if selectedName && selectedDef}
			<header>
				<h2>{selectedName}</h2>
				{#if selectedKind === 'collection'}
					<button type="button" onclick={newRecord}>+ new</button>
				{/if}
			</header>

			{#if selectedKind === 'collection'}
				<div class="bcms-list">
					{#each rows as row (row.id)}
						{@const r = row as { id?: string; title?: string; name?: string; slug?: string }}
						<button type="button" onclick={() => pick(row)} class="bcms-row">
							<strong>{r.title ?? r.name ?? r.slug ?? r.id}</strong>
							<small>{r.id}</small>
						</button>
					{:else}
						<p>no records</p>
					{/each}
				</div>
			{/if}

			{#if editing && selectedDef}
				<form
					class="bcms-form"
					onsubmit={(e) => {
						e.preventDefault();
						void save();
					}}
				>
					{#each Object.entries(selectedDef.fields) as [fname, field] (fname)}
						{#if fname !== 'id' && fname !== 'createdAt' && fname !== 'updatedAt'}
							<FieldEditor
								{client}
								name={fname}
								{field}
								value={editing[fname]}
								onchange={(v) => setField(fname, v)}
							/>
						{/if}
					{/each}
					<footer>
						<button type="submit" disabled={saving}>{saving ? 'saving…' : 'save'}</button>
						{#if selectedKind === 'collection' && typeof editing.id === 'string'}
							<button type="button" onclick={remove} disabled={saving} class="bcms-danger">
								delete
							</button>
						{/if}
					</footer>
				</form>
			{/if}
		{:else}
			<p>select a collection</p>
		{/if}
	</main>
</div>
{/if}

<style>
	.bcms-loading {
		display: grid;
		place-items: center;
		min-height: 100vh;
		color: #71717a;
		font-family: system-ui, -apple-system, sans-serif;
	}
	.bcms-logout {
		display: block;
		width: 100%;
		margin-bottom: 0.75rem;
		padding: 0.375rem 0.625rem;
		background: transparent;
		color: #71717a;
		border: 1px solid #e4e4e7;
		border-radius: 6px;
		text-align: left;
		cursor: pointer;
		font: inherit;
		font-size: 0.8125rem;
	}
	.bcms-logout:hover {
		background: #f4f4f5;
	}
	.bcms {
		display: grid;
		grid-template-columns: 240px 1fr;
		min-height: 100vh;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}
	.bcms-sidebar {
		background: #fafafa;
		border-right: 1px solid #e4e4e7;
		padding: 1rem;
	}
	.bcms-sidebar h1 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #71717a;
		margin: 0 0 1rem;
	}
	.bcms-sidebar nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.bcms-sidebar button {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 0.5rem 0.625rem;
		background: transparent;
		border: 0;
		border-radius: 6px;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}
	.bcms-sidebar button:hover {
		background: #f4f4f5;
	}
	.bcms-sidebar button.active {
		background: #18181b;
		color: #fafafa;
	}
	.bcms-sidebar small {
		color: #a1a1aa;
		font-size: 0.6875rem;
	}
	.bcms-main {
		padding: 1.5rem 2rem;
		overflow: auto;
	}
	.bcms-main header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 1rem;
	}
	.bcms-main h2 {
		margin: 0;
		font-size: 1.5rem;
	}
	.bcms-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 1.5rem;
	}
	.bcms-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 0.625rem 0.75rem;
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 6px;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}
	.bcms-row:hover {
		border-color: #18181b;
	}
	.bcms-row small {
		color: #a1a1aa;
		font-size: 0.75rem;
	}
	.bcms-form {
		max-width: 720px;
		background: #fff;
		border: 1px solid #e4e4e7;
		border-radius: 8px;
		padding: 1.25rem 1.5rem;
	}
	.bcms-form footer {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid #e4e4e7;
	}
	.bcms-form button {
		padding: 0.5rem 1rem;
		background: #18181b;
		color: #fafafa;
		border: 0;
		border-radius: 6px;
		cursor: pointer;
		font: inherit;
	}
	.bcms-form button:disabled {
		opacity: 0.5;
		cursor: wait;
	}
	.bcms-danger {
		background: #b91c1c !important;
	}
	.bcms-error {
		background: #fef2f2;
		color: #991b1b;
		padding: 0.75rem 1rem;
		border-radius: 6px;
		margin-bottom: 1rem;
	}
</style>
