<script lang="ts">
import FieldEditor from './FieldEditor.svelte';
import { errorFor, errorsWithin } from './logic/errors.js';
import type { CmsMetaField } from './logic/types.js';

type Props = {
	field: CmsMetaField;
	value: unknown;
	errors: Record<string, string>;
	onchange: (next: unknown) => void;
};

const { field, value, errors, onchange }: Props = $props();

const current = $derived(
	(value && typeof value === 'object' ? value : {}) as Record<string, unknown>,
);
const entries = $derived(Object.entries(field.object?.fields ?? {}).filter(([, f]) => !f.hidden));
</script>

<div class="bcms-object">
	{#each entries as [key, sub] (key)}
		<FieldEditor
			name={key}
			field={sub}
			value={current[key]}
			errors={errorsWithin(errors, key)}
			error={errorFor(errors, key)}
			onchange={(next) => onchange({ ...current, [key]: next })}
		/>
	{/each}
</div>
