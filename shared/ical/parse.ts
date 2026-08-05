import ICAL from 'ical.js';

import { resolveTimezone, toIsoInZone } from './timezone';
import type { Alarm, Attendee, EventModel, TaskModel } from '../types';

interface IsoTime {
	value: string;
	allDay: boolean;
	timezone?: string;
}

/**
 * Registers embedded VTIMEZONE definitions so non-IANA TZIDs can still be
 * converted (via UTC) when a fixture or server uses custom zone names.
 */
function registerEmbeddedTimezones(calendar: ICAL.Component): void {
	for (const vtimezone of calendar.getAllSubcomponents('vtimezone')) {
		const timezone = new ICAL.Timezone(vtimezone);
		if (!ICAL.TimezoneService.has(timezone.tzid)) {
			ICAL.TimezoneService.register(timezone.tzid, timezone);
		}
	}
}

function propertyToIso(property: ICAL.Property): IsoTime {
	const time = property.getFirstValue() as ICAL.Time;
	if (time.isDate) {
		return { value: time.toString(), allDay: true };
	}
	const tzid = (property.getParameter('tzid') as string | undefined) ?? null;
	const zone = resolveTimezone(tzid);
	if (zone && zone !== 'UTC') {
		return { value: toIsoInZone(time.toString(), zone), allDay: false, timezone: zone };
	}
	if (!tzid || zone === 'UTC') {
		const raw = time.toString();
		return { value: raw.endsWith('Z') ? raw : `${raw}Z`, allDay: false };
	}
	// Unknown TZID: rely on the registered embedded VTIMEZONE and emit UTC.
	const utcSeconds = time.toUnixTime();
	const utc = new Date(utcSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
	return { value: utc, allDay: false };
}

function isoFromComponent(component: ICAL.Component, propertyName: string): IsoTime | null {
	const property = component.getFirstProperty(propertyName);
	return property ? propertyToIso(property) : null;
}

function stripMailto(value: string): string {
	return value.replace(/^mailto:/i, '');
}

function parseAttendees(component: ICAL.Component): Attendee[] {
	return component.getAllProperties('attendee').map((property) => {
		const role = property.getParameter('role') as string | undefined;
		const status = property.getParameter('partstat') as string | undefined;
		const name = property.getParameter('cn') as string | undefined;
		const rsvp = property.getParameter('rsvp') as string | undefined;
		return {
			email: stripMailto(String(property.getFirstValue())),
			name,
			role,
			status,
			rsvp: rsvp?.toUpperCase() === 'TRUE',
		};
	});
}

function parseAlarms(component: ICAL.Component): Alarm[] {
	return component.getAllSubcomponents('valarm').map((valarm) => {
		const action = String(valarm.getFirstPropertyValue('action') ?? 'DISPLAY').toLowerCase();
		const trigger = String(valarm.getFirstPropertyValue('trigger') ?? '');
		const description = valarm.getFirstPropertyValue('description');
		return {
			action: action === 'audio' || action === 'email' ? action : 'display',
			trigger,
			description: description === null ? undefined : String(description),
		};
	});
}

function parseCategories(component: ICAL.Component): string[] {
	return component
		.getAllProperties('categories')
		.flatMap((property) => property.getValues().map((value) => String(value)));
}

function parseExdates(component: ICAL.Component): string[] {
	return component.getAllProperties('exdate').map((property) => propertyToIso(property).value);
}

function optionalString(component: ICAL.Component, propertyName: string): string | undefined {
	const value = component.getFirstPropertyValue(propertyName);
	return value === null || value === undefined ? undefined : String(value);
}

function parseCalendar(ics: string): ICAL.Component {
	const calendar = new ICAL.Component(ICAL.parse(ics));
	registerEmbeddedTimezones(calendar);
	return calendar;
}

export function parseEvents(ics: string): EventModel[] {
	const calendar = parseCalendar(ics);
	return calendar.getAllSubcomponents('vevent').map((vevent) => {
		const start = isoFromComponent(vevent, 'dtstart');
		if (!start) {
			throw new Error(`VEVENT ${optionalString(vevent, 'uid') ?? '<no uid>'} has no DTSTART`);
		}
		const end = isoFromComponent(vevent, 'dtend');
		const recurrenceId = isoFromComponent(vevent, 'recurrence-id');
		const rrule = vevent.getFirstPropertyValue('rrule');
		const organizer = optionalString(vevent, 'organizer');
		return {
			uid: optionalString(vevent, 'uid') ?? '',
			summary: optionalString(vevent, 'summary') ?? '',
			description: optionalString(vevent, 'description'),
			location: optionalString(vevent, 'location'),
			eventUrl: optionalString(vevent, 'url'),
			start: start.value,
			end: end?.value,
			allDay: start.allDay,
			timezone: start.timezone,
			rrule: rrule ? String(rrule) : undefined,
			exdates: parseExdates(vevent),
			recurrenceId: recurrenceId?.value,
			status: optionalString(vevent, 'status'),
			transparency: optionalString(vevent, 'transp'),
			organizer: organizer ? stripMailto(organizer) : undefined,
			attendees: parseAttendees(vevent),
			alarms: parseAlarms(vevent),
			categories: parseCategories(vevent),
			raw: ics,
		};
	});
}

export function parseTasks(ics: string): TaskModel[] {
	const calendar = parseCalendar(ics);
	return calendar.getAllSubcomponents('vtodo').map((vtodo) => {
		const due = isoFromComponent(vtodo, 'due');
		const start = isoFromComponent(vtodo, 'dtstart');
		const priority = vtodo.getFirstPropertyValue('priority');
		const percent = vtodo.getFirstPropertyValue('percent-complete');
		const rrule = vtodo.getFirstPropertyValue('rrule');
		return {
			uid: optionalString(vtodo, 'uid') ?? '',
			summary: optionalString(vtodo, 'summary') ?? '',
			description: optionalString(vtodo, 'description'),
			due: due?.value,
			start: start?.value,
			timezone: due?.timezone ?? start?.timezone,
			priority: priority === null || priority === undefined ? undefined : Number(priority),
			status: optionalString(vtodo, 'status'),
			percentComplete: percent === null || percent === undefined ? undefined : Number(percent),
			categories: parseCategories(vtodo),
			relatedTo: optionalString(vtodo, 'related-to'),
			rrule: rrule ? String(rrule) : undefined,
			raw: ics,
		};
	});
}
