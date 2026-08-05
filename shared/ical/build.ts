import { getVtimezoneComponent } from '@touch4it/ical-timezones';
import ICAL from 'ical.js';
import { DateTime } from 'luxon';

import type { Alarm, Attendee, EventModel, TaskModel } from '../types';

export type EventInput = Omit<EventModel, 'raw' | 'url' | 'etag'>;
export type TaskInput = Omit<TaskModel, 'raw' | 'url' | 'etag'>;

const PRODID = '-//n8n-nodes-caldav//EN';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function wallClockInZone(iso: string, zone: string): ICAL.Time {
	const dt = DateTime.fromISO(iso, { setZone: true }).setZone(zone);
	if (!dt.isValid) throw new Error(`Invalid date-time "${iso}"`);
	return new ICAL.Time({
		year: dt.year,
		month: dt.month,
		day: dt.day,
		hour: dt.hour,
		minute: dt.minute,
		second: dt.second,
		isDate: false,
	});
}

function setDateTimeProperty(
	component: ICAL.Component,
	name: string,
	iso: string,
	zone: string | undefined,
	allDay: boolean,
): void {
	component.removeAllProperties(name);
	const property = new ICAL.Property(name, component);
	if (allDay || DATE_ONLY.test(iso)) {
		property.setValue(ICAL.Time.fromDateString(iso));
	} else if (zone && zone !== 'UTC') {
		property.setParameter('tzid', zone);
		property.setValue(wallClockInZone(iso, zone));
	} else {
		const dt = DateTime.fromISO(iso, { zone: 'utc' });
		if (!dt.isValid) throw new Error(`Invalid date-time "${iso}"`);
		const isoUtc = dt.toISO({ suppressMilliseconds: true });
		if (isoUtc === null) throw new Error(`Could not format date-time "${iso}"`);
		property.setValue(ICAL.Time.fromDateTimeString(isoUtc));
	}
	component.addProperty(property);
}

function setTextProperty(component: ICAL.Component, name: string, value: string | undefined): void {
	component.removeAllProperties(name);
	if (value !== undefined && value !== '') {
		component.updatePropertyWithValue(name, value);
	}
}

function setAttendees(component: ICAL.Component, attendees: Attendee[]): void {
	component.removeAllProperties('attendee');
	for (const attendee of attendees) {
		const property = new ICAL.Property('attendee', component);
		if (attendee.name) property.setParameter('cn', attendee.name);
		if (attendee.role) property.setParameter('role', attendee.role);
		if (attendee.status) property.setParameter('partstat', attendee.status);
		property.setParameter('rsvp', attendee.rsvp ? 'TRUE' : 'FALSE');
		property.setValue(`mailto:${attendee.email}`);
		component.addProperty(property);
	}
}

function setAlarms(component: ICAL.Component, alarms: Alarm[]): void {
	for (const existing of component.getAllSubcomponents('valarm')) {
		component.removeSubcomponent(existing);
	}
	for (const alarm of alarms) {
		const valarm = new ICAL.Component('valarm');
		valarm.updatePropertyWithValue('action', alarm.action.toUpperCase());
		valarm.updatePropertyWithValue('trigger', ICAL.Duration.fromString(alarm.trigger));
		if (alarm.description) valarm.updatePropertyWithValue('description', alarm.description);
		component.addSubcomponent(valarm);
	}
}

function setCategories(component: ICAL.Component, categories: string[]): void {
	component.removeAllProperties('categories');
	if (categories.length === 0) return;
	const property = new ICAL.Property('categories', component);
	property.setValues(categories);
	component.addProperty(property);
}

function setExdates(
	component: ICAL.Component,
	exdates: string[],
	zone: string | undefined,
): void {
	component.removeAllProperties('exdate');
	for (const exdate of exdates) {
		setAppendedDateTime(component, 'exdate', exdate, zone);
	}
}

