import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	AUTHENTICATION_PROPERTY,
	CREDENTIAL_DEFINITIONS,
	getClient,
	wrapCalDavError,
} from '../CalDav/v1/helpers';
import { getCalendars, getTaskCalendars } from '../CalDav/v1/methods/loadOptions';
import { parseEvents } from '../../shared/ical/parse';
import { expandEvent } from '../../shared/ical/recurrence';
import { instanceKey, windowEvents, type WindowInstance } from '../../shared/sync/diff';
import {
	fetchObjects,
	listCalendars,
	smartSync,
	type RemoteObject,
} from '../../shared/transport/calendarOps';
import type { EventModel, TriggerState } from '../../shared/types';

const MAX_EMITTED_KEYS = 2000;

type TriggerEvent = 'created' | 'updated' | 'deleted' | 'started' | 'ended';

function eventOutput(event: EventModel, calendarUrl: string, trigger: TriggerEvent): IDataObject {
	const { raw, ...rest } = event;
	void raw;
	return { event: trigger, calendarUrl, ...rest };
}

function objectEvents(object: RemoteObject): EventModel[] {
	return parseEvents(object.data)
		.filter((event) => !event.recurrenceId)
		.map((event) => ({ ...event, url: object.url, etag: object.etag }));
}

// Trigger nodes cannot act as AI Agent tools, and INodeTypeDescription only
// permits `usableAsTool: true`, so the property is omitted deliberately.
// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class CalDavTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CalDAV Trigger',
		name: 'calDavTrigger',
		icon: { light: 'file:../CalDav/caldav.svg', dark: 'file:../CalDav/caldav.dark.svg' },
		group: ['trigger'],
		version: 1,
		description:
			'Starts the workflow when events in a CalDAV calendar are created, updated, deleted, started, or ended',
		subtitle: '={{$parameter["events"].join(", ")}}',
		defaults: { name: 'CalDAV Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: CREDENTIAL_DEFINITIONS,
		properties: [
			AUTHENTICATION_PROPERTY,
			{
				displayName: 'Calendar Name or ID',
				name: 'calendarUrl',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getCalendars' },
				default: '',
				required: true,
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Trigger On',
				name: 'events',
				type: 'multiOptions',
				options: [
					{ name: 'Event Created', value: 'created' },
					{ name: 'Event Deleted', value: 'deleted' },
					{ name: 'Event Ended', value: 'ended' },
					{ name: 'Event Started', value: 'started' },
					{ name: 'Event Updated', value: 'updated' },
				],
				default: ['created'],
				required: true,
			},
		],
	};

	methods = {
		loadOptions: { getCalendars, getTaskCalendars },
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const calendarUrl = this.getNodeParameter('calendarUrl') as string;
		const selected = this.getNodeParameter('events') as TriggerEvent[];
		const isManual = this.getMode() === 'manual';
		const { client, connection } = await getClient(this);

		const staticData = this.getWorkflowStaticData('node') as IDataObject;
		const state: TriggerState = {
			syncToken: typeof staticData.syncToken === 'string' ? staticData.syncToken : undefined,
			ctag: typeof staticData.ctag === 'string' ? staticData.ctag : undefined,
			etags: (staticData.etags as TriggerState['etags'] | undefined) ?? {},
			lastPoll: typeof staticData.lastPoll === 'string' ? staticData.lastPoll : undefined,
			emittedInstances: Array.isArray(staticData.emittedInstances)
				? (staticData.emittedInstances as string[])
				: [],
		};
		const isFirstRun = state.lastPoll === undefined;
		const now = new Date().toISOString();
		const results: IDataObject[] = [];

		try {
			const wantsSync =
				selected.includes('created') || selected.includes('updated') || selected.includes('deleted');
			if (wantsSync) {
				const calendars = await listCalendars(client);
				const calendar = calendars.find((candidate) => candidate.url === calendarUrl) ?? {
					url: calendarUrl,
					displayName: calendarUrl,
					components: [],
				};
				const sync = await smartSync(client, calendar, state);
				// The very first poll only takes a baseline snapshot: emitting the
				// whole calendar as "created" would flood the workflow.
				if (!isFirstRun || isManual) {
					if (selected.includes('created')) {
						for (const object of sync.created) {
							for (const event of objectEvents(object)) {
								results.push(eventOutput(event, calendarUrl, 'created'));
							}
						}
					}
					if (selected.includes('updated')) {
						for (const object of sync.updated) {
							for (const event of objectEvents(object)) {
								results.push(eventOutput(event, calendarUrl, 'updated'));
							}
						}
					}
					if (selected.includes('deleted')) {
						for (const gone of sync.deleted) {
							results.push({ event: 'deleted', calendarUrl, url: gone.url });
						}
					}
				}
				staticData.syncToken = sync.nextSyncToken;
				staticData.ctag = sync.nextCtag;
				staticData.etags = sync.nextEtags;
			}

			const wantsWindow = selected.includes('started') || selected.includes('ended');
			if (wantsWindow && (!isFirstRun || isManual)) {
				const windowStart = state.lastPoll ?? now;
				const objects = await fetchObjects(client, calendarUrl, {
					componentFilter: 'VEVENT',
					timeRange: { start: windowStart, end: now },
				});
				const alreadyEmitted = new Set(state.emittedInstances);
				const emitted: string[] = [...state.emittedInstances];
				for (const object of objects) {
					for (const event of objectEvents(object)) {
						const instances = expandEvent(event, windowStart, now).map((instance) => ({
							instance,
							started: instanceKey(event.uid, instance.recurrenceId, 'started'),
							ended: instanceKey(event.uid, instance.recurrenceId, 'ended'),
						}));
						for (const kind of ['started', 'ended'] as const) {
							if (!selected.includes(kind)) continue;
							const windowInstances: WindowInstance[] = instances.map((entry) => ({
								start: entry.instance.start,
								end: entry.instance.end,
								key: entry[kind],
							}));
							const keys = windowEvents(windowInstances, windowStart, now, kind, alreadyEmitted);
							for (const key of keys) {
								const entry = instances.find((candidate) => candidate[kind] === key);
								if (!entry) continue;
								results.push({
									...eventOutput(entry.instance.master, calendarUrl, kind),
									start: entry.instance.start,
									end: entry.instance.end,
									recurrenceId: entry.instance.recurrenceId,
								});
								alreadyEmitted.add(key);
								emitted.push(key);
							}
						}
					}
				}
				staticData.emittedInstances = emitted.slice(-MAX_EMITTED_KEYS);
			}

			staticData.lastPoll = now;
		} catch (error) {
			throw wrapCalDavError(this, error, connection.serverUrl);
		}

		if (results.length === 0) {
			if (isManual) {
				throw new NodeOperationError(
					this.getNode(),
					'No event changes found. Modify an event in the calendar and test again, or activate the workflow to poll continuously.',
				);
			}
			return null;
		}
		return [this.helpers.returnJsonArray(results)];
	}
}
