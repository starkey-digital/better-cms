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
const { client, notify } = getAdmin();
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
const unsaved = $derived(Object.keys(pending).length > 0);
const strip = $derived(stripText(status.state, manual ? { unsaved } : undefined));
const saving = $derived(status.state.pending > 0);
const published = $derived(publishKey ? values[publishKey] === true : false);

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

async function create(message = 'Saved'): Promise<boolean> {
	if (creating || missingRequired(def.fields, values).length) return false;
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
		for (const [k, f] of fields) {
			const now = toWire(k, f, values[k]);
			if (now != null && !sameValue(now, payload[k])) await persist(k, { [k]: now });
		}
		return true;
	} catch (e) {
		failure('create', e);
		return false;
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
			if (manual) return;
			status.failed(k, `${labelOf(k)}: ${problem}`);
			notify("That didn't save", 'bad');
			return;
		}
		clearErrors(k);
		status.clear(k);
	}
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
	if (Object.keys(errors).length) {
		notify('Fix the fields marked in red first', 'bad');
		return false;
	}
	if (!exists) {
		const gaps = missingRequired(def.fields, values);
		if (gaps.length) {
			notify(
				`Fill in ${sentenceList(gaps.map((k) => fieldLabel(k, def.fields[k]!)))} first`,
				'bad',
			);
			return false;
		}
		const before = values;
		values = { ...values, ...extra };
		if (!(await create(message))) {
			values = before;
			return false;
		}
		pending = {};
		return true;
	}
	const patch = { ...pending, ...extra };
	if (!Object.keys(patch).length) return true;
	const ok = await persist('save', patch, message);
	if (ok) pending = stillPending(pending, patch);
	return ok;
}

const setPublished = (on: boolean) => save({ [publishKey!]: on }, on ? 'Published' : 'Unpublished');

/** In-admin links would drop unsaved edits without a word, so ask first. */
function guardLeave(e: MouseEvent) {
	if (!unsaved || !(e.target instanceof Element) || !e.target.closest('a[href^="#"]')) return;
	if (!confirm('Leave without saving? Your changes will be lost.')) e.preventDefault();
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

<svelte:window onbeforeunload={(e) => unsaved && e.preventDefault()} />
<svelte:document onclickcapture={guardLeave} />

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

{#if (manual || publishKey) && !loading && !loadError}
	<StatusStrip tone={strip.tone} text={strip.text}>
		{#if manual}
			<button
				type="button"
				class={['bcms-btn', !publishKey && 'bcms-btn-primary']}
				disabled={saving || (exists && !unsaved)}
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
	</StatusStrip>
{:else}
	<StatusStrip tone={strip.tone} text={strip.text} />
{/if}

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