/** Like setDateTimeProperty but appends (EXDATE may repeat). */
function setAppendedDateTime(
	component: ICAL.Component,
	name: string,
	iso: string,
	zone: string | undefined,
): void {
	const property = new ICAL.Property(name, component);
	if (DATE_ONLY.test(iso)) {
		property.setValue(ICAL.Time.fromDateString(iso));
	} else if (zone && zone !== 'UTC') {
		property.setParameter('tzid', zone);
		property.setValue(wallClockInZone(iso, zone));
	} else {
		property.setValue(ICAL.Time.fromDateTimeString(iso));
	}
	component.addProperty(property);
}

function attachTimezone(calendar: ICAL.Component, zone: string | undefined): void {
	if (!zone || zone === 'UTC') return;
	for (const existing of calendar.getAllSubcomponents('vtimezone')) {
		if (existing.getFirstPropertyValue('tzid') === zone) return;
	}
	const vtimezoneIcs = getVtimezoneComponent(zone);
	if (!vtimezoneIcs) return;
	const parsed = ICAL.parse(`BEGIN:VCALENDAR\r\n${vtimezoneIcs}END:VCALENDAR`);
	const wrapper = new ICAL.Component(parsed);
	const vtimezone = wrapper.getFirstSubcomponent('vtimezone');
	if (vtimezone) calendar.addSubcomponent(vtimezone);
}

function newCalendar(): ICAL.Component {
	const calendar = new ICAL.Component(['vcalendar', [], []]);
	calendar.updatePropertyWithValue('prodid', PRODID);
	calendar.updatePropertyWithValue('version', '2.0');
	return calendar;
}

function stampNow(component: ICAL.Component): void {
	component.removeAllProperties('dtstamp');
	component.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));
}

function applyEventFields(
	calendar: ICAL.Component,
	vevent: ICAL.Component,
	fields: Partial<EventInput>,
	existingZone?: string,
): void {
	const zone = fields.timezone ?? existingZone;
	if (fields.start !== undefined) {
		setDateTimeProperty(vevent, 'dtstart', fields.start, zone, fields.allDay ?? false);
		attachTimezone(calendar, fields.allDay ? undefined : zone);
	}
	if (fields.end !== undefined) {
		setDateTimeProperty(vevent, 'dtend', fields.end, zone, fields.allDay ?? false);
	}
	if (fields.summary !== undefined) setTextProperty(vevent, 'summary', fields.summary);
	if (fields.description !== undefined) setTextProperty(vevent, 'description', fields.description);
	if (fields.location !== undefined) setTextProperty(vevent, 'location', fields.location);
	if (fields.eventUrl !== undefined) setTextProperty(vevent, 'url', fields.eventUrl);
	if (fields.status !== undefined) setTextProperty(vevent, 'status', fields.status);
	if (fields.transparency !== undefined) setTextProperty(vevent, 'transp', fields.transparency);
	if (fields.organizer !== undefined) {
		setTextProperty(vevent, 'organizer', fields.organizer ? `mailto:${fields.organizer}` : undefined);
	}
	if (fields.rrule !== undefined) {
		vevent.removeAllProperties('rrule');
		if (fields.rrule) {
			vevent.updatePropertyWithValue('rrule', ICAL.Recur.fromString(fields.rrule));
		}
	}
	if (fields.exdates !== undefined) setExdates(vevent, fields.exdates, zone);
	if (fields.recurrenceId !== undefined && fields.recurrenceId !== '') {
		setDateTimeProperty(vevent, 'recurrence-id', fields.recurrenceId, zone, false);
	}
	if (fields.attendees !== undefined) setAttendees(vevent, fields.attendees);
	if (fields.alarms !== undefined) setAlarms(vevent, fields.alarms);
	if (fields.categories !== undefined) setCategories(vevent, fields.categories);
	stampNow(vevent);
}

export function buildEventIcs(event: EventInput): string {
	const calendar = newCalendar();
	const vevent = new ICAL.Component('vevent');
	calendar.addSubcomponent(vevent);
	vevent.updatePropertyWithValue('uid', event.uid);
	applyEventFields(calendar, vevent, event);
	return calendar.toString();
}

