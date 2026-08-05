import { describe, expect, it } from 'vitest';

import { describeCalDavError } from '../errors';

describe('describeCalDavError', () => {
	it('hints at app-specific passwords for iCloud 401s', () => {
		const described = describeCalDavError(401, 'caldav.icloud.com');
		expect(described.message).toContain('app-specific password');
		expect(described.httpCode).toBe('401');
	});

	it('hints at OAuth2 for Google 401s', () => {
		const described = describeCalDavError(401, 'apidata.googleusercontent.com');
		expect(described.message).toContain('OAuth2');
	});

	it('explains ETag conflicts on 412', () => {
		const described = describeCalDavError(412, 'nextcloud.example.com');
		expect(described.message).toContain('changed on the server');
	});

	it('suggests retry on 429', () => {
		const described = describeCalDavError(429, 'caldav.fastmail.com');
		expect(described.message.toLowerCase()).toContain('rate');
	});

	it('falls back to a generic authentication message on other-host 401', () => {
		const described = describeCalDavError(401, 'dav.example.com');
		expect(described.message).toContain('credentials');
	});

	it('handles 404 with a helpful message', () => {
		const described = describeCalDavError(404, 'dav.example.com');
		expect(described.message).toContain('not found');
	});
});
