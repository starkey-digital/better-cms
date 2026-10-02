<script lang="ts">
import type { CmsMetaField } from '@better-cms/sveltekit';
import MediaPicker from './media/MediaPicker.svelte';
import { type MediaItem, createMediaApi } from './media/api.js';
import { getMediaContext } from './media/context.js';
import { DEFAULT_MAX_SIZE, shapesFor } from './media/crop.js';

type Stored = {
	key: string;
	url: string;
	mime?: string;
	size?: number;
	width?: number;
	height?: number;
	alt?: string;
	name?: string;
};

type Props = {
	field: CmsMetaField;
	value: unknown;
	onchange: (next: unknown) => void;
};

const { field, value, onchange }: Props = $props();

const uid = $props.id();
const api = createMediaApi(getMediaContext().basePath);

const kind = $derived(field.kind === 'file' ? 'file' : 'image');
const noun = $derived(kind === 'image' ? 'photo' : 'file');
const editor = $derived(field.editor?.props ?? {});
const shapes = $derived(shapesFor(editor.aspect, editor.aspectLabel));
const maxSize = $derived(
	typeof editor.maxSize === 'number' && editor.maxSize > 0 ? editor.maxSize : DEFAULT_MAX_SIZE,
);

const current = $derived(
	value && typeof value === 'object' && 'url' in value ? (value as Stored) : null,
);

let picking = $state(false);
let confirmingRemove = $state(false);
let editingAlt = $state(false);
let altDraft = $state('');

function picked(item: MediaItem) {
	picking = false;
	const next: Stored =
		kind === 'image'
			? {
					key: item.key,
					url: item.url,
					mime: item.mime,
					size: item.size,
					alt: item.alt,
					...(item.width ? { width: item.width } : {}),
					...(item.height ? { height: item.height } : {}),
				}
			: { key: item.key, url: item.url, mime: item.mime, size: item.size, name: item.alt };
	onchange(next);
}

function remove() {
	confirmingRemove = false;
	onchange(null);
}

function startAlt() {
	altDraft = current?.alt ?? '';
	editingAlt = true;
}

function saveAlt() {
	if (current) onchange({ ...current, alt: altDraft.trim() });
	editingAlt = false;
}
</script>

<!-- FieldShell renders the fieldset + legend, so this must not be a second named group. -->
<div class="bcms-media">
	{#if current}
		<div class="bcms-media-current">
			{#if kind === 'image'}
				<img class="bcms-media-thumb" src={current.url} alt={current.alt ?? ''} />
			{:else}
				<a class="bcms-media-filelink" href={current.url} target="_blank" rel="noreferrer">
					{current.name || current.key}
				</a>
			{/if}

			{#if kind === 'image'}
				<div class="bcms-media-alt">
					{#if editingAlt}
						<label for="bcms-media-alt-{uid}">Describe the photo for people who can't see it</label>
						<input
							id="bcms-media-alt-{uid}"
							class="bcms-input"
							type="text"
							form="bcms-media-none"
							bind:value={altDraft}
							maxlength="500"
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									saveAlt();
								} else if (e.key === 'Escape') {
									e.stopPropagation();
									editingAlt = false;
								}
							}}
						/>
						<div class="bcms-media-row">
							<button type="button" class="bcms-btn bcms-btn-primary" onclick={saveAlt}>Save description</button>
							<button type="button" class="bcms-btn bcms-btn-ghost" onclick={() => (editingAlt = false)}>Cancel</button>
						</div>
					{:else}
						<p class="bcms-media-desc">
							{#if current.alt}
								<span class="bcms-media-desc-label">Description:</span> {current.alt}
							{:else}
								<span class="bcms-media-missing">No description yet. People who can't see the photo won't know what it shows.</span>
							{/if}
						</p>
						<button type="button" class="bcms-btn bcms-btn-ghost" onclick={startAlt}>
							{current.alt ? 'Change description' : 'Add a description'}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<div class="bcms-media-empty">No {noun} chosen yet</div>
	{/if}

	<div class="bcms-media-row">
		<button type="button" class="bcms-btn bcms-btn-primary" onclick={() => (picking = true)}>
			Choose a {noun}
		</button>
		{#if current && !confirmingRemove}
			<button type="button" class="bcms-btn bcms-btn-ghost" onclick={() => (confirmingRemove = true)}>
				Remove {noun}
			</button>
		{/if}
	</div>

	{#if confirmingRemove}
		<div class="bcms-media-confirm" role="alertdialog" aria-label="Remove {noun}?">
			<p>Remove this {noun} from here? It stays in your library and you can choose it again.</p>
			<div class="bcms-media-row">
				<button type="button" class="bcms-btn bcms-btn-danger" onclick={remove}>Yes, remove it</button>
				<button type="button" class="bcms-btn bcms-btn-ghost" onclick={() => (confirmingRemove = false)}>Keep it</button>
			</div>
		</div>
	{/if}
</div>

{#if picking}
	<MediaPicker
		{api}
		{kind}
		{shapes}
		{maxSize}
		title="Choose a {noun}"
		folder="media"
		currentKey={current?.key}
		onpick={picked}
		onclose={() => (picking = false)}
	/>
{/if}

<style>
	.bcms-media {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		width: 100%;
	}
	.bcms-media-current {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		align-items: flex-start;
		max-width: 100%;
	}
	.bcms-media-thumb {
		display: block;
		max-width: min(280px, 100%);
		max-height: 200px;
		object-fit: cover;
		border: 1px solid var(--bcms-border);
		border-radius: var(--bcms-radius);
		box-shadow: var(--bcms-shadow-sm);
	}
	.bcms-media-filelink {
		color: var(--bcms-accent);
		overflow-wrap: anywhere;
	}
	.bcms-media-empty {
		display: grid;
		place-items: center;
		width: min(280px, 100%);
		height: 120px;
		font-size: var(--bcms-text-sm);
		color: var(--bcms-muted);
		background-color: var(--bcms-subtle);
		border: 1px dashed var(--bcms-border-strong);
		border-radius: var(--bcms-radius);
	}
	.bcms-media-alt {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		flex: 1 1 220px;
		min-width: 0;
	}
	.bcms-media-alt label {
		font-size: var(--bcms-text-sm);
		font-weight: 500;
		color: var(--bcms-fg-soft);
	}
	.bcms-media-desc {
		margin: 0;
		font-size: var(--bcms-text-sm);
		overflow-wrap: anywhere;
	}
	.bcms-media-desc-label {
		font-weight: 600;
	}
	.bcms-media-missing {
		color: var(--bcms-warning-fg);
	}
	.bcms-media-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.bcms-media-confirm {
		padding: 12px 14px;
		background-color: var(--bcms-warning-soft);
		border-radius: var(--bcms-radius);
	}
	.bcms-media-confirm p {
		margin: 0 0 10px;
		font-size: var(--bcms-text-sm);
		color: var(--bcms-warning-fg);
	}
	:global(.bcms-media .bcms-btn) {
		min-height: 44px;
	}
</style>
