import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import { makeUid, parseCategoriesParameter } from '../helpers';
import { applyTaskUpdate, buildTaskIcs, type TaskInput } from '../../../../shared/ical/build';
import { parseTasks } from '../../../../shared/ical/parse';
import {
	createObject,
	deleteObject,
	fetchObjects,
	updateObject,
	type RemoteObject,
} from '../../../../shared/transport/calendarOps';
import type { DavClient } from '../../../../shared/transport/clientFactory';
import type { TaskModel } from '../../../../shared/types';

export const taskOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['task'] } },
	options: [
		{ name: 'Complete', value: 'complete', description: 'Mark a task as completed', action: 'Complete a task' },
		{ name: 'Create', value: 'create', description: 'Create a task', action: 'Create a task' },
		{ name: 'Delete', value: 'delete', description: 'Delete a task', action: 'Delete a task' },
		{ name: 'Get Many', value: 'getMany', description: 'Get tasks from a calendar', action: 'Get many tasks' },
		{ name: 'Update', value: 'update', description: 'Update a task', action: 'Update a task' },
	],
	default: 'getMany',
};

export const taskFields: INodeProperties[] = [
	{
		displayName:
			'Only calendars that support tasks (VTODO) are listed. Google Calendar does not support tasks over CalDAV.',
		name: 'taskListNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['task'], operation: ['create', 'getMany'] } },
	},
	{
		displayName: 'Task List Name or ID',
		name: 'calendarUrl',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getTaskCalendars' },
		default: '',
		required: true,
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: ['task'], operation: ['create', 'getMany'] } },
	},
	// --- create ---
	{
		displayName: 'Title',
		name: 'summary',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['task'], operation: ['create'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['task'], operation: ['create'] } },
		options: [
			{ displayName: 'Categories', name: 'categories', type: 'string', default: '', description: 'Comma-separated list' },
			{ displayName: 'Custom UID', name: 'uid', type: 'string', default: '' },
			{ displayName: 'Description', name: 'description', type: 'string', default: '' },
			{ displayName: 'Due Date', name: 'due', type: 'dateTime', default: '' },
			{
				displayName: 'Priority',
				name: 'priority',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 9 },
				default: 0,
				description: '1 is highest, 9 is lowest, 0 is undefined (RFC 5545)',
			},
			{ displayName: 'Related To (Parent UID)', name: 'relatedTo', type: 'string', default: '' },
			{
				displayName: 'Timezone',
				name: 'timezone',
				type: 'string',
				default: '',
				placeholder: 'Europe/Paris',
			},
		],
	},
	// --- getMany ---
	{
		displayName: 'Include Completed',
		name: 'includeCompleted',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['task'], operation: ['getMany'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['task'], operation: ['getMany'] } },
	},
	// --- update / delete / complete ---
	{
		displayName: 'Object URL',
		name: 'objectUrl',
		type: 'string',
		default: '',
		required: true,
		description: 'Full URL of the task object (returned by other operations as "URL")',
		displayOptions: { show: { resource: ['task'], operation: ['update', 'delete', 'complete'] } },
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['task'], operation: ['update'] } },
		options: [
			{ displayName: 'Categories', name: 'categories', type: 'string', default: '' },
			{ displayName: 'Description', name: 'description', type: 'string', default: '' },
			{ displayName: 'Due Date', name: 'due', type: 'dateTime', default: '' },
			{
				displayName: 'Percent Complete',
				name: 'percentComplete',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 100 },
				default: 0,
			},
			{
				displayName: 'Priority',
				name: 'priority',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 9 },
				default: 0,
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Needs Action', value: 'NEEDS-ACTION' },
					{ name: 'In Process', value: 'IN-PROCESS' },
					{ name: 'Completed', value: 'COMPLETED' },
					{ name: 'Cancelled', value: 'CANCELLED' },
				],
				default: 'NEEDS-ACTION',
			},
			{ displayName: 'Title', name: 'summary', type: 'string', default: '' },
		],
	},
];

function taskToOutput(task: TaskModel): IDataObject {
	const { raw, ...rest } = task;
	void raw;
	return { ...rest };
}

