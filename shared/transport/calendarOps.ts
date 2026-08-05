import { DateTime } from 'luxon';

import type { DavClient } from './clientFactory';
import { expandEvent } from '../ical/recurrence';
import { parseEvents } from '../ical/parse';
import { mergeBusyIntervals, type BusyInterval } from '../sync/freebusy';
import type { CalendarInfo, EtagMap } from '../types';

export interface RemoteObject {
	url: string;
	etag: string;
	data: string;
}

export type ComponentFilter = 'VEVENT' | 'VTODO';

export interface TimeRange {
	start: string;
	end: string;
}

function displayNameToString(displayName: unknown, fallbackUrl: string): string {
	if (typeof displayName === 'string' && displayName.length > 0) return displayName;
	const segments = fallbackUrl.split('/').filter(Boolean);
	return segments[segments.length - 1] ?? fallbackUrl;
}

export async function listCalendars(client: DavClient): Promise<CalendarInfo[]> {
	const calendars = await client.fetchCalendars();
	return calendars.map((calendar) => ({
		url: calendar.url,
		displayName: displayNameToString(calendar.displayName, calendar.url),
		color: typeof calendar.calendarColor === 'string' ? calendar.calendarColor : undefined,
		components: Array.isArray(calendar.components) ? calendar.components : [],
		ctag: calendar.ctag,
		syncToken: typeof calendar.syncToken === 'string' ? calendar.syncToken : undefined,
	}));
}

