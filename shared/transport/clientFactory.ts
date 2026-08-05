import { createDAVClient } from 'tsdav';

import type { CalDavConnection } from '../types';

export type DavClient = Awaited<ReturnType<typeof createDAVClient>>;
export type DavClientOptions = Parameters<typeof createDAVClient>[0];

export function validateServerUrl(conn: CalDavConnection): void {
	let parsed: URL;
	try {
		parsed = new URL(conn.serverUrl);
	} catch {
		throw new Error(`"${conn.serverUrl}" is not a valid URL`);
	}
	if (parsed.protocol === 'http:' && !conn.allowHttp) {
		throw new Error(
			'The server URL uses plain HTTP. Enable "Allow HTTP" in the credential only for trusted local servers, or use HTTPS',
		);
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error(`Unsupported protocol "${parsed.protocol}" — use HTTPS`);
	}
}

export function buildClientOptions(conn: CalDavConnection): DavClientOptions {
	validateServerUrl(conn);
	if (conn.authMethod === 'basic') {
		return {
			serverUrl: conn.serverUrl,
			credentials: { username: conn.username, password: conn.password },
			authMethod: 'Basic',
			defaultAccountType: 'caldav',
		};
	}
	if (conn.authMethod === 'oauth2') {
		return {
			serverUrl: conn.serverUrl,
			credentials: { accessToken: conn.accessToken },
			authMethod: 'Bearer',
			defaultAccountType: 'caldav',
		};
	}
	const headerName = conn.headerName || 'Authorization';
	const tokenPrefix = conn.tokenPrefix ?? '';
	const token = conn.token ?? '';
	return {
		serverUrl: conn.serverUrl,
		credentials: { customData: {} },
		authMethod: 'Custom',
		authFunction: () =>
			Promise.resolve({ [headerName]: tokenPrefix ? `${tokenPrefix} ${token}` : token }),
		defaultAccountType: 'caldav',
	};
}

/**
 * Auth headers for the few tsdav standalone functions (e.g. freeBusyQuery)
 * that are not bound to a client instance.
 */
export function buildAuthHeaders(conn: CalDavConnection): Record<string, string> {
	if (conn.authMethod === 'basic') {
		const encoded = Buffer.from(`${conn.username ?? ''}:${conn.password ?? ''}`).toString('base64');
		return { Authorization: `Basic ${encoded}` };
	}
	if (conn.authMethod === 'oauth2') {
		return { Authorization: `Bearer ${conn.accessToken ?? ''}` };
	}
	const headerName = conn.headerName || 'Authorization';
	const tokenPrefix = conn.tokenPrefix ?? '';
	const token = conn.token ?? '';
	return { [headerName]: tokenPrefix ? `${tokenPrefix} ${token}` : token };
}

export async function createClient(conn: CalDavConnection): Promise<DavClient> {
	return createDAVClient(buildClientOptions(conn));
}
