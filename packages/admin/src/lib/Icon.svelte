<script lang="ts" module>
const paths = {
	up: 'M6 15l6-6 6 6',
	down: 'M6 9l6 6 6-6',
	delete: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
	'zoom-in': 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM16 16l4 4M11 8v6M8 11h6',
	'zoom-out': 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM16 16l4 4M8 11h6',
};

export type IconName = keyof typeof paths;
</script>

<script lang="ts">
// Decorative: the button around it carries the accessible name.
const { name }: { name: IconName } = $props();
</script>

<svg class="bcms-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>
