export type Described = { alt?: string | null };

const NONE = 'Photo without a description';

/**
 * A label per library item. A description shared by several photos is
 * numbered ("Dancer · 2 of 6") so every option in a picker is distinct; a
 * unique one is left alone. Position among duplicates is the only thing unique
 * by construction — timestamps collide in a batch upload.
 */
export function optionLabels(entries: readonly Described[]): string[] {
	const text = (e: Described) => e.alt?.trim() || NONE;
	const totals = new Map<string, number>();
	for (const e of entries) totals.set(text(e), (totals.get(text(e)) ?? 0) + 1);
	const seen = new Map<string, number>();
	return entries.map((e) => {
		const t = text(e);
		const total = totals.get(t)!;
		if (total < 2) return t;
		const nth = (seen.get(t) ?? 0) + 1;
		seen.set(t, nth);
		return `${t} · ${nth} of ${total}`;
	});
}