function findTargetVevent(calendar: ICAL.Component, recurrenceId?: string): ICAL.Component {
	const vevents = calendar.getAllSubcomponents('vevent');
	if (vevents.length === 0) throw new Error('Calendar object contains no VEVENT');
	if (recurrenceId) {
		const match = vevents.find(
			(candidate) => candidate.getFirstProperty('recurrence-id') !== null,
		);
		if (match) return match;
	}
	return vevents.find((candidate) => candidate.getFirstProperty('recurrence-id') === null) ?? vevents[0];
}

export function applyEventUpdate(existingRaw: string, updates: Partial<EventInput>): string {
	const calendar = new ICAL.Component(ICAL.parse(existingRaw));
	const vevent = findTargetVevent(calendar, updates.recurrenceId);
	const existingStart = vevent.getFirstProperty('dtstart');
	const existingZone = (existingStart?.getParameter('tzid') as string | undefined) ?? undefined;
	applyEventFields(calendar, vevent, updates, existingZone);
	return calendar.toString();
}

function applyTaskFields(
	calendar: ICAL.Component,
	vtodo: ICAL.Component,
	fields: Partial<TaskInput>,
	existingZone?: string,
): void {
	const zone = fields.timezone ?? existingZone;
	if (fields.due !== undefined) {
		setDateTimeProperty(vtodo, 'due', fields.due, zone, false);
		attachTimezone(calendar, zone);
	}
	if (fields.start !== undefined) {
		setDateTimeProperty(vtodo, 'dtstart', fields.start, zone, false);
		attachTimezone(calendar, zone);
	}
	if (fields.summary !== undefined) setTextProperty(vtodo, 'summary', fields.summary);
	if (fields.description !== undefined) setTextProperty(vtodo, 'description', fields.description);
	if (fields.priority !== undefined) {
		vtodo.removeAllProperties('priority');
		vtodo.updatePropertyWithValue('priority', fields.priority);
	}
	if (fields.status !== undefined) {
		setTextProperty(vtodo, 'status', fields.status);
		if (fields.status === 'COMPLETED') {
			vtodo.removeAllProperties('completed');
			vtodo.updatePropertyWithValue('completed', ICAL.Time.fromJSDate(new Date(), true));
		}
	}
	if (fields.percentComplete !== undefined) {
		vtodo.removeAllProperties('percent-complete');
		vtodo.updatePropertyWithValue('percent-complete', fields.percentComplete);
	}
	if (fields.categories !== undefined) setCategories(vtodo, fields.categories);
	if (fields.relatedTo !== undefined) setTextProperty(vtodo, 'related-to', fields.relatedTo);
	if (fields.rrule !== undefined) {
		vtodo.removeAllProperties('rrule');
		if (fields.rrule) {
			vtodo.updatePropertyWithValue('rrule', ICAL.Recur.fromString(fields.rrule));
		}
	}
	stampNow(vtodo);
}

export function buildTaskIcs(task: TaskInput): string {
	const calendar = newCalendar();
	const vtodo = new ICAL.Component('vtodo');
	calendar.addSubcomponent(vtodo);
	vtodo.updatePropertyWithValue('uid', task.uid);
	applyTaskFields(calendar, vtodo, task);
	return calendar.toString();
}

export function applyTaskUpdate(existingRaw: string, updates: Partial<TaskInput>): string {
	const calendar = new ICAL.Component(ICAL.parse(existingRaw));
	const vtodo = calendar.getFirstSubcomponent('vtodo');
	if (!vtodo) throw new Error('Calendar object contains no VTODO');
	const existingDue = vtodo.getFirstProperty('due') ?? vtodo.getFirstProperty('dtstart');
	const existingZone = (existingDue?.getParameter('tzid') as string | undefined) ?? undefined;
	applyTaskFields(calendar, vtodo, updates, existingZone);
	return calendar.toString();
}
