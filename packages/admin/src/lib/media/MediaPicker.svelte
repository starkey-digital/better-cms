<script lang="ts">
import { untrack } from 'svelte';
import Cropper from './Cropper.svelte';
import { type MediaApi, MediaError, type MediaItem } from './api.js';
import type { Shape } from './crop.js';
import { isHeic, isUntouchable } from './encode.js';
import { optionLabels } from './label.js';

type Props = {
	api: MediaApi;
	/** `image` crops and asks for a description; `file` uploads as-is. */
	kind: 'image' | 'file';
	title: string;
	shapes: Shape[];
	maxSize: number;
	/** Folder prefix for new uploads (the field name). */
	folder: string;
	/** Storage key of what the field holds now, to mark it in the library. */
	currentKey?: string;
	onpick: (item: MediaItem) => void;
	onclose: () => void;
};

const { api, kind, title, shapes, maxSize, folder, currentKey, onpick, onclose }: Props = $props();

const isImage = $derived(kind === 'image');

let items = $state.raw<MediaItem[]>([]);
let cursor = $state<string | undefined>();
let loading = $state(false);
let listError = $state<string | null>(null);

let file = $state<File | null>(null);
let alt = $state('');
let altInvalid = $state(false);
let busy = $state(false);
let uploadError = $state<{ message: string; retryable: boolean } | null>(null);
let cropper = $state<ReturnType<typeof Cropper>>();
let fileInput = $state<HTMLInputElement>();
let altInput = $state<HTMLInputElement>();

const shown = $derived(isImage ? items.filter((i) => i.mime.startsWith('image/')) : items);
const labels = $derived(optionLabels(shown));

let abort: AbortController | undefined;

async function loadMore() {
	loading = true;
	listError = null;
	try {
		const page = await api.list(cursor);
		items = [...items, ...page.items];
		cursor = page.cursor;
	} catch (e) {
		listError =
			e instanceof MediaError ? e.message : 'Something went wrong while loading your photos.';
	} finally {
		loading = false;
	}
}

/** Move the dialog out of any enclosing <form> (its inputs would join that form), keeping the admin's CSS variables. */
function mount(dialog: HTMLDialogElement) {
	(dialog.closest('.bcms') ?? document.body).appendChild(dialog);
	dialog.showModal();
	// loadMore reads `cursor` before its first await; untracked, or the attachment re-runs (closing the dialog) when the cursor changes.
	untrack(() => void loadMore());
	return () => {
		abort?.abort();
		// close() hands focus back to whatever opened the dialog.
		if (dialog.open) dialog.close();
		dialog.remove();
	};
}

function chosen(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	const next = input.files?.[0];
	input.value = '';
	if (!next) return;
	uploadError = null;
	if (isImage && !next.type.startsWith('image/') && !isHeic(next)) {
		uploadError = {
			message: 'That is not a photo. Please choose a picture from your device.',
			retryable: false,
		};
		return;
	}
	alt = '';
	altInvalid = false;
	file = next;
}

function back() {
	abort?.abort();
	file = null;
	busy = false;
	uploadError = null;
}

async function submit() {
	if (!file || busy) return;
	if (isImage && !alt.trim()) {
		altInvalid = true;
		altInput?.focus();
		altInput?.scrollIntoView({ block: 'center' });
		return;
	}
	busy = true;
	uploadError = null;
	abort = new AbortController();
	try {
		let body: File = file;
		if (isImage && cropper && !isUntouchable(file)) {
			try {
				body = await cropper.apply();
			} catch {
				throw new MediaError(
					'This photo could not be prepared. Try a different photo, or save it as a JPEG first.',
					false,
				);
			}
		}
		const item = await api.upload(
			body,
			{ alt: isImage ? alt.trim() : file.name, name: body.name, folder },
			abort.signal,
		);
		onpick(item);
	} catch (e) {
		if ((e as Error).name === 'AbortError') return;
		uploadError =
			e instanceof MediaError
				? { message: e.message, retryable: e.retryable }
				: { message: 'Something went wrong. Please try again.', retryable: true };
	} finally {
		busy = false;
	}
}

