import { describe, expect, it } from 'vitest';

import { mergeBusyIntervals } from '../freebusy';

describe('mergeBusyIntervals', () => {
	it('merges overlapping and adjacent intervals and sorts output', () => {
		expect(
			mergeBusyIntervals([
				{ start: '2026-08-10T12:00:00Z', end: '2026-08-10T13:00:00Z' },
				{ start: '2026-08-10T09:00:00Z', end: '2026-08-10T10:30:00Z' },
				{ start: '2026-08-10T10:00:00Z', end: '2026-08-10T11:00:00Z' },
				{ start: '2026-08-10T13:00:00Z', end: '2026-08-10T14:00:00Z' },
			]),
		).toEqual([
			{ start: '2026-08-10T09:00:00Z', end: '2026-08-10T11:00:00Z' },
			{ start: '2026-08-10T12:00:00Z', end: '2026-08-10T14:00:00Z' },
		]);
	});

	it('returns empty for no intervals', () => {
		expect(mergeBusyIntervals([])).toEqual([]);
	});

	it('drops zero-length or inverted intervals', () => {
		expect(
			mergeBusyIntervals([
				{ start: '2026-08-10T10:00:00Z', end: '2026-08-10T10:00:00Z' },
				{ start: '2026-08-10T11:00:00Z', end: '2026-08-10T10:00:00Z' },
			]),
		).toEqual([]);
	});
});
