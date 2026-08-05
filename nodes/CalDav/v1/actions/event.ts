import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import {
	parseAlarmsParameter,
	parseAttendeesParameter,
	parseCategoriesParameter,
	makeUid,
} from '../helpers';
import { applyEventUpdate, buildEventIcs, type EventInput } from '../../../../shared/ical/build';
import { parseEvents } from '../../../../shared/ical/parse';
import { expandEvent } from '../../../../shared/ical/recurrence';
import {
	createObject,
	deleteObject,
	fetchObjects,
	updateObject,
	type RemoteObject,
} from '../../../../shared/transport/calendarOps';
import type { DavClient } from '../../../../shared/transport/clientFactory';
import type { EventModel } from '../../../../shared/types';

export const eventOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['event'] } },
	options: [
		{ name: 'Create', value: 'create', description: 'Create an event', action: 'Create an event' },
		{ name: 'Delete', value: 'delete', description: 'Delete an event', action: 'Delete an event' },
		{ name: 'Get', value: 'get', description: 'Get a single event', action: 'Get an event' },
		{
			name: 'Get Many',
			value: 'getMany',
			description: 'Get events in a time range',
			action: 'Get many events',
		},
		{
			name: 'Move',
			value: 'move',
			description: 'Move an event to another calendar',
			action: 'Move an event',
		},
		{ name: 'Update', value: 'update', description: 'Update an event', action: 'Update an event' },
	],
	default: 'getMany',
};

const attendeeWarning: INodeProperties = {
	displayName:
		'On scheduling-aware servers (iCloud, Fastmail, Nextcloud) adding attendees can make the server send real invitation emails.',
	name: 'attendeeNotice',
	type: 'notice',
	default: '',
	displayOptions: { show: { resource: ['event'], operation: ['create', 'update'] } },
};

const eventDetailFields: INodeProperties[] = [
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		default: '',
	},
	{
		displayName: 'Location',
		name: 'location',
		type: 'string',
		default: '',
	},
	{
		displayName: 'URL',
		name: 'eventUrl',
		type: 'string',
		default: '',
		description: 'A URL associated with the event',
	},
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		options: [
			{ name: 'Confirmed', value: 'CONFIRMED' },
			{ name: 'Tentative', value: 'TENTATIVE' },
			{ name: 'Cancelled', value: 'CANCELLED' },
		],
		default: 'CONFIRMED',
	},
	{
		displayName: 'Show As',
		name: 'transparency',
		type: 'options',
		options: [
			{ name: 'Busy', value: 'OPAQUE' },
			{ name: 'Free', value: 'TRANSPARENT' },
		],
		default: 'OPAQUE',
		description: 'Whether the event blocks time in availability lookups',
	},
	{
		displayName: 'Recurrence Rule (RRULE)',
		name: 'rrule',
		type: 'string',
		default: '',
		placeholder: 'FREQ=WEEKLY;BYDAY=MO',
		description: 'RFC 5545 recurrence rule, without the RRULE: prefix',
	},
	{
		displayName: 'Categories',
		name: 'categories',
		type: 'string',
		default: '',
		description: 'Comma-separated list of categories',
	},
	{
		displayName: 'Custom UID',
		name: 'uid',
		type: 'string',
		default: '',
		description: 'Stable UID for the event. Leave empty to generate one.',
	},
	{
		displayName: 'Attendees',
		name: 'attendees',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		options: [
			{
				displayName: 'Attendee',
				name: 'attendee',
				values: [
					{ displayName: 'Email', name: 'email', type: 'string',
																																												placeholder: 'name@email.com', default: '', required: true },
					{ displayName: 'Name', name: 'name', type: 'string', default: '' },
					{
						displayName: 'Role',
						name: 'role',
						type: 'options',
						options: [
							{ name: 'Required', value: 'REQ-PARTICIPANT' },
							{ name: 'Optional', value: 'OPT-PARTICIPANT' },
						],
						default: 'REQ-PARTICIPANT',
					},
					{ displayName: 'Request RSVP', name: 'rsvp', type: 'boolean', default: false },
				],
			},
		],
	},
	{
		displayName: 'Reminders',
		name: 'alarms',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		options: [
			{
				displayName: 'Reminder',
				name: 'alarm',
				values: [
					{
						displayName: 'Type',
						name: 'action',
						type: 'options',
						options: [
							{ name: 'Display', value: 'display' },
							{ name: 'Email', value: 'email' },
							{ name: 'Audio', value: 'audio' },
						],
						default: 'display',
					},
					{
						displayName: 'Minutes Before Start',
						name: 'minutesBefore',
						type: 'number',
						default: 15,
					},
					{ displayName: 'Message', name: 'description', type: 'string', default: '' },
				],
			},
		],
	},
];

