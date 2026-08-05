import { DateTime } from 'luxon';

/**
 * Minimal Windows -> IANA mapping for the zones most commonly emitted by
 * Outlook/Exchange-generated ICS. Unknown names return null so callers fall
 * back to parsing the embedded VTIMEZONE component instead of guessing.
 */
const WINDOWS_TO_IANA: Record<string, string> = {
	'AUS Eastern Standard Time': 'Australia/Sydney',
	'Central Europe Standard Time': 'Europe/Budapest',
	'Central European Standard Time': 'Europe/Warsaw',
	'Central Standard Time': 'America/Chicago',
	'China Standard Time': 'Asia/Shanghai',
	'Eastern Standard Time': 'America/New_York',
	'GMT Standard Time': 'Europe/London',
	'India Standard Time': 'Asia/Kolkata',
	'Mountain Standard Time': 'America/Denver',
	'Pacific Standard Time': 'America/Los_Angeles',
	'Romance Standard Time': 'Europe/Paris',
	'Russian Standard Time': 'Europe/Moscow',
	'SE Asia Standard Time': 'Asia/Bangkok',
	'Singapore Standard Time': 'Asia/Singapore',
	'Tokyo Standard Time': 'Asia/Tokyo',
	'UTC': 'UTC',
	'W. Europe Standard Time': 'Europe/Berlin',
};

function isValidIanaZone(zone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

export function resolveTimezone(tzid: string | null): string | null {
	if (!tzid) return null;
	const mapped = WINDOWS_TO_IANA[tzid];
	if (mapped) return mapped;
	return isValidIanaZone(tzid) ? tzid : null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Interprets a wall-clock ISO string in the given IANA zone and returns an
 * ISO 8601 string carrying the correct UTC offset. Date-only strings
 * (all-day values) pass through unchanged; a null zone means UTC.
 */
export function toIsoInZone(wallClock: string, zone: string | null): string {
	if (DATE_ONLY.test(wallClock)) return wallClock;
	const dt = DateTime.fromISO(wallClock, { zone: zone ?? 'utc' });
	if (!dt.isValid) {
		throw new Error(`Invalid date-time "${wallClock}" for zone "${zone ?? 'UTC'}"`);
	}
	const iso = dt.toISO({ suppressMilliseconds: true });
	if (iso === null) {
		throw new Error(`Could not format date-time "${wallClock}"`);
	}
	return iso;
}
