import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { getClient } from '../helpers';
import { listCalendars } from '../../../../shared/transport/calendarOps';

async function loadCalendars(
	context: ILoadOptionsFunctions,
	componentFilter?: string,
): Promise<INodePropertyOptions[]> {
	const { client } = await getClient(context);
	const calendars = await listCalendars(client);
	return calendars
		.filter(
			(calendar) =>
				!componentFilter ||
				calendar.components.length === 0 ||
				calendar.components.includes(componentFilter),
		)
		.map((calendar) => ({ name: calendar.displayName, value: calendar.url }));
}

export async function getCalendars(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return loadCalendars(this);
}

export async function getTaskCalendars(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return loadCalendars(this, 'VTODO');
}
