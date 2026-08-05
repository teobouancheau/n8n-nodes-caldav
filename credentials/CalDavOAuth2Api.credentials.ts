import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class CalDavOAuth2Api implements ICredentialType {
	name = 'calDavOAuth2Api';

	displayName = 'CalDAV OAuth2 API';

	extends = ['oAuth2Api'];

	documentationUrl = 'https://github.com/teobouancheau/n8n-nodes-caldav#credentials';

	icon = {
		light: 'file:../nodes/CalDav/caldav.svg',
		dark: 'file:../nodes/CalDav/caldav.dark.svg',
	} as const;

	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'string',
			default: 'https://apidata.googleusercontent.com/caldav/v2/',
			required: true,
			description:
				'Base URL of the CalDAV server. The default is Google Calendar\'s CalDAV endpoint; Google requires OAuth2 and does not accept passwords.',
		},
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'string',
			default: 'https://accounts.google.com/o/oauth2/v2/auth',
			required: true,
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'string',
			default: 'https://oauth2.googleapis.com/token',
			required: true,
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'string',
			default: 'https://www.googleapis.com/auth/calendar',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: 'access_type=offline&prompt=consent',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];
}
