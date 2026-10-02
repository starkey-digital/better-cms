<script lang="ts">
import {
	type Box,
	type Shape,
	type Size,
	clampBox,
	fitWithin,
	largestBox,
	scaleBox,
	sizeLabel,
} from './crop.js';
import { isHeic, prepareImage } from './encode.js';

type Props = {
	file: File;
	shapes: Shape[];
	maxSize: number;
	/** Called when the photo cannot be shown, with a sentence for the editor. */
	onerror: (message: string) => void;
	/** Called once the photo is loaded and the box is placed. */
	onready?: () => void;
};

const { file, shapes, maxSize, onerror, onready }: Props = $props();

let natural = $state<Size>({ width: 0, height: 0 });
let box = $state<Box>({ x: 0, y: 0, width: 0, height: 0 });
let shapeId = $state<string | null>(null);

const shape = $derived(shapes.find((s) => s.id === shapeId) ?? shapes[0]!);
const ratio = $derived(shape.ratio);
const output = $derived(natural.width ? fitWithin(box, maxSize) : null);

// The parent keys this component on the file, so one object URL lives per mount.
const objectUrl = $derived(URL.createObjectURL(file));
$effect(() => {
	const url = objectUrl;
	return () => URL.revokeObjectURL(url);
});

function loaded(event: Event) {
	const img = event.currentTarget as HTMLImageElement;
	natural = { width: img.naturalWidth, height: img.naturalHeight };
	box = largestBox(natural, ratio);
	onready?.();
}

function failed() {
	onerror(
		isHeic(file)
			? 'This browser cannot open that kind of iPhone photo (HEIC). Try Safari, or on the iPhone go to Settings, Camera, Formats and choose Most Compatible, then take the photo again.'
			: 'That file could not be opened as a photo. Please choose a JPEG, PNG or WebP picture.',
	);
}

function chooseShape(id: string) {
	shapeId = id;
	const next = shapes.find((s) => s.id === id);
	if (natural.width && next) box = largestBox(natural, next.ratio);
}

// Plain (non-reactive) gesture bookkeeping; only `box` drives the UI.
let pointers: { id: number; x: number; y: number }[] = [];
let scale = 1;
let gesture: { box: Box; at: { x: number; y: number }; dist: number } | null = null;

const distance = () => {
	const [a, b] = pointers;
	return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};
const centre = () => ({
	x: pointers.reduce((s, p) => s + p.x, 0) / pointers.length,
	y: pointers.reduce((s, p) => s + p.y, 0) / pointers.length,
});
function restart() {
	gesture = pointers.length ? { box: { ...box }, at: centre(), dist: distance() } : null;
}
function track(event: PointerEvent) {
	pointers = [
		...pointers.filter((p) => p.id !== event.pointerId),
		{ id: event.pointerId, x: event.clientX, y: event.clientY },
	];
}

function down(event: PointerEvent) {
	if (!natural.width) return;
	const stage = event.currentTarget as HTMLElement;
	stage.setPointerCapture(event.pointerId);
	// Source pixels per on-screen pixel, read per gesture: it changes on resize and rotation.
	scale = natural.width / (stage.clientWidth || 1);
	track(event);
	restart();
}

function move(event: PointerEvent) {
	if (!gesture || !pointers.some((p) => p.id === event.pointerId)) return;
	track(event);
	const at = centre();
	let next = gesture.box;
	// Two fingers pinch: the box shrinks as they spread, like zooming the photo in.
	if (pointers.length > 1 && gesture.dist > 0) {
		next = scaleBox(gesture.box, gesture.dist / (distance() || 1), natural, ratio);
	}
	box = clampBox(
		{
			...next,
			x: next.x + (at.x - gesture.at.x) * scale,
			y: next.y + (at.y - gesture.at.y) * scale,
		},
		natural,
	);
}

function up(event: PointerEvent) {
	pointers = pointers.filter((p) => p.id !== event.pointerId);
	restart();
}

function nudge(event: KeyboardEvent) {
	const step = (event.shiftKey ? 50 : 10) * Math.max(1, natural.width / 1000);
	const by: Record<string, [number, number]> = {
		ArrowLeft: [-step, 0],
		ArrowRight: [step, 0],
		ArrowUp: [0, -step],
		ArrowDown: [0, step],
	};
	if (event.key === '+' || event.key === '=') return zoom(0.9, event);
	if (event.key === '-' || event.key === '_') return zoom(1.1, event);
	const delta = by[event.key];
	if (!delta) return;
	event.preventDefault();
	box = clampBox({ ...box, x: box.x + delta[0], y: box.y + delta[1] }, natural);
}

