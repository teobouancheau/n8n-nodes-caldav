import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	IPollFunctions,
	IDataObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { describeCalDavError } from '../../../shared/errors';
import { createClient, type DavClient } from '../../../shared/transport/clientFactory';
import type { Alarm, Attendee, CalDavConnection } from '../../../shared/types';

type NodeContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

export const AUTHENTICATION_PROPERTY = {
	displayName: 'Authentication',
	name: 'authentication',
	type: 'options' as const,
	options: [
		{ name: 'Basic Auth', value: 'basic' },
		{ name: 'OAuth2', value: 'oAuth2' },
		{ name: 'Token', value: 'token' },
	],
	default: 'basic',
};

export const CREDENTIAL_DEFINITIONS = [
	{
		name: 'calDavBasicApi',
		required: true,
		displayOptions: { show: { authentication: ['basic'] } },
	},
	{
		name: 'calDavOAuth2Api',
		required: true,
		displayOptions: { show: { authentication: ['oAuth2'] } },
	},
	{
		name: 'calDavTokenApi',
		required: true,
		displayOptions: { show: { authentication: ['token'] } },
	},
];

export async function getConnection(context: NodeContext): Promise<CalDavConnection> {
	const authentication = context.getNodeParameter('authentication', 0) as string;
	if (authentication === 'oAuth2') {
		const credentials = await context.getCredentials('calDavOAuth2Api');
		const tokenData = (credentials.oauthTokenData ?? {}) as IDataObject;
		return {
			serverUrl: String(credentials.serverUrl ?? ''),
			authMethod: 'oauth2',
			allowHttp: false,
			accessToken: typeof tokenData.access_token === 'string' ? tokenData.access_token : undefined,
			refreshToken:
				typeof tokenData.refresh_token === 'string' ? tokenData.refresh_token : undefined,
			clientId: typeof credentials.clientId === 'string' ? credentials.clientId : undefined,
			clientSecret:
				typeof credentials.clientSecret === 'string' ? credentials.clientSecret : undefined,
			tokenUrl:
				typeof credentials.accessTokenUrl === 'string' ? credentials.accessTokenUrl : undefined,
		};
	}
	if (authentication === 'token') {
		const credentials = await context.getCredentials('calDavTokenApi');
		return {
			serverUrl: String(credentials.serverUrl ?? ''),
			authMethod: 'token',
			allowHttp: credentials.allowHttp === true,
			headerName: String(credentials.headerName ?? 'Authorization'),
			tokenPrefix: String(credentials.valuePrefix ?? ''),
			token: String(credentials.token ?? ''),
		};
	}
	const credentials = await context.getCredentials('calDavBasicApi');
	return {
		serverUrl: String(credentials.serverUrl ?? ''),
		authMethod: 'basic',
		allowHttp: credentials.allowHttp === true,
		username: String(credentials.username ?? ''),
		password: String(credentials.password ?? ''),
	};
}

export async function getClient(context: NodeContext): Promise<{
	client: DavClient;
	connection: CalDavConnection;
}> {
	const connection = await getConnection(context);
	try {
		const client = await createClient(connection);
		return { client, connection };
	} catch (error) {
		throw wrapCalDavError(context, error, connection.serverUrl);
	}
}

function extractStatus(error: unknown): number | undefined {
	if (error && typeof error === 'object') {
		const status = (error as { status?: unknown }).status;
		if (typeof status === 'number') return status;
		const message = (error as { message?: unknown }).message;
		if (typeof message === 'string') {
			const match = /\b([45]\d{2})\b/.exec(message);
			if (match) return Number(match[1]);
		}
	}
	return undefined;
}

export function wrapCalDavError(
	context: NodeContext,
	error: unknown,
	serverUrl: string,
	itemIndex?: number,
): NodeOperationError {
	const host = (() => {
		try {
			return new URL(serverUrl).host;
		} catch {
			return serverUrl;
		}
	})();
	const status = extractStatus(error);
	if (status !== undefined) {
		const described = describeCalDavError(status, host);
		return new NodeOperationError(context.getNode(), described.message, {
			itemIndex,
			description: described.description,
		});
	}
	const message = error instanceof Error ? error.message : String(error);
	return new NodeOperationError(context.getNode(), message, { itemIndex });
}

export function parseAttendeesParameter(value: IDataObject): Attendee[] {
	const entries = (value.attendee as IDataObject[] | undefined) ?? [];
	return entries
		.filter((entry) => typeof entry.email === 'string' && entry.email !== '')
		.map((entry) => ({
			email: String(entry.email),
			name: entry.name ? String(entry.name) : undefined,
			role: entry.role ? String(entry.role) : undefined,
			rsvp: entry.rsvp === true,
		}));
}

export function parseAlarmsParameter(value: IDataObject): Alarm[] {
	const entries = (value.alarm as IDataObject[] | undefined) ?? [];
	return entries.map((entry) => ({
		action: entry.action === 'email' || entry.action === 'audio' ? entry.action : 'display',
		trigger: `-PT${Math.max(0, Math.trunc(Number(entry.minutesBefore ?? 0)))}M`,
		description: entry.description ? String(entry.description) : undefined,
	}));
}

export function parseCategoriesParameter(value: string): string[] {
	return value
		.split(',')
		.map((category) => category.trim())
		.filter((category) => category.length > 0);
}

export function makeUid(): string {
	const time = Date.now().toString(36);
	const random = Math.random().toString(36).slice(2, 12);
	return `${time}-${random}@n8n-nodes-caldav`;
}
