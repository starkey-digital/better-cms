<script lang="ts">
import '../app.css';
import { base } from '$app/paths';
import { buildNav } from '$lib/content';
import { type Theme, getTheme, toggleTheme } from '$lib/theme';
import { onMount } from 'svelte';
import type { Snippet } from 'svelte';

const { children }: { children: Snippet } = $props();

const nav = buildNav();
let theme = $state<Theme>('light');

onMount(() => {
	theme = getTheme();
});

function onToggle() {
	theme = toggleTheme();
}
</script>

<div class="grid min-h-screen md:grid-cols-[260px_1fr]">
	<aside
		class="border-b border-zinc-200 p-6 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-r md:border-b-0 dark:border-zinc-800"
	>
		<div class="mb-6 flex items-center justify-between">
			<a
				class="inline-flex items-center gap-2.5 text-lg font-bold text-zinc-900 no-underline dark:text-zinc-100"
				href="{base}/"
				aria-label="better-cms documentation"
			>
				<img src="{base}/logo-mark.svg" alt="" width="32" height="32" class="block h-8 w-8 rounded-md" />
				<span>better-cms</span>
			</a>
			<button
				type="button"
				class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-zinc-200 bg-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
				onclick={onToggle}
				aria-label="Toggle dark mode"
				title="Toggle dark mode"
			>
				{#if theme === 'dark'}
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="12" cy="12" r="4" />
						<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
					</svg>
				{/if}
			</button>
		</div>
		<nav>
			{#each nav as group (group.title)}
				<section class="mb-5">
					<h3 class="mb-2 text-xs font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-500">
						{group.title}
					</h3>
					<ul class="m-0 list-none p-0">
						{#each group.items as item (item.slug)}
							<li class="my-0.5">
								<a
									class="block rounded px-2 py-1 text-sm text-zinc-600 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
									href="{base}/{item.slug}"
								>
									{item.title}
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</nav>
	</aside>
	<main class="max-w-[860px] p-6 md:p-12">
		{@render children()}
	</main>
</div>