function zoom(factor: number, event?: Event) {
	event?.preventDefault();
	box = scaleBox(box, factor, natural, ratio);
}

/** Crop and downscale; resolves to the file to upload. */
export function apply(): Promise<File> {
	return prepareImage(file, natural, box, maxSize);
}
</script>

<div class="bcms-crop">
	<p class="bcms-crop-hint" id="bcms-crop-hint">
		Drag the box to choose what to keep. Use the zoom buttons, or pinch, to make it bigger or
		smaller. With the keyboard, use the arrow keys to move it and plus and minus to zoom.
	</p>

	{#if shapes.length > 1}
		<fieldset class="bcms-crop-shapes">
			<legend>Shape</legend>
			{#each shapes as s (s.id)}
				<label class="bcms-crop-shape">
					<input
						type="radio"
						form="bcms-media-none"
						name="bcms-crop-shape"
						value={s.id}
						checked={s.id === shape.id}
						onchange={() => chooseShape(s.id)}
					/>
					<span>{s.label}</span>
				</label>
			{/each}
		</fieldset>
	{:else if shape.ratio}
		<p class="bcms-crop-fixed">Shape: <strong>{shape.label}</strong></p>
	{/if}

	<div class="bcms-crop-stage" role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
		<img class="bcms-crop-photo" src={objectUrl} alt="" onload={loaded} onerror={failed} draggable="false" />
		{#if natural.width}
			<button
				type="button"
				class="bcms-crop-box"
				aria-label="Crop area"
				aria-describedby="bcms-crop-hint"
				style:left="{(box.x / natural.width) * 100}%"
				style:top="{(box.y / natural.height) * 100}%"
				style:width="{(box.width / natural.width) * 100}%"
				style:height="{(box.height / natural.height) * 100}%"
				onkeydown={nudge}
			></button>
		{/if}
	</div>

	<div class="bcms-crop-foot">
		<div class="bcms-crop-zoom">
			<button class="bcms-btn bcms-btn-ghost" type="button" onclick={() => zoom(1.1)}>Zoom out</button>
			<button class="bcms-btn bcms-btn-ghost" type="button" onclick={() => zoom(0.9)}>Zoom in</button>
		</div>
		{#if output}
			<span class="bcms-crop-size" aria-live="polite">Saved at {sizeLabel(output)}</span>
		{/if}
	</div>
</div>

<style>
	.bcms-crop {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}
	.bcms-crop-hint {
		margin: 0;
		font-size: var(--bcms-text-sm);
		color: var(--bcms-muted);
	}
	.bcms-crop-shapes {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.bcms-crop-shapes legend {
		padding: 0;
		margin-bottom: 6px;
		font-size: var(--bcms-text-sm);
		font-weight: 500;
		color: var(--bcms-fg-soft);
	}
	.bcms-crop-shape {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 14px;
		border: 1.5px solid var(--bcms-border);
		border-radius: 999px;
		font-size: var(--bcms-text-sm);
		cursor: pointer;
	}
	.bcms-crop-shape:has(input:checked) {
		border-color: var(--bcms-primary);
		background-color: var(--bcms-subtle);
		font-weight: 600;
	}
	.bcms-crop-shape:has(input:focus-visible) {
		outline: 2px solid var(--bcms-ring);
		outline-offset: 2px;
	}
	.bcms-crop-shape input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.bcms-crop-fixed {
		margin: 0;
		font-size: var(--bcms-text-sm);
		color: var(--bcms-fg-soft);
	}
	.bcms-crop-stage {
		position: relative;
		align-self: center;
		max-width: 100%;
		line-height: 0;
		overflow: hidden;
		touch-action: none;
		user-select: none;
		background-color: var(--bcms-subtle);
		border-radius: var(--bcms-radius-sm);
	}
	.bcms-crop-photo {
		display: block;
		max-width: 100%;
		max-height: 46dvh;
		pointer-events: none;
	}
	.bcms-crop-box {
		position: absolute;
		padding: 0;
		cursor: move;
		background: transparent;
		border: 2px solid #fff;
		box-shadow: 0 0 0 9999px rgb(15 23 42 / 0.55);
		touch-action: none;
	}
	.bcms-crop-box:focus-visible {
		outline: 3px solid var(--bcms-ring);
		outline-offset: 1px;
	}
	.bcms-crop-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.bcms-crop-zoom {
		display: flex;
		gap: 8px;
	}
	.bcms-crop-size {
		font-size: var(--bcms-text-xs);
		color: var(--bcms-muted);
	}
</style>
