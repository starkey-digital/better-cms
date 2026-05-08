<script lang="ts">
import type { CmsMetaCollection } from '@better-cms/sveltekit';
import { onMount } from 'svelte';

type Props = {
	client: { [k: string]: unknown };
	name: string;
	def: CmsMetaCollection;
	onnew: () => void;
	onpick: (id: string) => void;
};

const { client, name, def, onnew, onpick }: Props = $props();

type ApiMethods = {
	list(opts?: { limit?: number }): Promise<Record<string, unknown>[]>;
};

let rows = $state<Record<string, unknown>[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);

async function load() {
	loading = true;
	error = null;
	try {
		const api = client[name] as unknown as ApiMethods;
		rows = await api.list({ limit: 50 });
	} catch (e) {
		error = (e as Error).message;
	} finally {
		loading = false;
	}
}

onMount(() => {
	void load();
});

function rowLabel(r: Record<string, unknown>): string {
	const candidates = ['title', 'name', 'slug', 'label'];
	for (const k of candidates) {
		const v = r[k];
		if (typeof v === 'string' && v) return v;
	}
	return String(r.id ?? '(untitled)');
}

function rowMeta(r: Record<string, unknown>): string {
	const id = typeof r.id === 'string' ? r.id : '';
	const slug = typeof r.slug === 'string' ? r.slug : '';
	if (slug && slug !== rowLabel(r)) return slug;
	return id;
}

function fieldKeys(): string[] {
	return Object.keys(def.fields).filter(
		(k) => k !== 'id' && k !== 'createdAt' && k !== 'updatedAt',
	);
}

function badgeForBoolean(v: unknown): { label: string; tone: 'on' | 'off' } | null {
	if (v === true) return { label: 'yes', tone: 'on' };
	if (v === false) return { label: 'no', tone: 'off' };
	return null;
}
</script>

<header class="bcms-page-header">
	<div>
		<h2>{name}</h2>
		<p>{rows.length} {rows.length === 1 ? 'record' : 'records'}</p>
	</div>
	<button type="button" class="bcms-btn bcms-btn-primary" onclick={onnew}>
		<span aria-hidden="true">+</span> New
	</button>
</header>