async function fetchTaskByUrl(client: DavClient, objectUrl: string): Promise<RemoteObject> {
	const calendarUrl = objectUrl.replace(/[^/]+$/, '');
	const objects = await fetchObjects(client, calendarUrl, {
		componentFilter: 'VTODO',
		objectUrls: [objectUrl],
	});
	if (objects.length === 0) {
		throw Object.assign(new Error(`Object not found at ${objectUrl}`), { status: 404 });
	}
	return objects[0];
}

function collectTaskInput(fields: IDataObject): Partial<TaskInput> {
	const input: Partial<TaskInput> = {};
	if (typeof fields.summary === 'string' && fields.summary !== '') input.summary = fields.summary;
	if (typeof fields.description === 'string' && fields.description !== '')
		input.description = fields.description;
	if (typeof fields.due === 'string' && fields.due !== '') input.due = fields.due;
	if (typeof fields.timezone === 'string' && fields.timezone !== '')
		input.timezone = fields.timezone;
	if (typeof fields.priority === 'number' && fields.priority > 0) input.priority = fields.priority;
	if (typeof fields.status === 'string' && fields.status !== '') input.status = fields.status;
	if (typeof fields.percentComplete === 'number') input.percentComplete = fields.percentComplete;
	if (typeof fields.categories === 'string' && fields.categories !== '')
		input.categories = parseCategoriesParameter(fields.categories);
	if (typeof fields.relatedTo === 'string' && fields.relatedTo !== '')
		input.relatedTo = fields.relatedTo;
	return input;
}

export async function executeTaskOperation(
	context: IExecuteFunctions,
	client: DavClient,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	if (operation === 'create') {
		const calendarUrl = context.getNodeParameter('calendarUrl', itemIndex) as string;
		const additional = context.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
		const uid =
			typeof additional.uid === 'string' && additional.uid !== '' ? additional.uid : makeUid();
		const input: TaskInput = {
			uid,
			summary: context.getNodeParameter('summary', itemIndex) as string,
			categories: [],
			...collectTaskInput(additional),
		};
		const ics = buildTaskIcs(input);
		const { url } = await createObject(client, calendarUrl, `${encodeURIComponent(uid)}.ics`, ics);
		const created = await fetchTaskByUrl(client, url);
		return parseTasks(created.data).map((task) =>
			taskToOutput({ ...task, url: created.url, etag: created.etag }),
		);
	}

	if (operation === 'getMany') {
		const calendarUrl = context.getNodeParameter('calendarUrl', itemIndex) as string;
		const includeCompleted = context.getNodeParameter('includeCompleted', itemIndex, false) as boolean;
		const limit = context.getNodeParameter('limit', itemIndex, 50) as number;
		const objects = await fetchObjects(client, calendarUrl, { componentFilter: 'VTODO' });
		const results: IDataObject[] = [];
		for (const object of objects) {
			for (const task of parseTasks(object.data)) {
				if (!includeCompleted && task.status === 'COMPLETED') continue;
				results.push(taskToOutput({ ...task, url: object.url, etag: object.etag }));
			}
		}
		return results.slice(0, limit);
	}

	if (operation === 'update' || operation === 'complete') {
		const objectUrl = context.getNodeParameter('objectUrl', itemIndex) as string;
		const existing = await fetchTaskByUrl(client, objectUrl);
		const updates =
			operation === 'complete'
				? { status: 'COMPLETED', percentComplete: 100 }
				: collectTaskInput(context.getNodeParameter('updateFields', itemIndex, {}) as IDataObject);
		const updatedIcs = applyTaskUpdate(existing.data, updates);
		await updateObject(client, objectUrl, updatedIcs, existing.etag);
		const refreshed = await fetchTaskByUrl(client, objectUrl);
		return parseTasks(refreshed.data).map((task) =>
			taskToOutput({ ...task, url: refreshed.url, etag: refreshed.etag }),
		);
	}

	if (operation === 'delete') {
		const objectUrl = context.getNodeParameter('objectUrl', itemIndex) as string;
		await deleteObject(client, objectUrl);
		return [{ deleted: true, url: objectUrl }];
	}

	throw new Error(`Unsupported task operation "${operation}"`);
}
