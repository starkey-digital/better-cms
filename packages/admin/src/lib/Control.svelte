<script lang="ts">
import { fromDateInput, fromLocalInput, toDateInput, toLocalInput } from './logic/dates.js';
import type { CmsMetaField } from './logic/types.js';
import { isUrlField } from './logic/values.js';

type Props = {
	name: string;
	field: CmsMetaField;
	value: unknown;
	id: string;
	/** Accessible name when there is no visible `<label for>` (cells inside a repeater). */
	label?: string;
	describedby?: string;
	invalid?: boolean;
	oncommit: (next: unknown) => void;
};

const { name, field, value, id, label, describedby, invalid = false, oncommit }: Props = $props();

const kind = $derived(field.kind);
const dateOnly = $derived(field.editor?.props?.dateOnly === true);
const multiline = $derived(field.editor?.props?.multiline === true);
const isUrl = $derived(isUrlField(name, field));
const isNumber = $derived(kind === 'number' || kind === 'integer');

const toDraft = (v: unknown): string => {
	if (kind === 'date') return dateOnly ? toDateInput(v) : toLocalInput(v);
	if (v == null) return '';
	return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
};

const base = $derived(toDraft(value));
// biome-ignore lint/style/useConst: reassigned through a binding
let draft = $derived(base);
// biome-ignore lint/style/useConst: reassigned through a binding
let checked = $derived(value === true);

// A value that was sent and refused leaves `base` unchanged; remembering what
// we sent stops the same text being re-sent on every blur.
let lastSent: { base: string; raw: string } | null = null;

function toValue(raw: string): unknown {
	if (isNumber) return raw === '' ? null : Number(raw);
	if (kind === 'date') return dateOnly ? fromDateInput(raw) : fromLocalInput(raw);
	if (kind === 'select') return raw === '' ? null : raw;
	return raw;
}

// `change` fires before `bind:value` has copied the element into `draft`, so
// change handlers pass the element's own value.
function commit(input: unknown = draft) {
	const raw = String(input ?? '');
	const baseline = lastSent && lastSent.base === base ? lastSent.raw : base;
	if (raw.trim() === baseline.trim()) return;
	lastSent = { base, raw };
	oncommit(toValue(raw));
}

function onEnter(e: KeyboardEvent) {
	if (e.key !== 'Enter') return;
	e.preventDefault();
	commit();
}

const common = $derived({
	id,
	'aria-label': label,
	'aria-describedby': describedby,
	'aria-invalid': invalid || undefined,
});
</script>

{#if kind === 'boolean'}
	<label class="bcms-switch">
		<input
			type="checkbox"
			role="switch"
			{...common}
			bind:checked
			onchange={(e) => oncommit(e.currentTarget.checked)}
		/>
		<span class="bcms-switch-track" aria-hidden="true"><span class="bcms-switch-thumb"></span></span>
		<span class="bcms-switch-word">{checked ? 'On' : 'Off'}</span>
	</label>
{:else if kind === 'select'}
	<select class="bcms-input" {...common} bind:value={draft} onchange={(e) => commit(e.currentTarget.value)}>
		<option value="">{field.required ? 'Choose one…' : 'Not set'}</option>
		{#each field.options ?? [] as opt (opt)}
			<option value={opt}>{opt}</option>
		{/each}
	</select>
{:else if kind === 'date'}
	<input
		class="bcms-input"
		type={dateOnly ? 'date' : 'datetime-local'}
		{...common}
		bind:value={draft}
		onchange={(e) => commit(e.currentTarget.value)}
		onblur={() => commit()}
		onkeydown={onEnter}
	/>
{:else if isNumber}
	<input
		class="bcms-input"
		type="number"
		inputmode={kind === 'integer' ? 'numeric' : 'decimal'}
		step={kind === 'integer' ? 1 : 'any'}
		placeholder={field.placeholder}
		{...common}
		bind:value={draft}
		onblur={() => commit()}
		onkeydown={onEnter}
	/>
{:else if multiline}
	<textarea
		class="bcms-input"
		rows="5"
		placeholder={field.placeholder}
		{...common}
		bind:value={draft}
		onblur={() => commit()}
	></textarea>
{:else}
	<input
		class="bcms-input"
		type={isUrl ? 'url' : 'text'}
		inputmode={isUrl ? 'url' : undefined}
		autocapitalize={isUrl || kind === 'slug' ? 'off' : undefined}
		spellcheck={isUrl || kind === 'slug' ? false : undefined}
		placeholder={field.placeholder ?? (isUrl ? 'https://' : undefined)}
		{...common}
		bind:value={draft}
		onblur={() => commit()}
		onkeydown={onEnter}
	/>
{/if}
