<script lang="ts">
import { onMount, untrack } from 'svelte';
import ConfirmDelete from './ConfirmDelete.svelte';
import FieldEditor from './FieldEditor.svelte';
import StatusStrip from './StatusStrip.svelte';
import { getAdmin } from './context.js';
import { sameValue } from './logic/autosave.js';
import { errorFor, errorsWithin, failureReason, parseServerError } from './logic/errors.js';
import { slugify } from './logic/slug.js';
import { collectionLabel, fieldLabel, itemName, sentenceList } from './logic/text.js';
import { addLabel, previewHref, recordTitle } from './logic/titles.js';
import {
	type CmsMetaCollection,
	type CmsMetaField,
	type RecordApi,
	type Row,
	SYSTEM_FIELDS,
} from './logic/types.js';
import {
	blankValue,
	checkValue,
	isEmpty,
	missingRequired,
	toCreatePayload,
	toWire,
} from './logic/values.js';
import { SaveStatus } from './save-status.svelte.js';

type Props = {
	name: string;
	def: CmsMetaCollection;
	mode: 'new' | 'edit' | 'singleton';
	id?: string;
	/** A new record was created; the shell moves the address bar to it without remounting. */
	oncreated: (id: string) => void;
	ondeleted: () => void;
};

const { name, def, mode, id, oncreated, ondeleted }: Props = $props();
const { client, notify } = getAdmin();
const apiOf = () => client[name] as RecordApi;
const status = new SaveStatus();

const fields = $derived(
	Object.entries(def.fields).filter(([k, f]) => !SYSTEM_FIELDS.has(k) && !f.hidden),
);
const slugKey = $derived(fields.find(([, f]) => f.kind === 'slug')?.[0]);
const sourceKey = $derived(
	slugKey
		? (['title', 'name', 'headline'].find((k) => def.fields[k]?.kind === 'text') ??
				fields.find(([k, f]) => f.kind === 'text' && f.required && k !== slugKey)?.[0])
		: undefined,
);

let values = $state.raw<Row>({});
let errors = $state.raw<Record<string, string>>({});
let recordId = $state<string | null>(untrack(() => id ?? null));
let exists = $state(untrack(() => mode === 'edit'));
let loading = $state(true);
let loadError = $state(false);
let askDelete = $state(false);
let creating = false;

const noun = $derived(itemName(name, def));
const missing = $derived(exists ? [] : missingRequired(def.fields, values));
const heading = $derived(
	mode === 'singleton'
		? collectionLabel(name, def)
		: exists
			? recordTitle(name, def, values)
			: addLabel(name, def),
);
const viewHref = $derived(exists ? previewHref(def, values) : null);

onMount(() => {
	void load();
});

async function load() {
	const blank = Object.fromEntries(fields.map(([k, f]) => [k, blankValue(f)]));
	try {
		if (mode === 'new') {
			values = blank;
		} else {
			const row = mode === 'singleton' ? await apiOf().get() : await apiOf().get(id);
			if (row) {
				exists = true;
				recordId = String(row.id);
			} else if (mode === 'edit') {
				loadError = true;
			}
			values = { ...blank, ...row };
		}
	} catch {
		loadError = true;
	} finally {
		loading = false;
	}
}

const labelOf = (path: string) => {
	const key = path.split('.')[0]!;
	const f = def.fields[key];
	return f ? fieldLabel(key, f) : key;
};

function setErrors(next: Record<string, string>) {
	errors = next;
}

function clearErrors(key: string) {
	setErrors(
		Object.fromEntries(
			Object.entries(errors).filter(([k]) => k !== key && !k.startsWith(`${key}.`)),
		),
	);
}

function failure(key: string, e: unknown) {
	const parsed = parseServerError((e as Error)?.message ?? '', name);
	const fieldErrors = { ...parsed.fields };
	if (!Object.keys(fieldErrors).length && key !== 'create') {
		fieldErrors[key] = `Couldn't save — ${parsed.general ?? 'something went wrong'}`;
	}
	setErrors({ ...errors, ...fieldErrors });
	status.failed(key, failureReason(parsed, labelOf));
	notify("That didn't save", 'bad');
}

