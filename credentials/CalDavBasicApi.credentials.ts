import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CalDavBasicApi implements ICredentialType {
	name = 'calDavBasicApi';

	displayName = 'CalDAV Basic Auth API';

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
			default: '',
			required: true,
			placeholder: 'https://caldav.icloud.com',
			description:
				'Base URL of the CalDAV server. Calendars are discovered automatically from here. Examples: https://caldav.icloud.com, https://nextcloud.example.com/remote.php/dav, https://caldav.fastmail.com.',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			description: 'Account username or email address',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Account or app password. iCloud, Fastmail, and Nextcloud with 2FA require an app-specific password instead of the account password.',
		},
		{
			displayName: 'Allow HTTP (Insecure)',
			name: 'allowHttp',
			type: 'boolean',
			default: false,
			description:
				'Whether to allow plain HTTP connections. Enable only for trusted local servers such as Radicale on localhost.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			auth: {
				username: '={{$credentials.username}}',
				password: '={{$credentials.password}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.serverUrl}}',
			url: '',
			method: 'GET',
			ignoreHttpStatusErrors: false,
		},
	};
}
