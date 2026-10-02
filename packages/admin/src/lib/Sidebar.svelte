<script lang="ts">
import type { CmsMetaCollection } from '@better-cms/sveltekit';
import { collectionLabel } from './logic/text.js';

type Props = {
	title: string;
	entries: [string, CmsMetaCollection][];
	active: string | null;
	canSignOut: boolean;
	onsignout: () => void;
	onnavigate: () => void;
};

const { title, entries, active, canSignOut, onsignout, onnavigate }: Props = $props();

// Ungrouped first, then each named group in the order it first appears.
const groups = $derived.by(() => {
	const out: [string, [string, CmsMetaCollection][]][] = [];
	for (const entry of entries) {
		const g = entry[1].admin?.group ?? '';
		const hit = out.find(([name]) => name === g);
		if (hit) hit[1].push(entry);
		else out.push([g, [entry]]);
	}
	return out.sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : 0));
});
</script>

<aside class="bcms-sidebar" id="bcms-sidebar">
	<p class="bcms-brand">{title}</p>
	<nav aria-label="Sections">
		{#each groups as [group, items] (group)}
			<div class="bcms-nav-group">
				{#if group}<p class="bcms-nav-heading">{group}</p>{/if}
				{#each items as [name, def] (name)}
					<a
						href="#/{name}"
						class="bcms-nav-link"
						aria-current={active === name ? 'page' : undefined}
						onclick={onnavigate}
					>
						{collectionLabel(name, def)}
					</a>
				{/each}
			</div>
		{/each}
	</nav>
	{#if canSignOut}
		<div class="bcms-sidebar-foot">
			<button type="button" class="bcms-btn" onclick={onsignout}>Sign out</button>
		</div>
	{/if}
</aside>
