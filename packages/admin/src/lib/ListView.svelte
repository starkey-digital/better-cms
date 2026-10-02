<script lang="ts">
import { onMount } from 'svelte';
import { getAdmin } from './context.js';
import { collectionLabel, depluralise, itemName } from './logic/text.js';
import { addLabel, displayValue, recordTitle } from './logic/titles.js';
import { type CmsMetaCollection, type RecordApi, type Row, SYSTEM_FIELDS } from './logic/types.js';

type Props = { name: string; def: CmsMetaCollection };

const PAGE = 25;

const { name, def }: Props = $props();
const { client } = getAdmin();

let rows = $state.raw<Row[]>([]);
let total = $state(0);
let loading = $state(true);
let loadingMore = $state(false);
let failed = $state(false);

const label = $derived(collectionLabel(name, def));
const noun = $derived(itemName(name, def));
const plural = $derived(label.toLowerCase());

// Secondary line: a couple of readable fields that the title doesn't already show.
const detailKeys = $derived(
	Object.entries(def.fields)
		.filter(
			([k, f]) =>
				!SYSTEM_FIELDS.has(k) &&
				!f.hidden &&
				['text', 'select', 'date', 'number', 'integer'].includes(f.kind) &&
				!/url$/i.test(k) &&
				!(def.admin?.title ?? '').includes(k) &&
				def.admin?.title !== k &&
				k !== 'title' &&
				k !== 'name',
		)
		.slice(0, 2)
		.map(([k]) => k),
);

const detail = (r: Row) =>
	detailKeys
		.map((k) => displayValue(def.fields[k], r[k]))
		.filter(Boolean)
		.join(' · ');

async function fetchPage(offset: number) {
	const api = client[name] as RecordApi;
	return api.listPage({ limit: PAGE, offset });
}

onMount(() => {
	void (async () => {
		try {
			const page = await fetchPage(0);
			rows = page.rows;
			total = page.total;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	})();
});

async function more() {
	loadingMore = true;
	try {
		const page = await fetchPage(rows.length);
		rows = [...rows, ...page.rows];
		total = page.total;
	} catch {
		failed = true;
	} finally {
		loadingMore = false;
	}
}
</script>

<header class="bcms-page-head">
	<div class="bcms-page-title">
		<h1>{label}</h1>
		<a class="bcms-btn bcms-btn-primary" href="#/{name}/new">+ {addLabel(name, def)}</a>
	</div>
	{#if def.description}<p class="bcms-lede">{def.description}</p>{/if}
</header>

{#if failed}
	<p class="bcms-note bcms-note-bad">We couldn't load the list. Check your connection and refresh the page.</p>
{/if}

{#if loading}
	<div class="bcms-skel" aria-hidden="true"></div>
{:else if rows.length === 0 && !failed}
	<div class="bcms-empty-card">
		<h2>No {plural} yet. Add the first one.</h2>
		<a class="bcms-btn bcms-btn-primary" href="#/{name}/new">+ {addLabel(name, def)}</a>
	</div>
{:else}
	<p class="bcms-count">{total} {total === 1 ? depluralise(plural) : plural}</p>
	<ul class="bcms-list">
		{#each rows as row (row.id)}
			<li>
				<a class="bcms-row" href="#/{name}/{encodeURIComponent(String(row.id))}">
					<span class="bcms-row-main">
						<strong>{recordTitle(name, def, row)}</strong>
						{#if detail(row)}<small>{detail(row)}</small>{/if}
					</span>
					<span class="bcms-row-go" aria-hidden="true">Edit ›</span>
				</a>
			</li>
		{/each}
	</ul>
	{#if rows.length < total}
		<button type="button" class="bcms-btn bcms-more" disabled={loadingMore} onclick={more}>
			{loadingMore ? 'Loading…' : 'Show more'}
		</button>
	{/if}
{/if}
