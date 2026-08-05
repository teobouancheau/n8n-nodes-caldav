import { describe, expect, it } from 'vitest';

import { resolveTimezone, toIsoInZone } from '../timezone';

describe('resolveTimezone', () => {
	it('passes through valid IANA zone names', () => {
		expect(resolveTimezone('Europe/Paris')).toBe('Europe/Paris');
		expect(resolveTimezone('America/New_York')).toBe('America/New_York');
		expect(resolveTimezone('UTC')).toBe('UTC');
	});

	it('maps common Windows zone names to IANA', () => {
		expect(resolveTimezone('W. Europe Standard Time')).toBe('Europe/Berlin');
		expect(resolveTimezone('Eastern Standard Time')).toBe('America/New_York');
		expect(resolveTimezone('GMT Standard Time')).toBe('Europe/London');
	});

	it('returns null for unknown zones', () => {
		expect(resolveTimezone('Customized Time Zone')).toBeNull();
		expect(resolveTimezone('Not/A_Zone_At_All')).toBeNull();
	});

	it('returns null for null input', () => {
		expect(resolveTimezone(null)).toBeNull();
	});
});

describe('toIsoInZone', () => {
	it('converts a wall-clock time to ISO with the zone offset', () => {
		// 2026-06-15 14:30 in Paris is UTC+2 (summer)
		expect(toIsoInZone('2026-06-15T14:30:00', 'Europe/Paris')).toBe('2026-06-15T14:30:00+02:00');
	});

	it('applies winter offset across DST boundary', () => {
		// 2026-01-15 14:30 in Paris is UTC+1
		expect(toIsoInZone('2026-01-15T14:30:00', 'Europe/Paris')).toBe('2026-01-15T14:30:00+01:00');
	});

	it('treats missing zone as UTC', () => {
		expect(toIsoInZone('2026-06-15T14:30:00', null)).toBe('2026-06-15T14:30:00Z');
	});

	it('returns plain date strings unchanged (all-day values)', () => {
		expect(toIsoInZone('2026-06-15', 'Europe/Paris')).toBe('2026-06-15');
	});
});
