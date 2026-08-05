import { describe, expect, it } from 'vitest';

import { buildAuthHeaders, buildClientOptions, validateServerUrl } from '../clientFactory';
import type { CalDavConnection } from '../../types';

const basicConn: CalDavConnection = {
	serverUrl: 'https://caldav.example.com',
	authMethod: 'basic',
	allowHttp: false,
	username: 'user',
	password: 'secret',
};

describe('validateServerUrl', () => {
	it('accepts https URLs', () => {
		expect(() => validateServerUrl(basicConn)).not.toThrow();
	});

	it('rejects http URLs unless allowHttp is set', () => {
		const conn = { ...basicConn, serverUrl: 'http://localhost:5232' };
		expect(() => validateServerUrl(conn)).toThrow(/HTTPS/);
		expect(() => validateServerUrl({ ...conn, allowHttp: true })).not.toThrow();
	});

	it('rejects malformed URLs', () => {
		expect(() => validateServerUrl({ ...basicConn, serverUrl: 'not a url' })).toThrow(/valid URL/);
	});
});

describe('buildClientOptions', () => {
	it('builds Basic auth options', () => {
		const options = buildClientOptions(basicConn);
		expect(options.authMethod).toBe('Basic');
		expect(options.credentials).toEqual({ username: 'user', password: 'secret' });
		expect(options.defaultAccountType).toBe('caldav');
	});

	it('builds tsdav Oauth options when a refresh token is available', () => {
		const options = buildClientOptions({
			serverUrl: 'https://apidata.googleusercontent.com/caldav/v2/',
			authMethod: 'oauth2',
			allowHttp: false,
			refreshToken: '1//refresh',
			clientId: 'client-id',
			clientSecret: 'client-secret',
			tokenUrl: 'https://oauth2.googleapis.com/token',
		});
		expect(options.authMethod).toBe('Oauth');
		expect(options.credentials).toEqual({
			tokenUrl: 'https://oauth2.googleapis.com/token',
			refreshToken: '1//refresh',
			clientId: 'client-id',
			clientSecret: 'client-secret',
		});
	});

	it('falls back to Bearer when only an access token is available', () => {
		const options = buildClientOptions({
			serverUrl: 'https://apidata.googleusercontent.com/caldav/v2/',
			authMethod: 'oauth2',
			allowHttp: false,
			accessToken: 'ya29.token',
		});
		expect(options.authMethod).toBe('Bearer');
		expect(options.credentials).toEqual({ accessToken: 'ya29.token' });
	});

	it('builds Custom header options for token connections', async () => {
		const options = buildClientOptions({
			serverUrl: 'https://dav.example.com',
			authMethod: 'token',
			allowHttp: false,
			headerName: 'X-Api-Key',
			tokenPrefix: '',
			token: 'abc123',
		});
		expect(options.authMethod).toBe('Custom');
		const headers = await options.authFunction?.(options.credentials);
		expect(headers).toEqual({ 'X-Api-Key': 'abc123' });
	});
});

describe('buildAuthHeaders', () => {
	it('encodes Basic credentials', () => {
		expect(buildAuthHeaders(basicConn)).toEqual({
			Authorization: `Basic ${Buffer.from('user:secret').toString('base64')}`,
		});
	});

	it('builds Bearer headers', () => {
		expect(
			buildAuthHeaders({
				serverUrl: 'https://x',
				authMethod: 'oauth2',
				allowHttp: false,
				accessToken: 't0k',
			}),
		).toEqual({ Authorization: 'Bearer t0k' });
	});

	it('builds custom token headers with prefix', () => {
		expect(
			buildAuthHeaders({
				serverUrl: 'https://x',
				authMethod: 'token',
				allowHttp: false,
				headerName: 'Authorization',
				tokenPrefix: 'Bearer',
				token: 'zzz',
			}),
		).toEqual({ Authorization: 'Bearer zzz' });
	});
});
