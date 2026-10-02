<script lang="ts">
import { tick, untrack } from 'svelte';
import ConfirmDelete from './ConfirmDelete.svelte';
import Control from './Control.svelte';
import FieldEditor from './FieldEditor.svelte';
import { sameValue } from './logic/autosave.js';
import {
	type RepeaterRow,
	addRow,
	isBlankRow,
	markSaved,
	missingCells,
	moveRow,
	removeRow,
	savedRowIds,
	serverErrorFor,
	setRow,
	toRows,
	toValues,
} from './logic/repeater.js';
import { fieldLabel, rowName, sentenceList, withArticle } from './logic/text.js';
import type { CmsMetaField } from './logic/types.js';
import { blankValue, checkValue } from './logic/values.js';

type Props = {
	name: string;
	field: CmsMetaField;
	value: unknown;
	/** Server problems inside the array, keyed `index` or `index.column`. */
	errors: Record<string, string>;
	onchange: (next: unknown) => void;
};

const { name, field, value, errors, onchange }: Props = $props();
const uid = $props.id();

const itemField = $derived(
	field.array?.of ?? ({ kind: 'text', storage: 'column' } as CmsMetaField),
);
const isObjects = $derived(itemField.kind === 'object');
const columns = $derived(
	Object.entries(itemField.object?.fields ?? {}).filter(([, f]) => !f.hidden),
);
const noun = $derived(rowName(field).toLowerCase());
const nounCap = $derived(noun.charAt(0).toUpperCase() + noun.slice(1));

// Seeded once on purpose: row ids are client-only and must outlive saves so
// that editing a cell never makes the row jump or lose focus.
let rows = $state.raw<RepeaterRow[]>(untrack(() => toRows(Array.isArray(value) ? value : [])));
// Row ids in the order of the last array handed to `onchange`: server errors are keyed by that index.
let sentIds = $state.raw<string[]>(untrack(() => savedRowIds(rows)));
let lastSent: unknown[] = untrack(() => toValues(rows));
let cellErrors = $state.raw<Record<string, string>>({});
let askDelete = $state(false);
let doomed = $state<string | null>(null);

const columnFields = $derived(Object.fromEntries(columns));

function save(next: RepeaterRow[]) {
	rows = markSaved(next, columnFields);
	const out = toValues(rows, columnFields);
	// Editing a row that is still held back changes nothing worth saving.
	if (sameValue(out, lastSent)) return;
	lastSent = out;
	sentIds = savedRowIds(rows, columnFields);
	onchange(out);
}

function cellKey(rowId: string, col: string) {
	return `${rowId}.${col}`;
}

function editCell(row: RepeaterRow, col: string | null, sub: CmsMetaField, next: unknown) {
	const key = cellKey(row.id, col ?? '');
	const problem = checkValue(col ?? name, sub, next);
	if (problem) {
		cellErrors = { ...cellErrors, [key]: problem };
		return;
	}
	const { [key]: _cleared, ...rest } = cellErrors;
	cellErrors = rest;
	const updated = col === null ? next : { ...(row.value as Record<string, unknown>), [col]: next };
	save(setRow(rows, row.id, updated));
}

function errorAt(row: RepeaterRow, col: string | null): string | undefined {
	return cellErrors[cellKey(row.id, col ?? '')] ?? serverErrorFor(errors, sentIds, row.id, col);
}

function holdBack(row: RepeaterRow): string | null {
	if (!isObjects || row.saved) return null;
	const missing = missingCells(row, columnFields);
	// A row with nothing in it yet needs no explanation.
	if (!missing.length || isBlankRow(row.value)) return null;
	return `Fill in ${sentenceList(missing.map((k) => fieldLabel(k, columnFields[k]!)))} to save this ${noun}.`;
}

async function add() {
	const blank = isObjects ? blankValue(itemField) : '';
	const next = addRow(rows, blank);
	rows = next;
	await tick();
	const last = next.at(-1);
	document.getElementById(`${uid}-${last?.id}-${columns[0]?.[0] ?? ''}`)?.focus();
}