{#if error}<div class="bcms-error">{error}</div>{/if}

{#if loading}
	<div class="bcms-list-skel">
		{#each Array(4) as _, i (i)}
			<div class="bcms-skel-row"></div>
		{/each}
	</div>
{:else if rows.length === 0}
	<div class="bcms-empty bcms-empty-card">
		<h3>No records yet</h3>
		<p>Create your first {name} entry to get going.</p>
		<button type="button" class="bcms-btn bcms-btn-primary" onclick={onnew}>+ New</button>
	</div>
{:else}
	<div class="bcms-list">
		{#each rows as row (row.id)}
			{@const r = row as Record<string, unknown> & { id?: string }}
			<button
				type="button"
				class="bcms-row"
				onclick={() => r.id && onpick(String(r.id))}
			>
				<div class="bcms-row-main">
					<strong>{rowLabel(r)}</strong>
					<small>{rowMeta(r)}</small>
				</div>
				<div class="bcms-row-meta">
					{#each fieldKeys().slice(0, 3) as key (key)}
						{@const f = def.fields[key]}
						{@const v = r[key]}
						{#if f && f.kind === 'boolean'}
							{@const b = badgeForBoolean(v)}
							{#if b}
								<span class="bcms-badge bcms-badge-{b.tone}">{key}: {b.label}</span>
							{/if}
						{/if}
					{/each}
					<span class="bcms-row-arrow" aria-hidden="true">›</span>
				</div>
			</button>
		{/each}
	</div>
{/if}

<style>
	:global(.bcms-page-header) {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 16px;
		margin-bottom: 20px;
	}
	:global(.bcms-page-header h2) {
		margin: 0;
		font-size: var(--bcms-text-2xl);
		font-weight: 600;
		letter-spacing: -0.02em;
		text-transform: capitalize;
	}
	:global(.bcms-page-header p) {
		margin: 4px 0 0;
		font-size: var(--bcms-text-sm);
		color: var(--bcms-muted);
	}

	:global(.bcms-btn) {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border: 1px solid transparent;
		border-radius: var(--bcms-radius-sm);
		font: inherit;
		font-size: var(--bcms-text-sm);
		font-weight: 500;
		cursor: pointer;
		background-color: var(--bcms-surface);
		color: var(--bcms-fg);
		transition:
			background 120ms ease,
			border-color 120ms ease,
			transform 80ms ease;
	}
	:global(.bcms-btn:hover) {
		background-color: var(--bcms-subtle);
	}
	:global(.bcms-btn:active) {
		transform: translateY(1px);
	}
	:global(.bcms-btn:focus-visible) {
		outline: 2px solid var(--bcms-ring);
		outline-offset: 2px;
	}
	:global(.bcms-btn-primary) {
		background-color: var(--bcms-primary);
		color: var(--bcms-primary-fg);
		border-color: var(--bcms-primary);
	}
	:global(.bcms-btn-primary:hover) {
		background-color: var(--bcms-primary-hover);
		border-color: var(--bcms-primary-hover);
	}
	:global(.bcms-btn-ghost) {
		background: transparent;
		border-color: var(--bcms-border);
	}
	:global(.bcms-btn-ghost:hover) {
		background-color: var(--bcms-subtle);
	}
	:global(.bcms-btn-danger) {
		background-color: var(--bcms-danger);
		color: #fff;
		border-color: var(--bcms-danger);
	}
	:global(.bcms-btn-danger:hover) {
		background-color: color-mix(in oklab, var(--bcms-danger) 88%, black);
	}
	:global(.bcms-btn[disabled]) {
		opacity: 0.6;
		cursor: not-allowed;
	}

	:global(.bcms-list) {
		display: flex;
		flex-direction: column;
		gap: 6px;
		background-color: var(--bcms-surface);
		border: 1px solid var(--bcms-border);
		border-radius: var(--bcms-radius);
		padding: 6px;
		box-shadow: var(--bcms-shadow-sm);
	}
	:global(.bcms-row) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		background: transparent;
		border: 0;
		border-radius: var(--bcms-radius-sm);
		text-align: left;
		cursor: pointer;
		font: inherit;
		color: var(--bcms-fg);
		transition: background-color 120ms ease;
	}
	:global(.bcms-row:hover) {
		background-color: var(--bcms-subtle);
	}
	:global(.bcms-row:focus-visible) {
		outline: 2px solid var(--bcms-ring);
		outline-offset: -2px;
	}
	:global(.bcms-row-main) {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	:global(.bcms-row-main strong) {
		font-weight: 500;
		font-size: var(--bcms-text-md);
		color: var(--bcms-fg);
	}
	:global(.bcms-row-main small) {
		font-size: var(--bcms-text-xs);
		color: var(--bcms-muted);
		font-family: var(--bcms-font-mono);
	}
	:global(.bcms-row-meta) {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}
	:global(.bcms-row-arrow) {
		color: var(--bcms-muted);
		font-size: 1.2rem;
		line-height: 1;
	}

	:global(.bcms-badge) {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		font-size: var(--bcms-text-xs);
		font-weight: 500;
		border-radius: 999px;
		border: 1px solid var(--bcms-border);
		background-color: var(--bcms-subtle);
		color: var(--bcms-fg-soft);
	}
	:global(.bcms-badge-on) {
		background-color: var(--bcms-success-soft);
		color: var(--bcms-success-fg);
		border-color: color-mix(in oklab, var(--bcms-success) 30%, transparent);
	}
	:global(.bcms-badge-off) {
		background-color: var(--bcms-subtle);
		color: var(--bcms-muted);
	}

	:global(.bcms-empty-card) {
		background-color: var(--bcms-surface);
		border: 1px dashed var(--bcms-border-strong);
		border-radius: var(--bcms-radius-lg);
		padding: 56px 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: center;
	}
	:global(.bcms-empty-card h3) {
		margin: 0;
		font-size: var(--bcms-text-lg);
		font-weight: 600;
		color: var(--bcms-fg);
	}
	:global(.bcms-empty-card p) {
		margin: 0 0 12px;
	}

	:global(.bcms-list-skel) {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	:global(.bcms-skel-row) {
		height: 52px;
		border-radius: var(--bcms-radius);
		background: linear-gradient(
			90deg,
			var(--bcms-subtle) 0%,
			color-mix(in oklab, var(--bcms-subtle) 60%, white) 50%,
			var(--bcms-subtle) 100%
		);
		background-size: 200% 100%;
		animation: bcms-shimmer 1.4s ease-in-out infinite;
	}
	@keyframes bcms-shimmer {
		from {
			background-position: 200% 0;
		}
		to {
			background-position: -200% 0;
		}
	}
</style>
