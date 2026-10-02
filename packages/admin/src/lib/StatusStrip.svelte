<script lang="ts">
import type { StripTone } from './logic/autosave.js';

const { tone, text }: { tone: StripTone; text: string } = $props();
</script>

<div class="bcms-strip" data-tone={tone} role="status" aria-live="polite">
	<span class="bcms-strip-dot" aria-hidden="true"></span>
	<span>{text}</span>
</div>
