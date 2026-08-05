import { describe, expect, it } from 'vitest';

import { diffEtagMaps, instanceKey, windowEvents } from '../diff';

describe('diffEtagMaps', () => {
	it('buckets created, updated, and deleted hrefs', () => {
		const previous = { '/cal/a.ics': 'e1', '/cal/b.ics': 'e2', '/cal/c.ics': 'e3' };
		const current = { '/cal/a.ics': 'e1', '/cal/b.ics': 'e2-new', '/cal/d.ics': 'e4' };
		expect(diffEtagMaps(previous, current)).toEqual({
			created: ['/cal/d.ics'],
			updated: ['/cal/b.ics'],
			deleted: ['/cal/c.ics'],
		});
	});

	it('returns empty buckets when nothing changed', () => {
		const map = { '/cal/a.ics': 'e1' };
		expect(diffEtagMaps(map, { ...map })).toEqual({ created: [], updated: [], deleted: [] });
	});

	it('treats everything as created on first poll', () => {
		expect(diffEtagMaps({}, { '/cal/a.ics': 'e1' })).toEqual({
			created: ['/cal/a.ics'],
			updated: [],
			deleted: [],
		});
	});
});

describe('instanceKey', () => {
	it('builds stable keys', () => {
		expect(instanceKey('uid-1', '2026-08-10T09:00:00+02:00', 'started')).toBe(
			'uid-1:2026-08-10T09:00:00+02:00:started',
		);
	});
});

describe('windowEvents', () => {
	const instances = [
		{ start: '2026-08-10T09:00:00Z', end: '2026-08-10T10:00:00Z', key: 'a' },
		{ start: '2026-08-10T11:00:00Z', end: '2026-08-10T12:00:00Z', key: 'b' },
		{ start: '2026-08-10T13:00:00Z', key: 'c' },
	];

	it('returns keys whose start falls within [from, to) for started', () => {
		expect(
			windowEvents(instances, '2026-08-10T09:00:00Z', '2026-08-10T11:00:00Z', 'started', new Set()),
		).toEqual(['a']);
	});

	it('returns keys whose end falls within [from, to) for ended', () => {
		expect(
			windowEvents(instances, '2026-08-10T10:00:00Z', '2026-08-10T12:30:00Z', 'ended', new Set()),
		).toEqual(['a', 'b']);
	});

	it('skips instances without an end for ended', () => {
		expect(
			windowEvents(instances, '2026-08-10T00:00:00Z', '2026-08-11T00:00:00Z', 'ended', new Set()),
		).toEqual(['a', 'b']);
	});

	it('dedupes already-emitted keys', () => {
		expect(
			windowEvents(instances, '2026-08-10T00:00:00Z', '2026-08-11T00:00:00Z', 'started', new Set(['b'])),
		).toEqual(['a', 'c']);
	});
});
