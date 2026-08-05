import { describe, expect, it } from 'vitest';

import {
	ALL_DAY_EVENT,
	EMPTY_CALENDAR,
	NO_DTEND_EVENT,
	RECURRING_WITH_OVERRIDE,
	RICH_EVENT,
	SIMPLE_EVENT,
	SIMPLE_TODO,
} from './fixtures';
import { parseEvents, parseTasks } from '../parse';

describe('parseEvents', () => {
	it('parses a simple timed event with zone-aware ISO dates', () => {
		const [event] = parseEvents(SIMPLE_EVENT);
		expect(event.uid).toBe('simple-1@example.com');
		expect(event.summary).toBe('Team meeting');
		expect(event.description).toBe('Quarterly review');
		expect(event.location).toBe('Room 4');
		expect(event.status).toBe('CONFIRMED');
		expect(event.allDay).toBe(false);
		expect(event.timezone).toBe('Europe/Paris');
		expect(event.start).toBe('2026-08-15T14:00:00+02:00');
		expect(event.end).toBe('2026-08-15T15:00:00+02:00');
		expect(event.raw).toContain('BEGIN:VCALENDAR');
	});

	it('parses all-day events as date-only values', () => {
		const [event] = parseEvents(ALL_DAY_EVENT);
		expect(event.allDay).toBe(true);
		expect(event.start).toBe('2026-08-20');
		expect(event.end).toBe('2026-08-21');
	});

	it('parses recurrence master and override as separate models', () => {
		const events = parseEvents(RECURRING_WITH_OVERRIDE);
		expect(events).toHaveLength(2);
		const master = events.find((e) => !e.recurrenceId);
		const override = events.find((e) => e.recurrenceId);
		expect(master?.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
		expect(master?.exdates).toEqual(['2026-08-17T09:00:00+02:00']);
		expect(override?.recurrenceId).toBe('2026-08-10T09:00:00+02:00');
		expect(override?.summary).toBe('Weekly standup (moved)');
	});

	it('parses attendees, alarms, categories, organizer, and folded lines', () => {
		const [event] = parseEvents(RICH_EVENT);
		expect(event.summary).toBe(
			'Project kickoff with a very long summary line that should be folded across lines by the generator',
		);
		expect(event.organizer).toBe('alice@example.com');
		expect(event.attendees).toEqual([
			{ email: 'bob@example.com', name: 'Bob', role: 'REQ-PARTICIPANT', status: 'ACCEPTED', rsvp: true },
			{ email: 'carol@example.com', name: 'Carol', role: undefined, status: 'NEEDS-ACTION', rsvp: false },
		]);
		expect(event.alarms).toEqual([
			{ action: 'display', trigger: '-PT15M', description: 'Reminder' },
			{ action: 'email', trigger: '-PT1H', description: 'Email reminder' },
		]);
		expect(event.categories).toEqual(['work', 'planning']);
		expect(event.eventUrl).toBe('https://example.com/kickoff');
		expect(event.raw).toContain('X-CUSTOM-TAG:keep-me');
	});

	it('handles events without DTEND', () => {
		const [event] = parseEvents(NO_DTEND_EVENT);
		expect(event.start).toBe('2026-09-01T10:00:00Z');
		expect(event.end).toBeUndefined();
	});

	it('returns an empty array for calendars without events', () => {
		expect(parseEvents(EMPTY_CALENDAR)).toEqual([]);
		expect(parseEvents(SIMPLE_TODO)).toEqual([]);
	});
});

describe('parseTasks', () => {
	it('parses a VTODO with all supported fields', () => {
		const [task] = parseTasks(SIMPLE_TODO);
		expect(task.uid).toBe('todo-1@example.com');
		expect(task.summary).toBe('Write report');
		expect(task.description).toBe('Final draft');
		expect(task.due).toBe('2026-08-30T18:00:00+02:00');
		expect(task.priority).toBe(1);
		expect(task.status).toBe('IN-PROCESS');
		expect(task.percentComplete).toBe(40);
		expect(task.categories).toEqual(['work']);
		expect(task.relatedTo).toBe('project-9@example.com');
	});

	it('returns an empty array when there are no todos', () => {
		expect(parseTasks(SIMPLE_EVENT)).toEqual([]);
		expect(parseTasks(EMPTY_CALENDAR)).toEqual([]);
	});
});
