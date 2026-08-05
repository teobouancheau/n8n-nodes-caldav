export interface DescribedError {
	message: string;
	description?: string;
	httpCode: string;
}

/**
 * Maps an HTTP status + host to a user-actionable message. Pure so it stays
 * unit-testable; node code wraps the result in NodeApiError.
 */
export function describeCalDavError(status: number, host: string): DescribedError {
	const httpCode = String(status);
	if (status === 401 || status === 403) {
		if (host.includes('icloud.com')) {
			return {
				message:
					'iCloud rejected the credentials. Use an app-specific password generated at appleid.apple.com, not your Apple ID password',
				description:
					'Sign in at appleid.apple.com, then App-Specific Passwords, and use the generated 16-character password here.',
				httpCode,
			};
		}
		if (host.includes('googleusercontent.com') || host.includes('google.com')) {
			return {
				message:
					'Google rejected the request. Google CalDAV requires OAuth2 credentials; Basic authentication is not supported',
				description: 'Use the CalDAV OAuth2 credential type with a Google Cloud OAuth client.',
				httpCode,
			};
		}
		return {
			message:
				'The server rejected the credentials. Check the username and password; many providers require an app password instead of the account password',
			httpCode,
		};
	}
	if (status === 404) {
		return {
			message:
				'The calendar or object was not found. It may have been deleted, or the URL may be wrong',
			httpCode,
		};
	}
	if (status === 412) {
		return {
			message:
				'The object changed on the server since it was read (ETag mismatch). Re-fetch the item and retry the operation',
			httpCode,
		};
	}
	if (status === 429) {
		return {
			message: 'The server rate-limited the request. Reduce polling frequency or retry later',
			httpCode,
		};
	}
	if (status >= 500) {
		return {
			message: `The CalDAV server returned an error (HTTP ${status}). Retry later`,
			httpCode,
		};
	}
	return { message: `CalDAV request failed with HTTP ${status}`, httpCode };
}