export const eventFields: INodeProperties[] = [
	{
		displayName: 'Calendar Name or ID',
		name: 'calendarUrl',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getCalendars' },
		default: '',
		required: true,
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: ['event'], operation: ['create', 'get', 'getMany'] } },
	},
	attendeeWarning,
	// --- create ---
	{
		displayName: 'Title',
		name: 'summary',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['event'], operation: ['create'] } },
	},
	{
		displayName: 'All Day',
		name: 'allDay',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['event'], operation: ['create'] } },
	},
	{
		displayName: 'Start',
		name: 'start',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['event'], operation: ['create'] } },
	},
	{
		displayName: 'End',
		name: 'end',
		type: 'dateTime',
		default: '',
		displayOptions: { show: { resource: ['event'], operation: ['create'] } },
	},
	{
		displayName: 'Timezone',
		name: 'timezone',
		type: 'string',
		default: '',
		placeholder: 'Europe/Paris',
		description:
			'IANA timezone the event times are in. Leave empty to store times in UTC. Ignored for all-day events.',
		displayOptions: { show: { resource: ['event'], operation: ['create'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		options: eventDetailFields,
		displayOptions: { show: { resource: ['event'], operation: ['create'] } },
	},
	// --- get ---
	{
		displayName: 'Get By',
		name: 'getBy',
		type: 'options',
		options: [
			{ name: 'Object URL', value: 'url' },
			{ name: 'UID', value: 'uid' },
		],
		default: 'url',
		displayOptions: { show: { resource: ['event'], operation: ['get'] } },
	},
	{
		displayName: 'Object URL',
		name: 'objectUrl',
		type: 'string',
		default: '',
		required: true,
		description: 'Full URL of the calendar object (returned by other operations as "URL")',
		displayOptions: {
			show: { resource: ['event'], operation: ['get'], getBy: ['url'] },
		},
	},
	{
		displayName: 'UID',
		name: 'uid',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['event'], operation: ['get'], getBy: ['uid'] } },
	},
	// --- getMany ---
	{
		displayName: 'Start',
		name: 'rangeStart',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['event'], operation: ['getMany'] } },
	},
	{
		displayName: 'End',
		name: 'rangeEnd',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['event'], operation: ['getMany'] } },
	},
	{
		displayName: 'Expand Recurring Events',
		name: 'expandRecurring',
		type: 'boolean',
		default: true,
		description:
			'Whether to return one item per occurrence of recurring events (computed client-side)',
		displayOptions: { show: { resource: ['event'], operation: ['getMany'] } },
	},
	{
		displayName: 'Search Text',
		name: 'searchText',
		type: 'string',
		default: '',
		description: 'Only return events whose title, description, or location contains this text',
		displayOptions: { show: { resource: ['event'], operation: ['getMany'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['event'], operation: ['getMany'] } },
	},
	// --- update / delete / move ---
	{
		displayName: 'Object URL',
		name: 'objectUrl',
		type: 'string',
		default: '',
		required: true,
		description: 'Full URL of the calendar object (returned by other operations as "URL")',
		displayOptions: { show: { resource: ['event'], operation: ['update', 'delete', 'move'] } },
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		options: [
			{ displayName: 'Title', name: 'summary', type: 'string', default: '' },
			{ displayName: 'Start', name: 'start', type: 'dateTime', default: '' },
			{ displayName: 'End', name: 'end', type: 'dateTime', default: '' },
			{
				displayName: 'Timezone',
				name: 'timezone',
				type: 'string',
				default: '',
				placeholder: 'Europe/Paris',
			},
			...eventDetailFields.filter((field) => field.name !== 'uid'),
		],
		displayOptions: { show: { resource: ['event'], operation: ['update'] } },
	},
	{
		displayName: 'Ignore Conflicts',
		name: 'ignoreConflicts',
		type: 'boolean',
		default: false,
		description:
			'Whether to overwrite the event even if it changed on the server since it was read (skips the ETag check)',
		displayOptions: { show: { resource: ['event'], operation: ['update', 'delete'] } },
	},
	{
		displayName: 'Target Calendar Name or ID',
		name: 'targetCalendarUrl',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getCalendars' },
		default: '',
		required: true,
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: ['event'], operation: ['move'] } },
	},
];

