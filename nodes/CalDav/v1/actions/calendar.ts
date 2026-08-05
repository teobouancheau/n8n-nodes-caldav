import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import {
	createCalendar,
	deleteCalendarCollection,
	getAvailability,
	getHomeUrl,
	listCalendars,
} from '../../../../shared/transport/calendarOps';
import type { DavClient } from '../../../../shared/transport/clientFactory';

export const calendarOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['calendar'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			description: 'Create a new calendar (MKCALENDAR)',
			action: 'Create a calendar',
		},
		{
			name: 'Delete',
			value: 'delete',
			description: 'Delete a calendar and all events in it',
			action: 'Delete a calendar',
		},
		{
			name: 'Get Availability',
			value: 'getAvailability',
			description: 'Get busy time slots in a calendar for a time range',
			action: 'Get availability',
		},
		{
			name: 'Get Many',
			value: 'getMany',
			description: 'List the calendars of the account',
			action: 'Get many calendars',
		},
	],
	default: 'getMany',
};

export const calendarFields: INodeProperties[] = [
	{
		displayName: 'Calendar Name or ID',
		name: 'calendarUrl',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getCalendars' },
		default: '',
		required: true,
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: ['calendar'], operation: ['delete', 'getAvailability'] } },
	},
	{
		displayName: 'Display Name',
		name: 'displayName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['calendar'], operation: ['create'] } },
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['calendar'], operation: ['create'] } },
	},
	{
		displayName: 'Start',
		name: 'rangeStart',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['calendar'], operation: ['getAvailability'] } },
	},
	{
		displayName: 'End',
		name: 'rangeEnd',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['calendar'], operation: ['getAvailability'] } },
	},
	{
		displayName: 'Deleting a calendar permanently removes the calendar and every event and task inside it.',
		name: 'deleteNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['calendar'], operation: ['delete'] } },
	},
];

export async function executeCalendarOperation(
	context: IExecuteFunctions,
	client: DavClient,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	if (operation === 'getMany') {
		const calendars = await listCalendars(client);
		return calendars.map((calendar) => ({ ...calendar }));
	}
	if (operation === 'create') {
		const displayName = context.getNodeParameter('displayName', itemIndex) as string;
		const description = context.getNodeParameter('description', itemIndex, '') as string;
		const homeUrl = await getHomeUrl(client);
		const slug = displayName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.concat('-', Date.now().toString(36));
		const { url } = await createCalendar(client, homeUrl, slug, {
			displayName,
			description: description || undefined,
			components: ['VEVENT', 'VTODO'],
		});
		return [{ url, displayName, description }];
	}
	if (operation === 'delete') {
		const calendarUrl = context.getNodeParameter('calendarUrl', itemIndex) as string;
		await deleteCalendarCollection(client, calendarUrl);
		return [{ deleted: true, url: calendarUrl }];
	}
	if (operation === 'getAvailability') {
		const calendarUrl = context.getNodeParameter('calendarUrl', itemIndex) as string;
		const rangeStart = context.getNodeParameter('rangeStart', itemIndex) as string;
		const rangeEnd = context.getNodeParameter('rangeEnd', itemIndex) as string;
		const busy = await getAvailability(client, calendarUrl, { start: rangeStart, end: rangeEnd });
		return [{ busy, rangeStart, rangeEnd }];
	}
	throw new Error(`Unsupported calendar operation "${operation}"`);
}
