const pad = (n: number) => String(n).padStart(2, '0');

const toDate = (v: unknown): Date | null => {
	if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
	if (typeof v === 'string' || typeof v === 'number') {
		const d = new Date(v);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	return null;
};

/** Calendar date for `<input type=date>`, read in UTC so it never shifts a day. */
export function toDateInput(v: unknown): string {
	if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
	const d = toDate(v);
	return d ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : '';
}

export const fromDateInput = (s: string): string | null => (s ? s : null);

/** Local wall-clock time for `<input type=datetime-local>`. */
export function toLocalInput(v: unknown): string {
	const d = toDate(v);
	if (!d) return '';
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The instant a local `datetime-local` string means, as ISO. */
export function fromLocalInput(s: string): string | null {
	if (!s) return null;
	const d = new Date(s);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const noWeekdayComma = (s: string) => s.replace(/^(\w+),/, '$1');

export function formatDate(v: unknown, dateOnly: boolean): string {
	const d = toDate(v);
	if (!d) return '';
	if (dateOnly) {
		return noWeekdayComma(
			new Intl.DateTimeFormat('en-GB', {
				weekday: 'short',
				day: 'numeric',
				month: 'short',
				year: 'numeric',
				timeZone: 'UTC',
			}).format(d),
		);
	}
	const day = noWeekdayComma(
		new Intl.DateTimeFormat('en-GB', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric',
		}).format(d),
	);
	const time = new Intl.DateTimeFormat('en-GB', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	})
		.format(d)
		.replace(/\s/g, '')
		.toLowerCase();
	return `${day}, ${time}`;
}

/** "2:14pm" */
export function clockTime(d: Date): string {
	const h = d.getHours();
	return `${h % 12 || 12}:${pad(d.getMinutes())}${h < 12 ? 'am' : 'pm'}`;
}
