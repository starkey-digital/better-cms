<script lang="ts">
import type { Attachment } from 'svelte/attachments';

type Props = {
	open: boolean;
	heading: string;
	body?: string;
	confirmLabel?: string;
	onconfirm: () => void;
};

let {
	open = $bindable(),
	heading,
	body = "This can't be undone.",
	confirmLabel = 'Yes, delete',
	onconfirm,
}: Props = $props();
const uid = $props.id();

// A native modal <dialog> traps focus, makes the page behind inert and
// returns focus to the button that opened it when it closes.
const modal: Attachment<HTMLDialogElement> = (dialog) => {
	if (open && !dialog.open) dialog.showModal();
	if (!open && dialog.open) dialog.close();
};
</script>

<dialog class="bcms-dialog" {@attach modal} onclose={() => (open = false)} aria-labelledby="{uid}-title">
	<h2 id="{uid}-title">{heading}</h2>
	<p>{body}</p>
	<div class="bcms-dialog-actions">
		<!-- svelte-ignore a11y_autofocus -->
		<button type="button" class="bcms-btn bcms-btn-primary" autofocus onclick={() => (open = false)}>
			No, keep it
		</button>
		<button
			type="button"
			class="bcms-btn bcms-btn-danger"
			onclick={() => {
				open = false;
				onconfirm();
			}}
		>
			{confirmLabel}
		</button>
	</div>
</dialog>
