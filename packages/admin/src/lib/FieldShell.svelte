<script lang="ts">
import type { Snippet } from 'svelte';

type Props = {
	id: string;
	label: string;
	description?: string;
	required?: boolean;
	error?: string;
	/** Several controls under one name: rendered as a fieldset. */
	group?: boolean;
	children: Snippet<[describedby: string | undefined]>;
};

const {
	id,
	label,
	description,
	required = false,
	error,
	group = false,
	children,
}: Props = $props();

const helpId = $derived(`${id}-help`);
const errorId = $derived(`${id}-error`);
const describedby = $derived(
	[description ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined,
);
</script>

{#snippet head(tag: 'legend' | 'label')}
	<svelte:element this={tag} class="bcms-label" for={tag === 'label' ? id : undefined}>
		<span>{label}</span>
		{#if required}<span class="bcms-req">Required</span>{/if}
	</svelte:element>
	{#if description}<p class="bcms-help" id={helpId}>{description}</p>{/if}
{/snippet}

{#snippet foot()}
	{#if error}<p class="bcms-field-error" id={errorId}>{error}</p>{/if}
{/snippet}

{#if group}
	<fieldset class="bcms-field bcms-fieldset" class:bcms-field-bad={error} aria-describedby={describedby}>
		{@render head('legend')}
		{@render children(describedby)}
		{@render foot()}
	</fieldset>
{:else}
	<div class="bcms-field" class:bcms-field-bad={error}>
		{@render head('label')}
		{@render children(describedby)}
		{@render foot()}
	</div>
{/if}
