import { beforeAll, describe, expect, it } from 'vitest';

import { applyEventUpdate, buildEventIcs, buildTaskIcs, applyTaskUpdate } from '../../shared/ical/build';
import { parseEvents, parseTasks } from '../../shared/ical/parse';
import {
	createCalendar,
	createObject,
	deleteCalendarCollection,
	deleteObject,
	fetchObjects,
	getAvailability,
	listCalendars,
	smartSync,
	updateObject,
} from '../../shared/transport/calendarOps';
import { createClient, type DavClient } from '../../shared/transport/clientFactory';
import type { CalDavConnection, CalendarInfo, EtagMap } from '../../shared/types';

const serverUrl = process.env.CALDAV_TEST_URL ?? 'http://localhost:5232';
const runIntegration = process.env.RUN_INTEGRATION === '1';

const connection: CalDavConnection = {
	serverUrl,
	authMethod: 'basic',
	allowHttp: true,
	username: 'n8n-test',
	password: 'integration',
};

describe.runIf(runIntegration)('CalDAV integration (live server)', () => {
	let client: DavClient;
	let calendarUrl: string;
	let calendarInfo: CalendarInfo;
	let eventUrl: string;
	let eventEtag: string;

	beforeAll(async () => {
		client = await createClient(connection);
		const homeUrl = `${serverUrl.replace(/\/$/, '')}/n8n-test/`;
		const slug = `itest-${Date.now().toString(36)}`;
		const created = await createCalendar(client, homeUrl, slug, {
			displayName: 'n8n integration test',
			description: 'Created by the n8n-nodes-caldav integration suite',
			components: ['VEVENT', 'VTODO'],
		});
		calendarUrl = created.url;
	}, 30_000);

	it('lists the created calendar', async () => {
		const calendars = await listCalendars(client);
		const match = calendars.find((calendar) => calendar.url.endsWith(new URL(calendarUrl).pathname));
		expect(match).toBeDefined();
		expect(match?.displayName).toBe('n8n integration test');
		calendarInfo = match!;
	});

	it('creates and fetches an event', async () => {
		const ics = buildEventIcs({
			uid: 'itest-event-1@n8n',
			summary: 'Integration meeting',
			description: 'Round trip test',
			location: 'Test lab',
			start: '2026-09-01T10:00:00+02:00',
			end: '2026-09-01T11:00:00+02:00',
			allDay: false,
			timezone: 'Europe/Paris',
			exdates: [],
			attendees: [],
			alarms: [{ action: 'display', trigger: '-PT10M', description: 'Heads up' }],
			categories: ['integration'],
		});
		const created = await createObject(client, calendarUrl, 'itest-event-1.ics', ics);
		eventUrl = created.url;

		const objects = await fetchObjects(client, calendarUrl, {
			componentFilter: 'VEVENT',
			timeRange: { start: '2026-09-01T00:00:00Z', end: '2026-09-02T00:00:00Z' },
		});
		expect(objects).toHaveLength(1);
		eventEtag = objects[0].etag;
		const [event] = parseEvents(objects[0].data);
		expect(event.summary).toBe('Integration meeting');
		expect(event.start).toBe('2026-09-01T10:00:00+02:00');
		expect(event.alarms).toEqual([{ action: 'display', trigger: '-PT10M', description: 'Heads up' }]);
	});

	it('updates the event with the correct ETag', async () => {
		const objects = await fetchObjects(client, calendarUrl, {
			componentFilter: 'VEVENT',
			objectUrls: [eventUrl],
		});
		const updated = applyEventUpdate(objects[0].data, { summary: 'Integration meeting (renamed)' });
		await updateObject(client, eventUrl, updated, objects[0].etag);
		const refreshed = await fetchObjects(client, calendarUrl, {
			componentFilter: 'VEVENT',
			objectUrls: [eventUrl],
		});
		const [event] = parseEvents(refreshed[0].data);
		expect(event.summary).toBe('Integration meeting (renamed)');
		expect(event.uid).toBe('itest-event-1@n8n');
		eventEtag = refreshed[0].etag;
	});

	it('rejects an update with a stale ETag', async () => {
		const objects = await fetchObjects(client, calendarUrl, {
			componentFilter: 'VEVENT',
			objectUrls: [eventUrl],
		});
		const updated = applyEventUpdate(objects[0].data, { summary: 'Should not apply' });
		await expect(updateObject(client, eventUrl, updated, '"stale-etag"')).rejects.toThrow();
	});

	it('computes availability from events', async () => {
		const busy = await getAvailability(client, calendarUrl, {
			start: '2026-09-01T00:00:00Z',
			end: '2026-09-02T00:00:00Z',
		});
		expect(busy).toEqual([{ start: '2026-09-01T08:00:00Z', end: '2026-09-01T09:00:00Z' }]);
	});

	it('runs a full trigger sync cycle: baseline, create, update, delete', async () => {
		let state: { syncToken?: string; ctag?: string; etags: EtagMap } = { etags: {} };

		const baseline = await smartSync(client, calendarInfo, state);
		expect(baseline.created.length).toBe(1);
		state = { syncToken: baseline.nextSyncToken, ctag: baseline.nextCtag, etags: baseline.nextEtags };

		const secondIcs = buildEventIcs({
			uid: 'itest-event-2@n8n',
			summary: 'Second event',
			start: '2026-09-03T09:00:00Z',
			end: '2026-09-03T09:30:00Z',
			allDay: false,
			exdates: [],
			attendees: [],
			alarms: [],
			categories: [],
		});
		const second = await createObject(client, calendarUrl, 'itest-event-2.ics', secondIcs);

		const afterCreate = await smartSync(client, calendarInfo, state);
		expect(afterCreate.created.map((object) => object.url)).toContain(second.url);
		expect(afterCreate.updated).toHaveLength(0);
		expect(afterCreate.deleted).toHaveLength(0);
		state = {
			syncToken: afterCreate.nextSyncToken,
			ctag: afterCreate.nextCtag,
			etags: afterCreate.nextEtags,
		};

		const current = await fetchObjects(client, calendarUrl, {
			componentFilter: 'VEVENT',
			objectUrls: [second.url],
		});
		const renamed = applyEventUpdate(current[0].data, { summary: 'Second event (renamed)' });
		await updateObject(client, second.url, renamed, current[0].etag);

		const afterUpdate = await smartSync(client, calendarInfo, state);
		expect(afterUpdate.updated.map((object) => object.url)).toContain(second.url);
		state = {
			syncToken: afterUpdate.nextSyncToken,
			ctag: afterUpdate.nextCtag,
			etags: afterUpdate.nextEtags,
		};

		await deleteObject(client, second.url);
		const afterDelete = await smartSync(client, calendarInfo, state);
		expect(afterDelete.deleted.map((object) => object.url)).toContain(second.url);
	}, 30_000);

	it('recovers from an invalid sync token with a full resync', async () => {
		const objects = await fetchObjects(client, calendarUrl, { componentFilter: 'VEVENT' });
		const etags: EtagMap = {};
		for (const object of objects) etags[new URL(object.url).pathname] = object.etag;
		const result = await smartSync(client, calendarInfo, {
			syncToken: 'http://invalid.example/sync/token-42',
			etags,
		});
		expect(result.created).toHaveLength(0);
		expect(result.deleted).toHaveLength(0);
	});

	it('creates, completes, and deletes a task', async () => {
		const ics = buildTaskIcs({
			uid: 'itest-task-1@n8n',
			summary: 'Integration task',
			due: '2026-09-05T18:00:00+02:00',
			timezone: 'Europe/Paris',
			priority: 1,
			status: 'NEEDS-ACTION',
			categories: ['integration'],
		});
		const created = await createObject(client, calendarUrl, 'itest-task-1.ics', ics);
		const objects = await fetchObjects(client, calendarUrl, { componentFilter: 'VTODO' });
		expect(objects).toHaveLength(1);
		const [task] = parseTasks(objects[0].data);
		expect(task.summary).toBe('Integration task');
		expect(task.priority).toBe(1);

		const completed = applyTaskUpdate(objects[0].data, { status: 'COMPLETED', percentComplete: 100 });
		await updateObject(client, created.url, completed, objects[0].etag);
		const refreshed = await fetchObjects(client, calendarUrl, { componentFilter: 'VTODO' });
		const [done] = parseTasks(refreshed[0].data);
		expect(done.status).toBe('COMPLETED');
		expect(done.percentComplete).toBe(100);

		await deleteObject(client, created.url);
		const gone = await fetchObjects(client, calendarUrl, { componentFilter: 'VTODO' });
		expect(gone).toHaveLength(0);
	});

	it('cleans up the test calendar', async () => {
		await deleteCalendarCollection(client, calendarUrl);
		const calendars = await listCalendars(client);
		expect(
			calendars.find((calendar) => calendar.url.endsWith(new URL(calendarUrl).pathname)),
		).toBeUndefined();
	});
});
