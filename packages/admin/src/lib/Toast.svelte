<script lang="ts">
type Toast = { id: number; text: string; tone: 'ok' | 'bad' };

const { toast }: { toast: Toast | null } = $props();
</script>

{#if toast}
	{#key toast.id}
		<!-- The status strip already announces saves; only other toasts speak. -->
		<div
			class="bcms-toast"
			data-tone={toast.tone}
			role={toast.text === 'Saved' ? undefined : 'status'}
			aria-hidden={toast.text === 'Saved' ? 'true' : undefined}
		>
			{toast.text}
		</div>
	{/key}
{/if}
