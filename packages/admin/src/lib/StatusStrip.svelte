<script lang="ts">
import type { Snippet } from 'svelte';
import type { StripTone } from './logic/autosave.js';

const { tone, text, children }: { tone: StripTone; text: string; children?: Snippet } = $props();
</script>

<div class="bcms-strip" data-tone={tone}>
	<span class="bcms-strip-dot" aria-hidden="true"></span>
	<span role="status" aria-live="polite">{text}</span>
	{#if children}<div class="bcms-strip-actions">{@render children()}</div>{/if}
</div>