function toBasicUtc(iso: string): string {
	const dt = DateTime.fromISO(iso, { setZone: true }).toUTC();
	if (!dt.isValid) throw new Error(`Invalid date-time "${iso}"`);
	return dt.toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function componentFilters(component: ComponentFilter, timeRange?: TimeRange): Record<string, unknown> {
	return {
		'comp-filter': {
			_attributes: { name: 'VCALENDAR' },
			'comp-filter': {
				_attributes: { name: component },
				...(timeRange
					? {
							'time-range': {
								_attributes: { start: toBasicUtc(timeRange.start), end: toBasicUtc(timeRange.end) },
							},
						}
					: {}),
			},
		},
	};
}

function toRemoteObjects(objects: { url: string; etag?: string; data?: unknown }[]): RemoteObject[] {
	return objects
		.filter((object) => typeof object.data === 'string' && object.data.includes('BEGIN:VCALENDAR'))
		.map((object) => ({
			url: object.url,
			etag: object.etag ?? '',
			data: String(object.data),
		}));
}

export async function fetchObjects(
	client: DavClient,
	calendarUrl: string,
	options: { componentFilter: ComponentFilter; timeRange?: TimeRange; objectUrls?: string[] },
): Promise<RemoteObject[]> {
	const objects = await client.fetchCalendarObjects({
		calendar: { url: calendarUrl },
		objectUrls: options.objectUrls,
		filters: options.objectUrls
			? undefined
			: componentFilters(options.componentFilter, options.timeRange),
	});
	return toRemoteObjects(objects);
}

export async function createObject(
	client: DavClient,
	calendarUrl: string,
	filename: string,
	ics: string,
): Promise<{ url: string }> {
	const response = await client.createCalendarObject({
		calendar: { url: calendarUrl },
		filename,
		iCalString: ics,
	});
	if (!response.ok) {
		throw Object.assign(new Error(`Failed to create object (HTTP ${response.status})`), {
			status: response.status,
		});
	}
	const base = calendarUrl.endsWith('/') ? calendarUrl : `${calendarUrl}/`;
	return { url: new URL(filename, base).toString() };
}

export async function updateObject(
	client: DavClient,
	objectUrl: string,
	ics: string,
	etag?: string,
): Promise<void> {
	const response = await client.updateCalendarObject({
		calendarObject: { url: objectUrl, data: ics, etag },
	});
	if (!response.ok) {
		throw Object.assign(new Error(`Failed to update object (HTTP ${response.status})`), {
			status: response.status,
		});
	}
}

export async function deleteObject(client: DavClient, objectUrl: string, etag?: string): Promise<void> {
	const response = await client.deleteCalendarObject({
		calendarObject: { url: objectUrl, etag },
	});
	if (!response.ok && response.status !== 404) {
		throw Object.assign(new Error(`Failed to delete object (HTTP ${response.status})`), {
			status: response.status,
		});
	}
}

export async function createCalendar(
	client: DavClient,
	homeUrl: string,
	slug: string,
	options: { displayName: string; description?: string; components: ComponentFilter[] },
): Promise<{ url: string }> {
	const base = homeUrl.endsWith('/') ? homeUrl : `${homeUrl}/`;
	const url = `${base}${slug}/`;
	await client.makeCalendar({
		url,
		props: {
			displayname: options.displayName,
			...(options.description ? { 'calendar-description': options.description } : {}),
		},
	});
	return { url };
}

export async function deleteCalendarCollection(client: DavClient, calendarUrl: string): Promise<void> {
	const response = await client.deleteObject({ url: calendarUrl });
	if (!response.ok && response.status !== 404) {
		throw Object.assign(new Error(`Failed to delete calendar (HTTP ${response.status})`), {
			status: response.status,
		});
	}
}

export async function getHomeUrl(client: DavClient): Promise<string> {
	const calendars = await client.fetchCalendars();
	if (calendars.length > 0) {
		const url = new URL(calendars[0].url);
		url.pathname = url.pathname.replace(/[^/]+\/?$/, '');
		return url.toString();
	}
	throw new Error('Could not determine the calendar home URL for this account');
}

/**
 * Availability is computed client-side from events in the range (expanding
 * recurrences and skipping transparent events). This works identically on
 * every server, including those without the free-busy-query REPORT (Google).
 */
export async function getAvailability(
	client: DavClient,
	calendarUrl: string,
	timeRange: TimeRange,
): Promise<BusyInterval[]> {
	const objects = await fetchObjects(client, calendarUrl, {
		componentFilter: 'VEVENT',
		timeRange,
	});
	const busy: BusyInterval[] = [];
	for (const object of objects) {
		for (const event of parseEvents(object.data)) {
			if (event.recurrenceId) continue; // occurrences come from expansion of the master
			if (event.transparency === 'TRANSPARENT') continue;
			for (const instance of expandEvent(event, timeRange.start, timeRange.end)) {
				if (!instance.end) continue;
				busy.push({ start: instance.start, end: instance.end });
			}
		}
	}
	return mergeBusyIntervals(busy);
}

export interface SmartSyncResult {
	created: RemoteObject[];
	updated: RemoteObject[];
	deleted: { url: string }[];
	nextSyncToken?: string;
	nextCtag?: string;
	nextEtags: EtagMap;
}

export async function smartSync(
	client: DavClient,
	calendar: CalendarInfo,
	previous: { syncToken?: string; ctag?: string; etags: EtagMap },
): Promise<SmartSyncResult> {
	const collection = {
		url: calendar.url,
		ctag: previous.ctag,
		syncToken: previous.syncToken,
		objects: Object.entries(previous.etags).map(([url, etag]) => ({ url, etag })),
		objectMultiGet: client.calendarMultiGet,
		fetchObjects: (params?: { collection: { url: string } }) =>
			client.fetchCalendarObjects({ calendar: { url: params?.collection.url ?? calendar.url } }),
	};
	const preferWebdav = Boolean(previous.syncToken ?? calendar.syncToken);

	const runSync = (method: 'basic' | 'webdav', state: typeof previous) =>
		client.smartCollectionSyncDetailed({
			collection: { ...collection, ctag: state.ctag, syncToken: state.syncToken },
			method,
		});

	let result;
	try {
		result = await runSync(preferWebdav ? 'webdav' : 'basic', previous);
	} catch {
		// Sync tokens may be expired/forgotten (RFC 6578) — resync from scratch
		// with the ctag method; the etag snapshot keeps the diff accurate.
		result = await runSync('basic', { etags: previous.etags });
	}

	const created = toRemoteObjects(result.objects.created ?? []);
	const updated = toRemoteObjects(result.objects.updated ?? []);
	const deleted = (result.objects.deleted ?? []).map((object) => ({ url: object.url }));

	const nextEtags: EtagMap = { ...previous.etags };
	for (const gone of deleted) delete nextEtags[gone.url];
	for (const object of [...created, ...updated]) nextEtags[object.url] = object.etag;

	return {
		created,
		updated,
		deleted,
		nextSyncToken: typeof result.syncToken === 'string' ? result.syncToken : undefined,
		nextCtag: result.ctag,
		nextEtags,
	};
}
