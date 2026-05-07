<script lang="ts">
import type { CMSOp, CollectionDef } from '@better-cms/core';
import type { ClientCMSConfig } from '@better-cms/core';
import { onMount } from 'svelte';
import FieldEditor from './FieldEditor.svelte';
import LoginScreen from './LoginScreen.svelte';
import { type AdminApi, httpApi } from './api.js';

type Props = {
	config: ClientCMSConfig;
	api?: AdminApi;
	auth?: boolean;
	turnstileSiteKey?: string;
};

const {
	config,
	api = httpApi(config.basePath ?? '/api/cms'),
	auth = false,
	turnstileSiteKey,
}: Props = $props();

let user = $state<{ id: string; role: string } | null>(null);
let authChecked = $state(false);
const gateOpen = $derived(!auth || (authChecked && user !== null));

async function checkAuth() {
	try {
		user = await api.me();
	} catch {
		user = null;
	} finally {
		authChecked = true;
	}
}

async function logout() {
	await api.logout();
	user = null;
	rows = [];
	editing = null;
}

const entries = $derived(Object.entries(config.collections));
const firstName = $derived(entries[0]?.[0] ?? null);
let selectedName = $state<string | null>(null);
const effectiveName = $derived(selectedName ?? firstName);
const selectedDef = $derived(effectiveName ? config.collections[effectiveName] : null);
const selectedKind = $derived(selectedDef?.kind ?? null);

let rows = $state<Record<string, unknown>[]>([]);
let editing = $state<Record<string, unknown> | null>(null);
let saving = $state(false);
let error = $state<string | null>(null);

onMount(() => {
	if (auth) {
		void checkAuth().then(() => {
			if (user && effectiveName && selectedDef) void load(effectiveName, selectedDef.kind);
		});
	} else if (effectiveName && selectedDef) {
		void load(effectiveName, selectedDef.kind);
	}
});

function select(name: string, def: CollectionDef) {
	if (selectedName === name) return;
	selectedName = name;
	void load(name, def.kind);
}

async function load(name: string, kind: 'collection' | 'singleton') {
	error = null;
	editing = null;
	try {
		if (kind === 'singleton') {
			rows = [];
			const row = await api.getSingleton(name);
			editing = row ?? {};
		} else {
			rows = await api.list(name, { limit: 50 });
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
		if (selectedDef.kind === 'singleton') {
			await api.saveSingleton(effectiveName, editing);
		} else {
			const op: CMSOp =
				typeof editing.id === 'string'
					? { op: 'set', collection: effectiveName, id: editing.id, data: editing }
					: { op: 'create', collection: effectiveName, data: editing };
			const [res] = await api.runOps([op]);
			if (!res?.ok) throw new Error(res?.error ?? 'save failed');
			editing = res.row ?? null;
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
		await api.runOps([{ op: 'remove', collection: effectiveName, id: editing.id }]);
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
		{api}
		{turnstileSiteKey}
		onLogin={() => {
			void checkAuth().then(() => {
				if (effectiveName && selectedDef) void load(effectiveName, selectedDef.kind);
			});
		}}
	/>
{:else}
<div class="bcms">
	<aside class="bcms-sidebar">
		<h1>better-cms</h1>
		{#if auth && user}
			<button type="button" class="bcms-logout" onclick={logout}>sign out</button>
		{/if}
		<nav>
			{#each entries as [name, def] (name)}
				<button
					type="button"
					class:active={effectiveName === name}
					onclick={() => select(name, def)}
				>
					<span>{name}</span>
					<small>{def.kind}</small>
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
								{api}
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