function ask(row: RepeaterRow) {
	if (isBlankRow(row.value)) {
		save(removeRow(rows, row.id));
		return;
	}
	doomed = row.id;
	askDelete = true;
}
</script>

<div class="bcms-repeater">
	{#if isObjects && rows.length > 0}
		<div class="bcms-rep-head" aria-hidden="true" style:--cols={columns.length}>
			{#each columns as [col, sub] (col)}<span>{fieldLabel(col, sub)}</span>{/each}
			<span></span>
		</div>
	{/if}

	{#if rows.length === 0}
		<p class="bcms-help">Nothing here yet. Add the first {noun} below.</p>
	{/if}

	<ol class="bcms-rep-rows">
		{#each rows as row, i (row.id)}
			{@const rowError = isObjects ? undefined : errorAt(row, null)}
			{@const held = holdBack(row)}
			<li class="bcms-rep-row">
				<div class="bcms-rep-cells" style:--cols={isObjects ? columns.length : 1}>
					{#if isObjects}
						{#each columns as [col, sub] (col)}
							{@const cellId = `${uid}-${row.id}-${col}`}
							{@const err = errorAt(row, col)}
							{@const complex = sub.kind === 'array' || sub.kind === 'object' || sub.kind === 'image' || sub.kind === 'file'}
							<div class="bcms-rep-cell" class:bcms-field-bad={err}>
								{#if complex}
									<FieldEditor
										name={col}
										field={sub}
										value={(row.value as Record<string, unknown>)[col]}
										error={err}
										onchange={(next) => editCell(row, col, sub, next)}
									/>
								{:else}
									<label class="bcms-rep-label" for={cellId}>{fieldLabel(col, sub)}</label>
									<Control
										name={col}
										field={sub}
										value={(row.value as Record<string, unknown>)[col]}
										id={cellId}
										describedby={err ? `${cellId}-error` : undefined}
										invalid={!!err}
										oncommit={(next) => editCell(row, col, sub, next)}
									/>
									{#if err}<p class="bcms-field-error" id="{cellId}-error">{err}</p>{/if}
								{/if}
							</div>
						{/each}
					{:else}
						{@const cellId = `${uid}-${row.id}-`}
						<div class="bcms-rep-cell" class:bcms-field-bad={rowError}>
							<label class="bcms-rep-label bcms-sr" for={cellId}>{nounCap} {i + 1}</label>
							<Control
								{name}
								field={itemField}
								value={row.value}
								id={cellId}
								describedby={rowError ? `${cellId}-error` : undefined}
								invalid={!!rowError}
								oncommit={(next) => editCell(row, null, itemField, next)}
							/>
							{#if rowError}<p class="bcms-field-error" id="{cellId}-error">{rowError}</p>{/if}
						</div>
					{/if}
					{#if held}<p class="bcms-help" style:grid-column="1 / -1">{held}</p>{/if}
				</div>
				<div class="bcms-rep-actions">
					<button
						type="button"
						class="bcms-btn bcms-btn-quiet"
						disabled={i === 0}
						aria-label="Move {noun} {i + 1} up"
						onclick={() => save(moveRow(rows, row.id, -1))}>Up</button
					>
					<button
						type="button"
						class="bcms-btn bcms-btn-quiet"
						disabled={i === rows.length - 1}
						aria-label="Move {noun} {i + 1} down"
						onclick={() => save(moveRow(rows, row.id, 1))}>Down</button
					>
					<button
						type="button"
						class="bcms-btn bcms-btn-danger"
						aria-label="Delete {noun} {i + 1}"
						onclick={() => ask(row)}>Delete</button
					>
				</div>
			</li>
		{/each}
	</ol>

	<button type="button" class="bcms-btn" onclick={add}>+ Add {withArticle(noun)}</button>
</div>

<ConfirmDelete
	bind:open={askDelete}
	heading="Delete this {noun}?"
	onconfirm={() => doomed && save(removeRow(rows, doomed))}
/>