const extOf = (i: MediaItem) => (i.key.split('.').pop() ?? '').slice(0, 4).toUpperCase();
</script>

<dialog class="bcms-pick" aria-labelledby="bcms-pick-title" onclose={onclose} {@attach mount}>
	<header class="bcms-pick-head">
		<h2 id="bcms-pick-title">{file ? (isImage ? 'Use this photo' : 'Use this file') : title}</h2>
		<button type="button" class="bcms-btn bcms-btn-ghost" onclick={() => (file && !busy ? back() : onclose())}>
			{file && !busy ? 'Back' : 'Cancel'}
		</button>
	</header>

	<div class="bcms-pick-body">
		{#if file}
			{#if isImage && !isUntouchable(file)}
				{#key file}
					<Cropper
						bind:this={cropper}
						{file}
						{shapes}
						{maxSize}
						onerror={(message) => (uploadError = { message, retryable: false })}
						onready={() => altInput?.focus({ preventScroll: true })}
					/>
				{/key}
			{:else}
				<p class="bcms-pick-file">{file.name}</p>
			{/if}

			{#if isImage}
				<div class="bcms-pick-alt">
					<label for="bcms-pick-alt">Describe the photo for people who can't see it</label>
					<input
						id="bcms-pick-alt"
						class="bcms-input"
						type="text"
						form="bcms-media-none"
						bind:this={altInput}
						bind:value={alt}
						maxlength="500"
						placeholder="For example: three dancers in blue costumes on stage"
						aria-invalid={altInvalid}
						aria-describedby={altInvalid ? 'bcms-pick-alt-err' : undefined}
						oninput={() => (altInvalid = false)}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								void submit();
							}
						}}
					/>
					{#if altInvalid}
						<p class="bcms-pick-err" id="bcms-pick-alt-err" role="alert">
							Please describe the photo. It is read out to people who use a screen reader.
						</p>
					{/if}
				</div>
			{/if}
		{:else}
			<div class="bcms-pick-upload">
				<button type="button" class="bcms-btn bcms-btn-primary" onclick={() => fileInput?.click()}>
					Upload a new {isImage ? 'photo' : 'file'}
				</button>
				<input
					bind:this={fileInput}
					class="bcms-pick-hidden"
					type="file"
					form="bcms-media-none"
					accept={isImage ? 'image/*,.heic,.heif' : undefined}
					tabindex="-1"
					aria-hidden="true"
					onchange={chosen}
				/>
				<p>Photos from your phone or camera are fine. Big ones are shrunk automatically.</p>
			</div>

			<h3 class="bcms-pick-sub">Or choose one you have already uploaded</h3>
			{#if shown.length}
				<ul class="bcms-pick-grid">
					{#each shown as item, i (item.id)}
						<li>
							<button
								type="button"
								class="bcms-pick-thumb"
								aria-pressed={item.key === currentKey}
								onclick={() => onpick(item)}
							>
								{#if item.mime.startsWith('image/')}
									<img src={item.url} alt="" loading="lazy" />
								{:else}
									<span class="bcms-pick-ext">{extOf(item)}</span>
								{/if}
								<span class="bcms-pick-name">{labels[i]}</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else if !loading && !listError}
				<p class="bcms-pick-empty">Nothing uploaded yet. Use the button above to add the first one.</p>
			{/if}

			{#if loading}
				<p class="bcms-pick-status" role="status">Loading…</p>
			{:else if listError}
				<p class="bcms-pick-err" role="alert">{listError}</p>
				<button type="button" class="bcms-btn bcms-btn-ghost" onclick={loadMore}>Try again</button>
			{:else if cursor}
				<button type="button" class="bcms-btn bcms-btn-ghost" onclick={loadMore}>Show more</button>
			{/if}
		{/if}

		{#if uploadError}
			<p class="bcms-pick-err" role="alert">{uploadError.message}</p>
		{/if}
		{#if busy}
			<p class="bcms-pick-status" role="status">Uploading…</p>
		{/if}
	</div>

	{#if file}
		<footer class="bcms-pick-foot">
			{#if uploadError?.retryable}
				<button type="button" class="bcms-btn bcms-btn-ghost" onclick={submit} disabled={busy}>Try again</button>
			{/if}
			<button type="button" class="bcms-btn bcms-btn-primary" onclick={submit} disabled={busy}>
				{busy ? 'Uploading…' : isImage ? 'Use this photo' : 'Use this file'}
			</button>
		</footer>
	{/if}
</dialog>

<style>
	.bcms-pick {
		width: min(46rem, calc(100vw - 32px));
		max-height: min(90dvh, 56rem);
		padding: 0;
		color: var(--bcms-fg);
		background-color: var(--bcms-surface);
		border: 1px solid var(--bcms-border);
		border-radius: var(--bcms-radius-lg);
		box-shadow: var(--bcms-shadow-lg);
		font-family: var(--bcms-font);
		font-size: var(--bcms-text-base);
	}
	.bcms-pick[open] {
		display: flex;
		flex-direction: column;
	}
	.bcms-pick::backdrop {
		background-color: rgb(15 23 42 / 0.55);
	}
	.bcms-pick-head,
	.bcms-pick-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 20px;
	}
	.bcms-pick-head {
		border-bottom: 1px solid var(--bcms-border);
	}
	.bcms-pick-head h2 {
		margin: 0;
		font-size: var(--bcms-text-lg);
	}
	.bcms-pick-foot {
		justify-content: flex-end;
		border-top: 1px solid var(--bcms-border);
	}
	.bcms-pick-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-height: 0;
		padding: 20px;
		overflow-y: auto;
	}
	.bcms-pick-upload {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}
	.bcms-pick-upload p,
	.bcms-pick-empty,
	.bcms-pick-status {
		margin: 0;
		font-size: var(--bcms-text-sm);
		color: var(--bcms-muted);
	}
	.bcms-pick-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.bcms-pick-sub {
		margin: 8px 0 0;
		font-size: var(--bcms-text-md);
	}
	.bcms-pick-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.bcms-pick-thumb {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		padding: 6px;
		font: inherit;
		font-size: var(--bcms-text-xs);
		color: var(--bcms-fg-soft);
		text-align: left;
		background: var(--bcms-surface);
		border: 2px solid var(--bcms-border);
		border-radius: var(--bcms-radius);
		cursor: pointer;
	}
	.bcms-pick-thumb:hover {
		border-color: var(--bcms-border-strong);
	}
	.bcms-pick-thumb[aria-pressed='true'] {
		border-color: var(--bcms-primary);
		background-color: var(--bcms-subtle);
	}
	.bcms-pick-thumb:focus-visible {
		outline: 3px solid var(--bcms-ring);
		outline-offset: 2px;
	}
	.bcms-pick-thumb img,
	.bcms-pick-ext {
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: var(--bcms-radius-sm);
		background-color: var(--bcms-subtle);
	}
	.bcms-pick-name {
		display: -webkit-box;
		overflow: hidden;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow-wrap: anywhere;
	}
	.bcms-pick-alt {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.bcms-pick-alt label {
		font-size: var(--bcms-text-sm);
		font-weight: 500;
		color: var(--bcms-fg-soft);
	}
	.bcms-pick-file {
		margin: 0;
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	.bcms-pick-err {
		margin: 0;
		padding: 10px 12px;
		font-size: var(--bcms-text-sm);
		color: var(--bcms-danger-fg);
		background-color: var(--bcms-danger-soft);
		border-radius: var(--bcms-radius);
	}
	:global(.bcms-pick .bcms-btn) {
		min-height: 44px;
	}

	@media (max-width: 640px) {
		.bcms-pick {
			width: 100vw;
			max-width: 100vw;
			height: 100dvh;
			max-height: 100dvh;
			border: 0;
			border-radius: 0;
		}
		.bcms-pick-body {
			padding: 16px;
		}
	}
</style>
