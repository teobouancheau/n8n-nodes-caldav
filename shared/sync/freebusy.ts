import { DateTime } from 'luxon';

export interface BusyInterval {
	start: string;
	end: string;
}

/**
 * Merges overlapping/adjacent busy intervals into a sorted, disjoint list.
 * Output timestamps are normalized to UTC.
 */
export function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
	const normalized = intervals
		.map((interval) => ({
			start: DateTime.fromISO(interval.start, { setZone: true }).toUTC(),
			end: DateTime.fromISO(interval.end, { setZone: true }).toUTC(),
		}))
		.filter((interval) => interval.start.isValid && interval.end.isValid && interval.start < interval.end)
		.sort((a, b) => a.start.toMillis() - b.start.toMillis());

	const merged: { start: DateTime; end: DateTime }[] = [];
	for (const interval of normalized) {
		const last = merged[merged.length - 1];
		if (last && interval.start <= last.end) {
			if (interval.end > last.end) last.end = interval.end;
		} else {
			merged.push({ ...interval });
		}
	}
	return merged.map((interval) => {
		const start = interval.start.toISO({ suppressMilliseconds: true });
		const end = interval.end.toISO({ suppressMilliseconds: true });
		if (start === null || end === null) throw new Error('Could not format busy interval');
		return { start, end };
	});
}
