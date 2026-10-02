<script lang="ts">
import type { CmsMetaField } from '@better-cms/sveltekit';
import { getAdmin } from './context.js';

type Props = {
	field: CmsMetaField;
	value: unknown;
	onchange: (next: unknown) => void;
};

const { field, value, onchange }: Props = $props();
const { client } = getAdmin();

let busy = $state(false);
let failed = $state<string | null>(null);

const current = $derived(
	value && typeof value === 'object' && 'url' in value
		? (value as { url: string; alt?: string })
		: null,
);
const isImage = $derived(field.kind === 'image');

async function upload(file: File) {
	busy = true;
	failed = null;
	try {
		const res = await client.uploadMedia(file);
		onchange({ key: res.key, url: res.url });
	} catch {
		failed = "That file didn't upload. Check it's a picture under 10MB and try again.";
	} finally {
		busy = false;
	}
}
</script>

<div class="bcms-image">
	{#if current && isImage}
		<img src={current.url} alt={current.alt ?? ''} />
	{:else if current}
		<a href={current.url} target="_blank" rel="noreferrer">Current file</a>
	{:else}
		<div class="bcms-image-placeholder">{isImage ? 'No picture yet' : 'No file yet'}</div>
	{/if}
	<label class="bcms-file">
		<input
			type="file"
			accept={isImage ? 'image/*' : undefined}
			disabled={busy}
			aria-label={isImage ? 'Choose a picture' : 'Choose a file'}
			onchange={(e) => {
				const file = e.currentTarget.files?.[0];
				if (file) void upload(file);
			}}
		/>
		<span class="bcms-btn" class:bcms-disabled={busy}>
			{busy ? 'Uploading…' : current ? 'Replace' : isImage ? 'Choose a picture' : 'Choose a file'}
		</span>
	</label>
	{#if failed}<p class="bcms-field-error">{failed}</p>{/if}
</div>