function eventToOutput(event: EventModel, includeRaw = false): IDataObject {
	const { raw, ...rest } = event;
	return includeRaw ? { ...rest, raw } : { ...rest };
}

function collectEventInput(
	context: IExecuteFunctions,
	itemIndex: number,
	fields: IDataObject,
): Partial<EventInput> {
	const input: Partial<EventInput> = {};
	if (typeof fields.summary === 'string' && fields.summary !== '') input.summary = fields.summary;
	if (typeof fields.description === 'string' && fields.description !== '')
		input.description = fields.description;
	if (typeof fields.location === 'string' && fields.location !== '')
		input.location = fields.location;
	if (typeof fields.eventUrl === 'string' && fields.eventUrl !== '')
		input.eventUrl = fields.eventUrl;
	if (typeof fields.status === 'string' && fields.status !== '') input.status = fields.status;
	if (typeof fields.transparency === 'string' && fields.transparency !== '')
		input.transparency = fields.transparency;
	if (typeof fields.rrule === 'string' && fields.rrule !== '') input.rrule = fields.rrule;
	if (typeof fields.categories === 'string' && fields.categories !== '')
		input.categories = parseCategoriesParameter(fields.categories);
	if (fields.attendees !== undefined)
		input.attendees = parseAttendeesParameter(fields.attendees as IDataObject);
	if (fields.alarms !== undefined)
		input.alarms = parseAlarmsParameter(fields.alarms as IDataObject);
	return input;
}

async function fetchByUrl(client: DavClient, objectUrl: string): Promise<RemoteObject> {
	const calendarUrl = objectUrl.replace(/[^/]+$/, '');
	const objects = await fetchObjects(client, calendarUrl, {
		componentFilter: 'VEVENT',
		objectUrls: [objectUrl],
	});
	if (objects.length === 0) {
		throw Object.assign(new Error(`Object not found at ${objectUrl}`), { status: 404 });
	}
	return objects[0];
}

