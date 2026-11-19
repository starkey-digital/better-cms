<script lang="ts">
import { onMount, untrack } from 'svelte';
import ConfirmDelete from './ConfirmDelete.svelte';
import FieldEditor from './FieldEditor.svelte';
import StatusStrip from './StatusStrip.svelte';
import { getAdmin } from './context.js';
import { mergeSaved, sameValue, stillPending, stripText } from './logic/autosave.js';
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
const { client, notify, leave } = getAdmin();
const apiOf = () => client[name] as RecordApi;
const status = new SaveStatus();

const manual = $derived(def.admin?.autosave === false);
const publishKey = $derived(def.admin?.publishField);
const fields = $derived(
	Object.entries(def.fields).filter(
		([k, f]) => !SYSTEM_FIELDS.has(k) && !f.hidden && k !== publishKey,
	),
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
// With `admin.autosave: false`, edits wait here (as wire values) until Save.
let pending = $state.raw<Row>({});
// Text still in a field: it only commits on blur, but leaving now would lose it too.
let editing = $state(false);
const unsaved = $derived(Object.keys(pending).length > 0 || editing);
const strip = $derived(stripText(status.state, manual ? { unsaved } : undefined));
const saving = $derived(status.state.pending > 0);
const published = $derived(publishKey ? values[publishKey] === true : false);

const noun = $derived(itemName(name, def));
const missing = $derived(exists ? [] : missingRequired(def.fields, values));
const missingText = $derived(sentenceList(missing.map((k) => fieldLabel(k, def.fields[k]!))));
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
	// The shell asks before a route change or sign-out would drop unsaved edits.
	const mine = () => manual && unsaved;
	leave.unsaved = mine;
	return () => {
		if (leave.unsaved === mine) leave.unsaved = () => false;
	};
});

async function load() {
	const blank = Object.fromEntries(fields.map(([k, f]) => [k, blankValue(f)]));
	// New records start as drafts; the flag is sent even though its switch is hidden.
	if (publishKey) blank[publishKey] = false;
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

// Latest save issued per field, so a slow older response cannot undo a newer edit.
const saveSeq: Record<string, number> = {};
let saveCount = 0;

async function persist(key: string, patch: Row, message = 'Saved'): Promise<boolean> {
	status.start();
	const mine = ++saveCount;
	for (const k of Object.keys(patch)) saveSeq[k] = mine;
	try {
		const row =
			mode === 'singleton' ? await apiOf().set(patch) : await apiOf().update(recordId!, patch);
		values = mergeSaved(values, patch, row, (k) => saveSeq[k] === mine, SYSTEM_FIELDS);
		status.done(key);
		notify(message);
		return true;
	} catch (e) {
		failure(key, e);
		return false;
	}
}

/** Creates the record from `values`; returns what was sent, or null if it wasn't created. */
async function create(message = 'Saved'): Promise<Row | null> {
	if (creating || missingRequired(def.fields, values).length) return null;
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
		notify(message);
		if (mode === 'new') oncreated(recordId);
		// Autosave: fields edited while the create was in flight save now. Manual mode keeps them pending.
		if (!manual)
			for (const [k, f] of fields) {
				const now = toWire(k, f, values[k]);
				if (now != null && !sameValue(now, payload[k])) await persist(k, { [k]: now });
			}
		return payload;
	} catch (e) {
		failure('create', e);
		return null;
	} finally {
		creating = false;
	}
}

async function commit(key: string, next: unknown) {
	editing = false;
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
			// Manual mode: the bad edit still counts as unsaved, so leaving asks first.
			if (manual) {
				editing = true;
				return;
			}
			status.failed(k, `${labelOf(k)}: ${problem}`);
			notify("That didn't save", 'bad');
			return;
		}
		clearErrors(k);
		status.clear(k);
	}
	status.clear('save');
	if (manual) {
		// A save already in flight must not overwrite these newer values when it lands.
		for (const k of Object.keys(patch)) saveSeq[k] = ++saveCount;
		values = { ...values, ...patch };
		pending = { ...pending, ...patch };
		return;
	}
	if (!exists) {
		values = { ...values, ...patch };
		await create();
		return;
	}
	await persist(key, patch);
}

/** Saves waiting edits plus `extra`, creating the record the first time. True once saved. */
async function save(extra: Row = {}, message = 'Saved'): Promise<boolean> {
	// A failed Save leaves a general `save` error; only field errors block retrying.
	clearErrors('save');
	status.clear('save');
	if (Object.keys(errors).length) {
		notify('Fix the fields marked in red first', 'bad');
		return false;
	}
	if (!exists) {
		if (missing.length) {
			notify(`Fill in ${missingText} first`, 'bad');
			return false;
		}
		const before = Object.fromEntries(Object.keys(extra).map((k) => [k, values[k]]));
		values = { ...values, ...extra };
		const sent = await create(message);
		if (!sent) {
			values = { ...values, ...before };
			return false;
		}
		pending = stillPending(pending, sent);
		return true;
	}
	const patch = { ...pending, ...extra };
	if (!Object.keys(patch).length) return true;
	const ok = await persist('save', patch, message);
	if (ok) pending = stillPending(pending, patch);
	return ok;
}

/** Publish saves what's on screen with it; Unpublish only flips the flag, so it is never blocked. */
const setPublished = (on: boolean) =>
	on || !exists
		? save({ [publishKey!]: on }, on ? 'Published' : 'Unpublished')
		: persist('save', { [publishKey!]: false }, 'Unpublished');

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
		{#if publishKey}
			<span class="bcms-badge" data-state={published ? 'published' : 'draft'}>
				{published ? 'Published' : 'Draft'}
			</span>
		{/if}
		{#if viewHref}
			<a class="bcms-btn" href={viewHref} target="_blank" rel="noreferrer">View on site</a>
		{/if}
	</div>
	{#if mode === 'singleton' && def.description}<p class="bcms-lede">{def.description}</p>{/if}
</header>

{#snippet actions()}
	{#if manual}
		<button
			type="button"
			class={['bcms-btn', !publishKey && 'bcms-btn-primary']}
			disabled={saving}
			onclick={() => save()}
		>
			Save
		</button>
	{/if}
	{#if publishKey && published}
		<button type="button" class="bcms-btn bcms-btn-quiet" disabled={saving} onclick={() => setPublished(false)}>
			Unpublish
		</button>
	{:else if publishKey}
		<button type="button" class="bcms-btn bcms-btn-primary" disabled={saving} onclick={() => setPublished(true)}>
			Publish
		</button>
	{/if}
{/snippet}

<StatusStrip
	tone={strip.tone}
	text={strip.text}
	children={(manual || publishKey) && !loading && !loadError ? actions : undefined}
/>

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
			Fill in {missingText} to save this {noun}.
		</p>
	{/if}
	<form
		class="bcms-form"
		novalidate
		onsubmit={(e) => e.preventDefault()}
		oninput={() => {
			if (manual) editing = true;
		}}
	>
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
