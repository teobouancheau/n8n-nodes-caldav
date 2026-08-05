import ICAL from 'ical.js';
import { DateTime } from 'luxon';

import { parseEvents } from './parse';
import { toIsoInZone } from './timezone';
import type { EventModel } from '../types';

export interface ExpandedInstance {
	start: string;
	end?: string;
	recurrenceId: string;
	/** The model this instance came from (override model when one applies). */
	master: EventModel;
}

function utcMillis(iso: string): number {
	const dt = DateTime.fromISO(iso, { setZone: true });
	if (!dt.isValid) throw new Error(`Invalid date-time "${iso}"`);
	return dt.toMillis();
}

function icalTimeToIso(time: ICAL.Time, zone: string | undefined, allDay: boolean): string {
	if (allDay || time.isDate) return time.toString();
	const wallClock = time.toString().replace(/Z$/, '');
	if (!zone) return `${wallClock}Z`;
	return toIsoInZone(wallClock, zone);
}

function loadEventComponents(event: EventModel): {
	master: ICAL.Component;
	overrides: ICAL.Component[];
} {
	const calendar = new ICAL.Component(ICAL.parse(event.raw));
	const vevents = calendar
		.getAllSubcomponents('vevent')
		.filter((vevent) => vevent.getFirstPropertyValue('uid') === event.uid);
	const master = vevents.find((vevent) => vevent.getFirstProperty('recurrence-id') === null);
	if (!master) throw new Error(`No master VEVENT for UID ${event.uid}`);
	return {
		master,
		overrides: vevents.filter((vevent) => vevent.getFirstProperty('recurrence-id') !== null),
	};
}

/**
 * Expands an event into concrete instances within [windowStart, windowEnd).
 * Recurrence math runs client-side (server-side expand REPORTs are unreliable
 * across CalDAV implementations). Overrides may live in the same calendar
 * object (usual case) or be passed separately.
 */
export function expandEvent(
	event: EventModel,
	windowStart: string,
	windowEnd: string,
	overrides?: EventModel[],
): ExpandedInstance[] {
	const windowStartMs = utcMillis(windowStart);
	const windowEndMs = utcMillis(windowEnd);
	const zone = event.timezone;

	const { master, overrides: inlineOverrides } = loadEventComponents(event);
	const icalEvent = new ICAL.Event(master);

	const overrideComponents = [
		...inlineOverrides,
		...(overrides ?? [])
			.filter((model) => model.uid === event.uid && model.recurrenceId)
			.flatMap((model) => loadEventComponents({ ...model, raw: model.raw }).overrides),
	];
	for (const overrideComponent of overrideComponents) {
		icalEvent.relateException(new ICAL.Event(overrideComponent));
	}

	if (!icalEvent.isRecurring()) {
		const startMs = utcMillis(event.start);
		if (startMs >= windowStartMs && startMs < windowEndMs) {
			return [
				{
					start: event.start,
					end: event.end,
					recurrenceId: event.start,
					master: event,
				},
			];
		}
		return [];
	}

	const overrideModels = new Map<string, EventModel>();
	for (const model of [...parseEvents(event.raw), ...(overrides ?? [])]) {
		if (model.uid === event.uid && model.recurrenceId) {
			overrideModels.set(model.recurrenceId, model);
		}
	}

	const instances: ExpandedInstance[] = [];
	const iterator = icalEvent.iterator();
	let next: ICAL.Time | null;
	while ((next = iterator.next())) {
		const occurrence = icalEvent.getOccurrenceDetails(next);
		const startIso = icalTimeToIso(occurrence.startDate, zone, event.allDay);
		const endIso = occurrence.endDate
			? icalTimeToIso(occurrence.endDate, zone, event.allDay)
			: undefined;
		const startMs = utcMillis(startIso);
		if (startMs >= windowEndMs) break;
		if (startMs < windowStartMs) continue;
		const recurrenceIso = icalTimeToIso(occurrence.recurrenceId, zone, event.allDay);
		instances.push({
			start: startIso,
			end: endIso,
			recurrenceId: recurrenceIso,
			master: overrideModels.get(recurrenceIso) ?? event,
		});
	}
	return instances;
}
