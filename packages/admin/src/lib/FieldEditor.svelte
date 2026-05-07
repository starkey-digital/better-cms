<script lang="ts">
import type { FieldDef } from '@better-cms/core';
import type { AdminApi } from './api.js';

type Props = {
	field: FieldDef;
	name: string;
	value: unknown;
	api: AdminApi;
	onchange: (next: unknown) => void;
};

const { field, name, value, api, onchange }: Props = $props();

let busy = $state(false);

async function uploadImage(file: File) {
	busy = true;
	try {
		const res = await api.uploadMedia(file, name);
		onchange({ key: res.key, url: res.url });
	} finally {
		busy = false;
	}
}
</script>

<label class="bcms-field">
	<span class="bcms-label">{field.label ?? name}{field.validation?.required ? ' *' : ''}</span>

	{#if field.kind === 'text' || field.kind === 'slug'}
		{#if field.editor?.props?.multiline}
			<textarea
				value={(value as string) ?? ''}
				oninput={(e) => onchange((e.target as HTMLTextAreaElement).value)}
				rows="4"
			></textarea>
		{:else}
			<input
				type="text"
				value={(value as string) ?? ''}
				oninput={(e) => onchange((e.target as HTMLInputElement).value)}
			/>
		{/if}
	{:else if field.kind === 'number' || field.kind === 'integer'}
		<input
			type="number"
			value={(value as number) ?? ''}
			oninput={(e) => {
				const v = (e.target as HTMLInputElement).value;
				onchange(v === '' ? null : Number(v));
			}}
		/>
	{:else if field.kind === 'boolean'}
		<input
			type="checkbox"
			checked={Boolean(value)}
			onchange={(e) => onchange((e.target as HTMLInputElement).checked)}
		/>
	{:else if field.kind === 'date'}
		<input
			type="datetime-local"
			value={value instanceof Date ? value.toISOString().slice(0, 16) : ((value as string) ?? '')}
			oninput={(e) => {
				const v = (e.target as HTMLInputElement).value;
				onchange(v ? new Date(v) : null);
			}}
		/>
	{:else if field.kind === 'select'}
		<select
			value={(value as string) ?? ''}
			onchange={(e) => onchange((e.target as HTMLSelectElement).value)}
		>
			<option value="" disabled>—</option>
			{#each (field.validation?.enum ?? []) as opt}
				<option value={opt}>{opt}</option>
			{/each}
		</select>
	{:else if field.kind === 'image'}
		<div class="bcms-image">
			{#if value && typeof value === 'object' && 'url' in value}
				<img src={(value as { url: string }).url} alt={(value as { alt?: string }).alt ?? ''} />
			{/if}
			<input
				type="file"
				accept="image/*"
				disabled={busy}
				onchange={(e) => {
					const file = (e.target as HTMLInputElement).files?.[0];
					if (file) void uploadImage(file);
				}}
			/>
		</div>
	{:else if field.kind === 'richText' || field.kind === 'json' || field.kind === 'array' || field.kind === 'object'}
		<textarea
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
			type="text"
			value={(value as string) ?? ''}
			oninput={(e) => onchange((e.target as HTMLInputElement).value)}
		/>
	{/if}

	{#if field.description}
		<small class="bcms-help">{field.description}</small>
	{/if}
</label>

<style>
	.bcms-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-block: 0.75rem;
	}
	.bcms-label {
		font-size: 0.875rem;
		font-weight: 600;
	}
	.bcms-help {
		color: #666;
		font-size: 0.75rem;
	}
	input[type='text'],
	input[type='number'],
	input[type='datetime-local'],
	textarea,
	select {
		font: inherit;
		padding: 0.5rem 0.625rem;
		border: 1px solid #d4d4d8;
		border-radius: 6px;
		background: #fff;
	}
	textarea {
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 0.8125rem;
	}
	.bcms-image img {
		max-width: 220px;
		max-height: 160px;
		object-fit: cover;
		display: block;
		margin-bottom: 0.5rem;
		border-radius: 6px;
	}
</style>