export async function executeEventOperation(
	context: IExecuteFunctions,
	client: DavClient,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	if (operation === 'create') {
		const calendarUrl = context.getNodeParameter('calendarUrl', itemIndex) as string;
		const additional = context.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
		const allDay = context.getNodeParameter('allDay', itemIndex, false) as boolean;
		const timezone = context.getNodeParameter('timezone', itemIndex, '') as string;
		const uid =
			typeof additional.uid === 'string' && additional.uid !== '' ? additional.uid : makeUid();
		const input: EventInput = {
			uid,
			summary: context.getNodeParameter('summary', itemIndex) as string,
			start: context.getNodeParameter('start', itemIndex) as string,
			end: (context.getNodeParameter('end', itemIndex, '') as string) || undefined,
			allDay,
			timezone: allDay || timezone === '' ? undefined : timezone,
			exdates: [],
			attendees: [],
			alarms: [],
			categories: [],
			...collectEventInput(context, itemIndex, additional),
		};
		const ics = buildEventIcs(input);
		const { url } = await createObject(client, calendarUrl, `${encodeURIComponent(uid)}.ics`, ics);
		const created = await fetchByUrl(client, url);
		const [event] = parseEvents(created.data);
		return [eventToOutput({ ...event, url: created.url, etag: created.etag })];
	}

	if (operation === 'get') {
		const getBy = context.getNodeParameter('getBy', itemIndex) as string;
		if (getBy === 'uid') {
			const calendarUrl = context.getNodeParameter('calendarUrl', itemIndex) as string;
			const uid = context.getNodeParameter('uid', itemIndex) as string;
			const objects = await fetchObjects(client, calendarUrl, { componentFilter: 'VEVENT' });
			for (const object of objects) {
				const events = parseEvents(object.data).filter((event) => event.uid === uid);
				if (events.length > 0) {
					return events.map((event) =>
						eventToOutput({ ...event, url: object.url, etag: object.etag }),
					);
				}
			}
			throw Object.assign(new Error(`No event with UID "${uid}" found`), { status: 404 });
		}
		const objectUrl = context.getNodeParameter('objectUrl', itemIndex) as string;
		const object = await fetchByUrl(client, objectUrl);
		return parseEvents(object.data).map((event) =>
			eventToOutput({ ...event, url: object.url, etag: object.etag }),
		);
	}

	if (operation === 'getMany') {
		const calendarUrl = context.getNodeParameter('calendarUrl', itemIndex) as string;
		const rangeStart = context.getNodeParameter('rangeStart', itemIndex) as string;
		const rangeEnd = context.getNodeParameter('rangeEnd', itemIndex) as string;
		const expandRecurring = context.getNodeParameter('expandRecurring', itemIndex, true) as boolean;
		const searchText = (
			context.getNodeParameter('searchText', itemIndex, '') as string
		).toLowerCase();
		const limit = context.getNodeParameter('limit', itemIndex, 50) as number;

		const objects = await fetchObjects(client, calendarUrl, {
			componentFilter: 'VEVENT',
			timeRange: { start: rangeStart, end: rangeEnd },
		});
		const results: IDataObject[] = [];
		for (const object of objects) {
			const events = parseEvents(object.data);
			const masters = events.filter((event) => !event.recurrenceId);
			for (const event of masters) {
				const matchesSearch =
					searchText === '' ||
					[event.summary, event.description ?? '', event.location ?? '']
						.join('\n')
						.toLowerCase()
						.includes(searchText);
				if (!matchesSearch) continue;
				if (expandRecurring && event.rrule) {
					for (const instance of expandEvent(event, rangeStart, rangeEnd)) {
						results.push(
							eventToOutput({
								...instance.master,
								start: instance.start,
								end: instance.end,
								recurrenceId: instance.recurrenceId,
								url: object.url,
								etag: object.etag,
							}),
						);
					}
				} else {
					results.push(eventToOutput({ ...event, url: object.url, etag: object.etag }));
				}
			}
		}
		results.sort((a, b) => String(a.start).localeCompare(String(b.start)));
		return results.slice(0, limit);
	}

	if (operation === 'update') {
		const objectUrl = context.getNodeParameter('objectUrl', itemIndex) as string;
		const updateFields = context.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
		const ignoreConflicts = context.getNodeParameter('ignoreConflicts', itemIndex, false) as boolean;
		const existing = await fetchByUrl(client, objectUrl);
		const updates = collectEventInput(context, itemIndex, updateFields);
		if (typeof updateFields.start === 'string' && updateFields.start !== '')
			updates.start = updateFields.start;
		if (typeof updateFields.end === 'string' && updateFields.end !== '')
			updates.end = updateFields.end;
		if (typeof updateFields.timezone === 'string' && updateFields.timezone !== '')
			updates.timezone = updateFields.timezone;
		const updatedIcs = applyEventUpdate(existing.data, updates);
		await updateObject(client, objectUrl, updatedIcs, ignoreConflicts ? undefined : existing.etag);
		const refreshed = await fetchByUrl(client, objectUrl);
		return parseEvents(refreshed.data).map((event) =>
			eventToOutput({ ...event, url: refreshed.url, etag: refreshed.etag }),
		);
	}

	if (operation === 'delete') {
		const objectUrl = context.getNodeParameter('objectUrl', itemIndex) as string;
		const ignoreConflicts = context.getNodeParameter('ignoreConflicts', itemIndex, false) as boolean;
		let etag: string | undefined;
		if (!ignoreConflicts) {
			try {
				etag = (await fetchByUrl(client, objectUrl)).etag;
			} catch {
				return [{ deleted: true, url: objectUrl, note: 'Object was already gone' }];
			}
		}
		await deleteObject(client, objectUrl, etag);
		return [{ deleted: true, url: objectUrl }];
	}

	if (operation === 'move') {
		const objectUrl = context.getNodeParameter('objectUrl', itemIndex) as string;
		const targetCalendarUrl = context.getNodeParameter('targetCalendarUrl', itemIndex) as string;
		const existing = await fetchByUrl(client, objectUrl);
		const [event] = parseEvents(existing.data);
		const filename = `${encodeURIComponent(event.uid)}.ics`;
		const { url } = await createObject(client, targetCalendarUrl, filename, existing.data);
		await deleteObject(client, objectUrl, existing.etag);
		const moved = await fetchByUrl(client, url);
		return parseEvents(moved.data).map((parsed) =>
			eventToOutput({ ...parsed, url: moved.url, etag: moved.etag }),
		);
	}

	throw new Error(`Unsupported event operation "${operation}"`);
}
