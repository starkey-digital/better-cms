<script lang="ts">
import Control from './Control.svelte';
import FieldShell from './FieldShell.svelte';
import ImageField from './ImageField.svelte';
import ObjectField from './ObjectField.svelte';
import RelationField from './RelationField.svelte';
import Repeater from './Repeater.svelte';
import { fieldLabel } from './logic/text.js';
import type { CmsMetaField } from './logic/types.js';

type Props = {
	name: string;
	field: CmsMetaField;
	value: unknown;
	/** Problem with this field as a whole. */
	error?: string;
	/** Problems inside it, keyed relative to this field (`0.url`). */
	errors?: Record<string, string>;
	/** Called when the editor leaves the field with a new value. */
	onchange: (next: unknown) => void;
};

const { name, field, value, error, errors = {}, onchange }: Props = $props();
const uid = $props.id();
const id = $derived(`bcms-${uid}`);

const label = $derived(fieldLabel(name, field));
const kind = $derived(field.kind);
const grouped = $derived(
	kind === 'array' || kind === 'object' || kind === 'image' || kind === 'file',
);
const editable = $derived(kind !== 'richText' && kind !== 'json');
</script>

{#if !field.hidden}
	{#if editable}
		<FieldShell
			{id}
			{label}
			description={field.description}
			required={field.required}
			{error}
			group={grouped}
		>
			{#snippet children(describedby)}
				{#if kind === 'array'}
					<Repeater {name} {field} {value} {errors} {onchange} />
				{:else if kind === 'object'}
					<ObjectField {field} {value} {errors} {onchange} />
				{:else if kind === 'image' || kind === 'file'}
					<ImageField {field} {value} {onchange} />
				{:else if kind === 'relation'}
					<RelationField {field} {value} {id} {describedby} invalid={!!error} oncommit={onchange} />
				{:else}
					<Control
						{name}
						{field}
						{value}
						{id}
						{describedby}
						invalid={!!error}
						oncommit={onchange}
					/>
				{/if}
			{/snippet}
		</FieldShell>
	{:else}
		<FieldShell {id} {label} description={field.description} group>
			<p class="bcms-help">This kind of content can't be edited here yet.</p>
		</FieldShell>
	{/if}
{/if}
