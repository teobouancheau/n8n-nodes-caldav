import { describe, expect, it } from 'vitest';

import { RECURRING_WITH_OVERRIDE, SIMPLE_EVENT } from './fixtures';
import { buildEventIcs } from '../build';
import { parseEvents } from '../parse';
import { expandEvent } from '../recurrence';

describe('expandEvent', () => {
	it('expands a weekly rule inside the window, honoring EXDATE and overrides', () => {
		const events = parseEvents(RECURRING_WITH_OVERRIDE);
		const master = events.find((e) => !e.recurrenceId)!;
		// Window: Aug 1 - Aug 31 2026. Mondays: 3, 10 (overridden), 17 (EXDATE), 24, 31.
		const instances = expandEvent(master, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z');
		expect(instances.map((i) => i.start)).toEqual([
			'2026-08-03T09:00:00+02:00',
			'2026-08-10T10:00:00+02:00', // override moved it one hour later
			'2026-08-24T09:00:00+02:00',
			'2026-08-31T09:00:00+02:00',
		]);
		const moved = instances[1];
		expect(moved.master.summary).toBe('Weekly standup (moved)');
		expect(moved.recurrenceId).toBe('2026-08-10T09:00:00+02:00');
	});

	it('keeps local time across a DST boundary', () => {
		const ics = buildEventIcs({
			uid: 'dst-1@example.com',
			summary: 'Daily checkin',
			start: '2026-10-23T09:00:00+02:00',
			end: '2026-10-23T09:15:00+02:00',
			allDay: false,
			timezone: 'Europe/Paris',
			rrule: 'FREQ=DAILY;COUNT=5',
			exdates: [],
			attendees: [],
			alarms: [],
			categories: [],
		});
		const [event] = parseEvents(ics);
		const instances = expandEvent(event, '2026-10-23T00:00:00Z', '2026-10-28T00:00:00Z');
		// DST ends Oct 25 2026 in Europe/Paris; wall-clock time must stay 09:00.
		expect(instances.map((i) => i.start)).toEqual([
			'2026-10-23T09:00:00+02:00',
			'2026-10-24T09:00:00+02:00',
			'2026-10-25T09:00:00+01:00',
			'2026-10-26T09:00:00+01:00',
			'2026-10-27T09:00:00+01:00',
		]);
	});

	it('returns a single instance for non-recurring events inside the window', () => {
		const [event] = parseEvents(SIMPLE_EVENT);
		const instances = expandEvent(event, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z');
		expect(instances).toHaveLength(1);
		expect(instances[0].start).toBe('2026-08-15T14:00:00+02:00');
		expect(instances[0].end).toBe('2026-08-15T15:00:00+02:00');
	});

	it('returns nothing for non-recurring events outside the window', () => {
		const [event] = parseEvents(SIMPLE_EVENT);
		expect(expandEvent(event, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z')).toEqual([]);
	});

	it('respects COUNT bounds', () => {
		const ics = buildEventIcs({
			uid: 'count-1@example.com',
			summary: 'Three times only',
			start: '2026-08-03T08:00:00Z',
			end: '2026-08-03T09:00:00Z',
			allDay: false,
			rrule: 'FREQ=DAILY;COUNT=3',
			exdates: [],
			attendees: [],
			alarms: [],
			categories: [],
		});
		const [event] = parseEvents(ics);
		const instances = expandEvent(event, '2026-08-01T00:00:00Z', '2026-12-01T00:00:00Z');
		expect(instances).toHaveLength(3);
	});
});
