<script lang="ts">
import type { CmsMetaCollection } from '@better-cms/sveltekit';
import { onMount } from 'svelte';
import FieldEditor from './FieldEditor.svelte';

type ApiMethods = {
	get(idOrSlug?: string): Promise<Record<string, unknown> | null>;
	set(data: Record<string, unknown>): Promise<Record<string, unknown>>;
	create(data: Record<string, unknown>): Promise<Record<string, unknown>>;
	update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
	delete(id: string): Promise<void>;
};

type Props = {
	client: {
		[k: string]: unknown;
		uploadMedia(file: File | Blob, folder?: string): Promise<{ key: string; url: string }>;
	};
	name: string;
	def: CmsMetaCollection;
	mode: 'new' | 'edit' | 'singleton';
	id?: string;
	onback: () => void;
	onsaved: (id: string) => void;
	ondeleted: () => void;
};

const { client, name, def, mode, id, onback, onsaved, ondeleted }: Props = $props();

const apiOf = (n: string) => client[n] as unknown as ApiMethods;

let editing = $state<Record<string, unknown> | null>(null);
let loading = $state(true);
let saving = $state(false);
let error = $state<string | null>(null);
let dirty = $state(false);

async function loadOne() {
	loading = true;
	error = null;
	try {
		const api = apiOf(name);
		if (mode === 'singleton') {
			editing = (await api.get()) ?? {};
		} else if (mode === 'edit' && id) {
			const row = await api.get(id);
			if (!row) {
				error = `Not found: ${id}`;
				editing = null;
			} else {
				editing = row;
			}
		} else {
			editing = {};
		}
	} catch (e) {
		error = (e as Error).message;
	} finally {
		loading = false;
	}
}

onMount(() => {
	void loadOne();
});

function setField(fname: string, value: unknown) {
	if (!editing) return;
	editing = { ...editing, [fname]: value };
	dirty = true;
}

async function save() {
	if (!editing) return;
	saving = true;
	error = null;
	try {
		const api = apiOf(name);
		if (mode === 'singleton') {
			await api.set(editing);
			dirty = false;
		} else if (mode === 'new') {
			const created = await api.create(editing);
			dirty = false;
			if (typeof created.id === 'string') onsaved(created.id);
		} else if (mode === 'edit' && id) {
			const updated = await api.update(id, editing);
			editing = updated;
			dirty = false;
		}
	} catch (e) {
		error = (e as Error).message;
	} finally {
		saving = false;
	}
}

async function remove() {
	if (mode !== 'edit' || !id) return;
	if (typeof confirm !== 'undefined' && !confirm(`Delete this ${name} record?`)) return;
	saving = true;
	try {
		await apiOf(name).delete(id);
		ondeleted();
	} catch (e) {
		error = (e as Error).message;
	} finally {
		saving = false;
	}
}

function pageTitle(): string {
	if (mode === 'singleton') return name;
	if (mode === 'new') return `New ${name.replace(/s$/, '') || name}`;
	if (editing) {
		const t = editing.title ?? editing.name ?? editing.slug;
		if (typeof t === 'string' && t) return t;
	}
	return id ?? 'Edit';
}

const fieldEntries = $derived(
	Object.entries(def.fields).filter(([k]) => k !== 'id' && k !== 'createdAt' && k !== 'updatedAt'),
);
</script>

<header class="bcms-page-header bcms-edit-header">
	<div class="bcms-edit-title">
		{#if mode !== 'singleton'}
			<button type="button" class="bcms-back" onclick={onback} aria-label="Back to list">
				<span aria-hidden="true">←</span>
			</button>
		{/if}
		<div>
			<small class="bcms-crumb">
				{name}{#if mode === 'new'} / new{:else if mode === 'edit'} / {id}{/if}
			</small>
			<h2>{pageTitle()}</h2>
		</div>
	</div>
	<div class="bcms-actions">
		{#if dirty}
			<span class="bcms-dirty">unsaved</span>
		{/if}
		{#if mode === 'edit'}
			<button
				type="button"
				class="bcms-btn bcms-btn-danger"
				onclick={remove}
				disabled={saving}
			>
				Delete
			</button>
		{/if}
		<button
			type="button"
			class="bcms-btn bcms-btn-primary"
			onclick={save}
			disabled={saving || loading || !editing}
		>
			{saving ? 'Saving…' : mode === 'singleton' ? 'Save changes' : mode === 'new' ? 'Create' : 'Save'}
		</button>
	</div>
</header>

{#if error}<div class="bcms-error">{error}</div>{/if}

{#if loading}
	<div class="bcms-form-skel">
		{#each Array(4) as _, i (i)}
			<div class="bcms-skel-row" style="height: 64px"></div>
		{/each}
	</div>
{:else if editing}
	<form
		class="bcms-form"
		onsubmit={(e) => {
			e.preventDefault();
			void save();
		}}
	>
		<div class="bcms-form-fields">
			{#each fieldEntries as [fname, field] (fname)}
				<FieldEditor
					{client}
					name={fname}
					{field}
					value={editing[fname]}
					onchange={(v) => setField(fname, v)}
				/>
			{/each}
		</div>
	</form>
{:else}
	<div class="bcms-empty bcms-empty-card">
		<h3>Record not available</h3>
		<p>{error ?? 'It may have been deleted.'}</p>
		{#if mode !== 'singleton'}
			<button type="button" class="bcms-btn bcms-btn-ghost" onclick={onback}>Back</button>
		{/if}
	</div>
{/if}

<style>
	:global(.bcms-edit-header) {
		gap: 12px;
	}
	:global(.bcms-edit-title) {
		display: flex;
		gap: 12px;
		align-items: center;
		min-width: 0;
	}
	:global(.bcms-back) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 1px solid var(--bcms-border);
		border-radius: var(--bcms-radius-sm);
		background-color: var(--bcms-surface);
		color: var(--bcms-fg);
		cursor: pointer;
		font-size: 1.05rem;
		transition: background-color 120ms ease;
	}
	:global(.bcms-back:hover) {
		background-color: var(--bcms-subtle);
	}
	:global(.bcms-back:focus-visible) {
		outline: 2px solid var(--bcms-ring);
		outline-offset: 2px;
	}
	:global(.bcms-crumb) {
		display: block;
		font-size: var(--bcms-text-xs);
		color: var(--bcms-muted);
		font-family: var(--bcms-font-mono);
		margin-bottom: 2px;
	}
	:global(.bcms-edit-header h2) {
		margin: 0;
		font-size: var(--bcms-text-2xl);
		font-weight: 600;
		letter-spacing: -0.02em;
		text-transform: capitalize;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 60vw;
	}

	:global(.bcms-actions) {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}
	:global(.bcms-dirty) {
		font-size: var(--bcms-text-xs);
		font-weight: 500;
		padding: 3px 9px;
		border-radius: 999px;
		background-color: var(--bcms-warning-soft);
		color: var(--bcms-warning-fg);
	}

	:global(.bcms-form) {
		background-color: var(--bcms-surface);
		border: 1px solid var(--bcms-border);
		border-radius: var(--bcms-radius-lg);
		padding: 24px 28px;
		box-shadow: var(--bcms-shadow-sm);
	}
	:global(.bcms-form-fields) {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	:global(.bcms-form-skel) {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	@media (max-width: 720px) {
		:global(.bcms-edit-header h2) {
			max-width: 100%;
			white-space: normal;
		}
		:global(.bcms-form) {
			padding: 18px;
		}
	}
</style>
