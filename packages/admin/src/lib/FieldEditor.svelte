<script lang="ts">
import type { CmsMetaField } from '@better-cms/sveltekit';
import ImageField from './ImageField.svelte';

type Props = {
	field: CmsMetaField & { label?: string; description?: string };
	name: string;
	value: unknown;
	client: {
		uploadMedia(file: File | Blob, folder?: string): Promise<{ key: string; url: string }>;
	};
	onchange: (next: unknown) => void;
};

const { field, name, value, onchange }: Props = $props();

function humanLabel(s: string): string {
	return s
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, (c) => c.toUpperCase())
		.trim();
}
</script>

<svelte:element this={field.kind === 'image' || field.kind === 'file' ? 'div' : 'label'} class="bcms-field">
	<span class="bcms-label">
		{field.label ?? humanLabel(name)}{#if field.required}<em class="bcms-req">*</em>{/if}
	</span>

	{#if field.kind === 'text' || field.kind === 'slug'}
		{#if field.editor?.props?.multiline}
			<textarea
				class="bcms-input"
				value={(value as string) ?? ''}
				oninput={(e) => onchange((e.target as HTMLTextAreaElement).value)}
				rows="4"
			></textarea>
		{:else}
			<input
				class="bcms-input"
				type="text"
				value={(value as string) ?? ''}
				oninput={(e) => onchange((e.target as HTMLInputElement).value)}
			/>
		{/if}
	{:else if field.kind === 'number' || field.kind === 'integer'}
		<input
			class="bcms-input"
			type="number"
			value={(value as number) ?? ''}
			oninput={(e) => {
				const v = (e.target as HTMLInputElement).value;
				onchange(v === '' ? null : Number(v));
			}}
		/>
	{:else if field.kind === 'boolean'}
		<label class="bcms-toggle">
			<input
				type="checkbox"
				checked={Boolean(value)}
				onchange={(e) => onchange((e.target as HTMLInputElement).checked)}
			/>
			<span class="bcms-toggle-track" aria-hidden="true">
				<span class="bcms-toggle-thumb"></span>
			</span>
			<span class="bcms-toggle-label">{value ? 'Yes' : 'No'}</span>
		</label>
	{:else if field.kind === 'date'}
		<input
			class="bcms-input"
			type="datetime-local"
			value={value instanceof Date ? value.toISOString().slice(0, 16) : ((value as string) ?? '')}
			oninput={(e) => {
				const v = (e.target as HTMLInputElement).value;
				onchange(v ? new Date(v) : null);
			}}
		/>
	{:else if field.kind === 'select'}
		<select
			class="bcms-input"
			value={(value as string) ?? ''}
			onchange={(e) => onchange((e.target as HTMLSelectElement).value)}
		>
			<option value="" disabled>—</option>
			{#each field.options ?? [] as opt (opt)}
				<option value={opt}>{opt}</option>
			{/each}
		</select>
	{:else if field.kind === 'image' || field.kind === 'file'}
		<ImageField {field} {value} {onchange} />
	{:else if field.kind === 'richText' || field.kind === 'json' || field.kind === 'array' || field.kind === 'object'}
		<textarea
			class="bcms-input bcms-mono"
			value={value == null ? '' : JSON.stringify(value, null, 2)}
			oninput={(e) => {
				try {
					onchange(JSON.parse((e.target as HTMLTextAreaElement).value));
				} catch {
					/* invalid json — ignore until valid */
				}
			}}
			rows="8"
		></textarea>
	{:else}
		<input
			class="bcms-input"
			type="text"
			value={(value as string) ?? ''}
			oninput={(e) => onchange((e.target as HTMLInputElement).value)}
		/>
	{/if}

	{#if field.description}
		<small class="bcms-help">{field.description}</small>
	{/if}
</svelte:element>

<style>
	:global(.bcms-field) {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	:global(.bcms-label) {
		font-size: var(--bcms-text-sm);
		font-weight: 500;
		color: var(--bcms-fg-soft);
	}
	:global(.bcms-req) {
		color: var(--bcms-danger);
		font-style: normal;
		margin-left: 2px;
	}
	:global(.bcms-help) {
		color: var(--bcms-muted);
		font-size: var(--bcms-text-xs);
	}

	:global(.bcms-input) {
		width: 100%;
		padding: 9px 12px;
		font: inherit;
		font-size: var(--bcms-text-sm);
		color: var(--bcms-fg);
		background-color: var(--bcms-surface);
		border: 1px solid var(--bcms-border);
		border-radius: var(--bcms-radius-sm);
		transition:
			border-color 120ms ease,
			box-shadow 120ms ease;
	}
	:global(.bcms-input:hover) {
		border-color: var(--bcms-border-strong);
	}
	:global(.bcms-input:focus) {
		outline: none;
		border-color: var(--bcms-ring);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--bcms-ring) 18%, transparent);
	}
	:global(textarea.bcms-input) {
		resize: vertical;
		min-height: 96px;
	}
	:global(.bcms-mono) {
		font-family: var(--bcms-font-mono);
		font-size: var(--bcms-text-xs);
		line-height: 1.5;
	}

	:global(.bcms-toggle) {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		user-select: none;
	}
	:global(.bcms-toggle input) {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	:global(.bcms-toggle-track) {
		position: relative;
		width: 38px;
		height: 22px;
		background-color: var(--bcms-border);
		border-radius: 999px;
		transition: background-color 160ms ease;
	}
	:global(.bcms-toggle-thumb) {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 18px;
		height: 18px;
		background: #fff;
		border-radius: 50%;
		box-shadow: var(--bcms-shadow-sm);
		transition: transform 160ms ease;
	}
	:global(.bcms-toggle input:checked + .bcms-toggle-track) {
		background-color: var(--bcms-primary);
	}
	:global(.bcms-toggle input:checked + .bcms-toggle-track .bcms-toggle-thumb) {
		transform: translateX(16px);
	}
	:global(.bcms-toggle input:focus-visible + .bcms-toggle-track) {
		outline: 2px solid var(--bcms-ring);
		outline-offset: 2px;
	}
	:global(.bcms-toggle-label) {
		font-size: var(--bcms-text-sm);
		color: var(--bcms-fg-soft);
	}
</style>
