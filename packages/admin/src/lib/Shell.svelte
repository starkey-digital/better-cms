<script lang="ts">
import type { CmsMeta } from '@better-cms/sveltekit';
import ListView from './ListView.svelte';
import RecordForm from './RecordForm.svelte';
import Sidebar from './Sidebar.svelte';
import Toast from './Toast.svelte';
import { type ToastTone, setAdmin } from './context.js';
import type { AdminClient } from './logic/types.js';
import type { Route } from './route.js';

type Props = {
	client: AdminClient;
	meta: CmsMeta;
	route: Route;
	title: string;
	canSignOut: boolean;
	error: string | null;
	navigate: (path: string, replace?: boolean) => void;
	onsignout: () => void;
};

const { client, meta, route, title, canSignOut, error, navigate, onsignout }: Props = $props();

setAdmin({
	get client() {
		return client;
	},
	get meta() {
		return meta;
	},
	notify,
});

// biome-ignore lint/style/useConst: reassigned through a binding
let navOpen = $state(false);
let toast = $state<{ id: number; text: string; tone: ToastTone } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastId = 0;
// A record the user just created keeps its form (and their focus) when the
// address changes from /new to /<id>.
let adopted = $state<string | null>(null);

function notify(text: string, tone: ToastTone = 'ok') {
	clearTimeout(toastTimer);
	toast = { id: ++toastId, text, tone };
	toastTimer = setTimeout(() => {
		toast = null;
	}, 2600);
}

const entries = $derived(Object.entries(meta.collections));
const active = $derived(route.kind === 'home' ? null : route.name);
const def = $derived(route.kind === 'home' ? undefined : meta.collections[route.name]);
const formKey = $derived(
	route.kind === 'new' || (route.kind === 'edit' && adopted === route.id)
		? 'new'
		: route.kind === 'edit'
			? route.id
			: 'singleton',
);

function created(id: string) {
	adopted = id;
	if (route.kind === 'new') navigate(`${route.name}/${encodeURIComponent(id)}`, true);
}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (navOpen = false)} />

<div class="bcms bcms-shell">
	<input type="checkbox" id="bcms-nav-toggle" class="bcms-nav-toggle" bind:checked={navOpen} aria-label="Show the menu" />
	<header class="bcms-topbar">
		<label for="bcms-nav-toggle" class="bcms-menu-btn">Menu</label>
		<span class="bcms-topbar-title">{title}</span>
	</header>
	<label for="bcms-nav-toggle" class="bcms-scrim" aria-hidden="true"></label>
	<Sidebar {title} {entries} {active} {canSignOut} {onsignout} onnavigate={() => (navOpen = false)} />

	<main class="bcms-main">
		{#if error}<p class="bcms-note bcms-note-bad">{error}</p>{/if}
		{#if route.kind === 'home' || !def}
			<div class="bcms-empty-card">
				<h2>Nothing to edit yet</h2>
				<p>Add a collection to your site's content setup and it will show up here.</p>
			</div>
		{:else if route.kind === 'list'}
			{#key route.name}
				<ListView name={route.name} {def} />
			{/key}
		{:else}
			{#key `${route.name}/${formKey}`}
				<RecordForm
					name={route.name}
					{def}
					mode={route.kind === 'singleton' ? 'singleton' : route.kind === 'new' ? 'new' : 'edit'}
					id={route.kind === 'edit' ? route.id : undefined}
					oncreated={created}
					ondeleted={() => navigate(route.name)}
				/>
			{/key}
		{/if}
	</main>
	<Toast {toast} />
</div>
