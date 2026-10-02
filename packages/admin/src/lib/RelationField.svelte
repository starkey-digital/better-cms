<script lang="ts">
import { onMount } from 'svelte';
import { getAdmin } from './context.js';
import { recordTitle } from './logic/titles.js';
import type { CmsMetaField, RecordApi, Row } from './logic/types.js';

type Props = {
	field: CmsMetaField;
	value: unknown;
	id: string;
	describedby?: string;
	invalid?: boolean;
	oncommit: (next: unknown) => void;
};

const { field, value, id, describedby, invalid = false, oncommit }: Props = $props();
const { client, meta } = getAdmin();

const target = $derived(field.relation?.target ?? '');
const many = $derived(field.relation?.many === true);

let options = $state.raw<{ id: string; title: string }[] | null>(null);
let failed = $state(false);

onMount(() => {
	void load();
});

async function load() {
	const def = meta.collections[target];
	if (!def) {
		failed = true;
		return;
	}
	try {
		const rows: Row[] = await (client[target] as RecordApi).list({ limit: 500 });
		options = rows.map((r) => ({ id: String(r.id), title: recordTitle(target, def, r) }));
	} catch {
		failed = true;
	}
}

const selected = $derived(
	many ? (Array.isArray(value) ? (value as string[]) : []) : typeof value === 'string' ? value : '',
);

function toggle(optionId: string, on: boolean) {
	const current = selected as string[];
	oncommit(on ? [...current, optionId] : current.filter((x) => x !== optionId));
}
</script>

{#if failed}
	<p class="bcms-help">The list of choices couldn't be loaded. Refresh the page to try again.</p>
{:else if options === null}
	<p class="bcms-help">Loading choices…</p>
{:else if many}
	<div class="bcms-checks" {id} aria-describedby={describedby}>
		{#each options as opt (opt.id)}
			<label class="bcms-check">
				<input
					type="checkbox"
					checked={(selected as string[]).includes(opt.id)}
					onchange={(e) => toggle(opt.id, e.currentTarget.checked)}
				/>
				<span>{opt.title}</span>
			</label>
		{:else}
			<p class="bcms-help">Nothing to choose from yet.</p>
		{/each}
	</div>
{:else}
	<select
		class="bcms-input"
		{id}
		aria-describedby={describedby}
		aria-invalid={invalid || undefined}
		value={selected as string}
		onchange={(e) => oncommit(e.currentTarget.value || null)}
	>
		<option value="">{field.required ? 'Choose one…' : 'Not set'}</option>
		{#each options as opt (opt.id)}
			<option value={opt.id}>{opt.title}</option>
		{/each}
		{#if selected && !options.some((o) => o.id === selected)}
			<option value={selected as string}>(no longer available)</option>
		{/if}
	</select>
{/if}
