import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { calendarFields, calendarOperations, executeCalendarOperation } from './actions/calendar';
import { eventFields, eventOperations, executeEventOperation } from './actions/event';
import { executeTaskOperation, taskFields, taskOperations } from './actions/task';
import { AUTHENTICATION_PROPERTY, CREDENTIAL_DEFINITIONS, getClient, wrapCalDavError } from './helpers';
import { getCalendars, getTaskCalendars } from './methods/loadOptions';

export class CalDavV1 implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			icon: { light: 'file:caldav.svg', dark: 'file:caldav.dark.svg' },
			version: 1,
			defaults: { name: 'CalDAV' },
			inputs: [NodeConnectionTypes.Main],
			outputs: [NodeConnectionTypes.Main],
			usableAsTool: true,
			credentials: CREDENTIAL_DEFINITIONS,
			properties: [
				AUTHENTICATION_PROPERTY,
				{
					displayName: 'Resource',
					name: 'resource',
					type: 'options',
					noDataExpression: true,
					options: [
						{ name: 'Calendar', value: 'calendar' },
						{ name: 'Event', value: 'event' },
						{ name: 'Task', value: 'task' },
					],
					default: 'event',
				},
				calendarOperations,
				eventOperations,
				taskOperations,
				...calendarFields,
				...eventFields,
				...taskFields,
			],
		};
	}

	methods = {
		loadOptions: { getCalendars, getTaskCalendars },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const { client, connection } = await getClient(this);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				let results;
				if (resource === 'calendar') {
					results = await executeCalendarOperation(this, client, operation, itemIndex);
				} else if (resource === 'event') {
					results = await executeEventOperation(this, client, operation, itemIndex);
				} else if (resource === 'task') {
					results = await executeTaskOperation(this, client, operation, itemIndex);
				} else {
					throw new NodeOperationError(this.getNode(), `Unsupported resource "${resource}"`);
				}
				for (const result of results) {
					returnData.push({ json: result, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				const wrapped = wrapCalDavError(this, error, connection.serverUrl, itemIndex);
				if (this.continueOnFail()) {
					returnData.push({ json: { error: wrapped.message }, pairedItem: { item: itemIndex } });
					continue;
				}
				throw wrapped;
			}
		}
		return [returnData];
	}
}