async function persist(key: string, patch: Row) {
	status.start();
	try {
		const row =
			mode === 'singleton' ? await apiOf().set(patch) : await apiOf().update(recordId!, patch);
		values = { ...values, ...patch, ...row };
		status.done(key);
		notify('Saved');
	} catch (e) {
		failure(key, e);
	}
}

async function create() {
	if (creating || missingRequired(def.fields, values).length) return;
	creating = true;
	status.start();
	const payload = toCreatePayload(def.fields, values);
	try {
		const row = mode === 'singleton' ? await apiOf().set(payload) : await apiOf().create(payload);
		values = { ...row, ...values };
		exists = true;
		recordId = String(row.id);
		setErrors({});
		status.done('create');
		notify('Saved');
		if (mode === 'new') oncreated(recordId);
		for (const [k, f] of fields) {
			const now = toWire(k, f, values[k]);
			if (now != null && !sameValue(now, payload[k])) await persist(k, { [k]: now });
		}
	} catch (e) {
		failure('create', e);
	} finally {
		creating = false;
	}
}

async function commit(key: string, next: unknown) {
	const patch: Row = { [key]: toWire(key, def.fields[key]!, next) };
	if (slugKey && key === sourceKey) {
		const current = values[slugKey];
		if (isEmpty(current) || current === slugify(String(values[key] ?? ''))) {
			patch[slugKey] = slugify(String(next ?? '')) || null;
		}
	}
	for (const [k, v] of Object.entries(patch)) {
		const problem = checkValue(k, def.fields[k]!, v);
		if (problem) {
			setErrors({ ...errors, [k]: problem });
			status.failed(k, `${labelOf(k)}: ${problem}`);
			notify("That didn't save", 'bad');
			return;
		}
		clearErrors(k);
		status.clear(k);
	}
	if (!exists) {
		values = { ...values, ...patch };
		await create();
		return;
	}
	await persist(key, patch);
}

async function remove() {
	try {
		await apiOf().delete(recordId!);
		notify('Deleted');
		ondeleted();
	} catch (e) {
		failure('delete', e);
	}
}

const shown = (f: CmsMetaField) =>
	f.kind === 'slug' && !f.description
		? { ...f, description: 'Part of the web address. Filled in for you from the title.' }
		: f;
</script>

<header class="bcms-page-head">
	{#if mode !== 'singleton'}
		<nav class="bcms-crumbs" aria-label="Breadcrumb">
			<a href="#/{name}">{collectionLabel(name, def)}</a>
			<span aria-hidden="true">›</span>
			<span>{heading}</span>
		</nav>
	{/if}
	<div class="bcms-page-title">
		<h1>{heading}</h1>
		{#if viewHref}
			<a class="bcms-btn" href={viewHref} target="_blank" rel="noreferrer">View on site</a>
		{/if}
	</div>
	{#if mode === 'singleton' && def.description}<p class="bcms-lede">{def.description}</p>{/if}
</header>

<StatusStrip tone={status.strip.tone} text={status.strip.text} />

{#if loading}
	<div class="bcms-skel" aria-hidden="true"></div>
{:else if loadError}
	<div class="bcms-empty-card">
		<h2>We couldn't open that {noun}</h2>
		<p>It may have been deleted.</p>
		<a class="bcms-btn bcms-btn-primary" href="#/{name}">Back to {collectionLabel(name, def)}</a>
	</div>
{:else}
	{#if missing.length}
		<p class="bcms-note">
			Fill in {sentenceList(missing.map((k) => fieldLabel(k, def.fields[k]!)))} to save this {noun}.
		</p>
	{/if}
	<form class="bcms-form" novalidate onsubmit={(e) => e.preventDefault()}>
		{#each fields as [key, f] (key)}
			<FieldEditor
				name={key}
				field={shown(f)}
				value={values[key]}
				error={errorFor(errors, key)}
				errors={errorsWithin(errors, key)}
				onchange={(next) => commit(key, next)}
			/>
		{/each}
	</form>
	{#if mode === 'edit' && exists}
		<div class="bcms-danger-zone">
			<button type="button" class="bcms-btn bcms-btn-danger" onclick={() => (askDelete = true)}>
				Delete this {noun}
			</button>
		</div>
		<ConfirmDelete bind:open={askDelete} heading="Delete this {noun}?" onconfirm={remove} />
	{/if}
{/if}
