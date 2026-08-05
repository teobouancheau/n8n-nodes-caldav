import { describe, expect, it } from 'vitest';

import { RICH_EVENT, SIMPLE_TODO } from './fixtures';
import { applyEventUpdate, applyTaskUpdate, buildEventIcs, buildTaskIcs } from '../build';
import { parseEvents, parseTasks } from '../parse';

const baseEvent = {
	uid: 'built-1@example.com',
	summary: 'Planning session',
	description: 'Sprint planning',
	location: 'Room 2',
	eventUrl: 'https://example.com/planning',
	start: '2026-09-10T09:00:00+02:00',
	end: '2026-09-10T10:00:00+02:00',
	allDay: false,
	timezone: 'Europe/Paris',
	rrule: 'FREQ=WEEKLY;BYDAY=TH',
	exdates: ['2026-09-24T09:00:00+02:00'],
	recurrenceId: undefined,
	status: 'CONFIRMED',
	transparency: 'OPAQUE',
	organizer: 'alice@example.com',
	attendees: [
		{ email: 'bob@example.com', name: 'Bob', role: 'REQ-PARTICIPANT', status: 'ACCEPTED', rsvp: true },
	],
	alarms: [{ action: 'display' as const, trigger: '-PT15M', description: 'Reminder' }],
	categories: ['work', 'planning'],
};

describe('buildEventIcs', () => {
	it('produces ICS that round-trips through parseEvents', () => {
		const ics = buildEventIcs(baseEvent);
		const [parsed] = parseEvents(ics);
		expect(parsed.uid).toBe(baseEvent.uid);
		expect(parsed.summary).toBe(baseEvent.summary);
		expect(parsed.description).toBe(baseEvent.description);
		expect(parsed.location).toBe(baseEvent.location);
		expect(parsed.eventUrl).toBe(baseEvent.eventUrl);
		expect(parsed.start).toBe(baseEvent.start);
		expect(parsed.end).toBe(baseEvent.end);
		expect(parsed.allDay).toBe(false);
		expect(parsed.timezone).toBe('Europe/Paris');
		expect(parsed.rrule).toBe(baseEvent.rrule);
		expect(parsed.exdates).toEqual(baseEvent.exdates);
		expect(parsed.status).toBe('CONFIRMED');
		expect(parsed.organizer).toBe('alice@example.com');
		expect(parsed.attendees).toEqual(baseEvent.attendees);
		expect(parsed.alarms).toEqual(baseEvent.alarms);
		expect(parsed.categories).toEqual(baseEvent.categories);
	});

	it('embeds a VTIMEZONE component for zoned events', () => {
		const ics = buildEventIcs(baseEvent);
		expect(ics).toContain('BEGIN:VTIMEZONE');
		expect(ics).toContain('TZID:Europe/Paris');
	});

	it('builds all-day events with DATE values and no VTIMEZONE', () => {
		const ics = buildEventIcs({
			...baseEvent,
			start: '2026-09-10',
			end: '2026-09-11',
			allDay: true,
			timezone: undefined,
			rrule: undefined,
			exdates: [],
		});
		const [parsed] = parseEvents(ics);
		expect(parsed.allDay).toBe(true);
		expect(parsed.start).toBe('2026-09-10');
		expect(parsed.end).toBe('2026-09-11');
		expect(ics).not.toContain('BEGIN:VTIMEZONE');
	});

	it('builds UTC events without TZID', () => {
		const ics = buildEventIcs({
			...baseEvent,
			start: '2026-09-10T09:00:00Z',
			end: '2026-09-10T10:00:00Z',
			timezone: undefined,
			rrule: undefined,
			exdates: [],
		});
		const [parsed] = parseEvents(ics);
		expect(parsed.start).toBe('2026-09-10T09:00:00Z');
		expect(parsed.timezone).toBeUndefined();
	});

	it('includes DTSTAMP', () => {
		expect(buildEventIcs(baseEvent)).toContain('DTSTAMP:');
	});
});

describe('applyEventUpdate', () => {
	it('changes only the given fields and preserves unknown properties and UID', () => {
		const updated = applyEventUpdate(RICH_EVENT, { summary: 'Renamed kickoff', location: 'Room 9' });
		const [parsed] = parseEvents(updated);
		expect(parsed.summary).toBe('Renamed kickoff');
		expect(parsed.location).toBe('Room 9');
		expect(parsed.uid).toBe('rich-1@example.com');
		expect(parsed.attendees).toHaveLength(2);
		expect(updated).toContain('X-CUSTOM-TAG:keep-me');
	});

	it('can move an event in time keeping the zone', () => {
		const source = buildEventIcs({ ...baseEvent, rrule: undefined, exdates: [] });
		const updated = applyEventUpdate(source, {
			start: '2026-09-11T14:00:00+02:00',
			end: '2026-09-11T15:00:00+02:00',
			timezone: 'Europe/Paris',
		});
		const [parsed] = parseEvents(updated);
		expect(parsed.start).toBe('2026-09-11T14:00:00+02:00');
		expect(parsed.end).toBe('2026-09-11T15:00:00+02:00');
	});

	it('replaces attendees when provided', () => {
		const updated = applyEventUpdate(RICH_EVENT, {
			attendees: [{ email: 'dave@example.com', name: 'Dave', rsvp: false }],
		});
		const [parsed] = parseEvents(updated);
		expect(parsed.attendees).toEqual([
			{ email: 'dave@example.com', name: 'Dave', role: undefined, status: undefined, rsvp: false },
		]);
	});
});

describe('buildTaskIcs / applyTaskUpdate', () => {
	it('round-trips a task through parseTasks', () => {
		const ics = buildTaskIcs({
			uid: 'built-todo-1@example.com',
			summary: 'Prepare slides',
			description: 'For Monday',
			due: '2026-09-12T18:00:00+02:00',
			start: undefined,
			timezone: 'Europe/Paris',
			priority: 2,
			status: 'NEEDS-ACTION',
			percentComplete: 0,
			categories: ['work'],
			relatedTo: undefined,
			rrule: undefined,
		});
		const [parsed] = parseTasks(ics);
		expect(parsed.uid).toBe('built-todo-1@example.com');
		expect(parsed.summary).toBe('Prepare slides');
		expect(parsed.due).toBe('2026-09-12T18:00:00+02:00');
		expect(parsed.priority).toBe(2);
		expect(parsed.status).toBe('NEEDS-ACTION');
	});

	it('completes a task preserving other fields', () => {
		const updated = applyTaskUpdate(SIMPLE_TODO, {
			status: 'COMPLETED',
			percentComplete: 100,
		});
		const [parsed] = parseTasks(updated);
		expect(parsed.status).toBe('COMPLETED');
		expect(parsed.percentComplete).toBe(100);
		expect(parsed.summary).toBe('Write report');
		expect(parsed.relatedTo).toBe('project-9@example.com');
		expect(updated).toContain('COMPLETED:');
	});
});
