import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

export class CalDavTokenApi implements ICredentialType {
	name = 'calDavTokenApi';

	displayName = 'CalDAV Token API';

	documentationUrl = 'https://github.com/tbouancheau/n8n-nodes-caldav#credentials';

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
			placeholder: 'https://dav.example.com',
			description: 'Base URL of the CalDAV server',
		},
		{
			displayName: 'Header Name',
			name: 'headerName',
			type: 'string',
			default: 'Authorization',
			description: 'HTTP header the token is sent in',
		},
		{
			displayName: 'Value Prefix',
			name: 'valuePrefix',
			type: 'string',
			default: 'Bearer',
			description:
				'Prefix placed before the token in the header (e.g. "Bearer"). Leave empty for raw API keys.',
		},
		{
			displayName: 'Token',
			name: 'token',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Allow HTTP (Insecure)',
			name: 'allowHttp',
			type: 'boolean',
			default: false,
			description:
				'Whether to allow plain HTTP connections. Enable only for trusted local servers.',
		},
	];

	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const headerName = String(credentials.headerName || 'Authorization');
		const tokenPrefix = String(credentials.valuePrefix ?? '');
		const token = String(credentials.token ?? '');
		requestOptions.headers = {
			...requestOptions.headers,
			[headerName]: tokenPrefix ? `${tokenPrefix} ${token}` : token,
		};
		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.serverUrl}}',
			url: '',
			method: 'GET',
		},
	};
}
