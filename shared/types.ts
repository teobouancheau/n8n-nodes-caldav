export type CalDavAuthMethod = 'basic' | 'oauth2' | 'token';

export interface CalDavConnection {
	serverUrl: string;
	authMethod: CalDavAuthMethod;
	allowHttp: boolean;
	// basic
	username?: string;
	password?: string;
	// oauth2 — refresh handled by tsdav's Oauth mode (n8n's transparent refresh
	// only applies to its own HTTP helpers, which cannot issue DAV methods)
	accessToken?: string;
	refreshToken?: string;
	clientId?: string;
	clientSecret?: string;
	tokenUrl?: string;
	// token / header auth
	headerName?: string;
	tokenPrefix?: string;
	token?: string;
}

export interface CalendarInfo {
	url: string;
	displayName: string;
	color?: string;
	components: string[];
	ctag?: string;
	syncToken?: string;
}

/** href -> etag */
export type EtagMap = Record<string, string>;

export interface SyncDiff {
	created: string[];
	updated: string[];
	deleted: string[];
}

export interface TriggerState {
	syncToken?: string;
	ctag?: string;
	etags: EtagMap;
	lastPoll?: string;
	/** keys from instanceKey() already emitted for started/ended dedupe */
	emittedInstances: string[];
}

export interface Attendee {
	email: string;
	name?: string;
	rsvp?: boolean;
	role?: string;
	status?: string;
}

export interface Alarm {
	action: 'display' | 'audio' | 'email';
	/** ISO 8601 duration relative to start (e.g. -PT15M) or absolute ISO date-time */
	trigger: string;
	description?: string;
}

export interface EventModel {
	uid: string;
	url?: string;
	etag?: string;
	summary: string;
	description?: string;
	location?: string;
	eventUrl?: string;
	/** ISO 8601 date-time, or ISO date (YYYY-MM-DD) when allDay */
	start: string;
	end?: string;
	allDay: boolean;
	/** IANA zone name when known */
	timezone?: string;
	rrule?: string;
	exdates: string[];
	/** set on recurrence override components */
	recurrenceId?: string;
	status?: string;
	transparency?: string;
	organizer?: string;
	attendees: Attendee[];
	alarms: Alarm[];
	categories: string[];
	/** full original ICS of the calendar object, for round-trip-safe updates */
	raw: string;
}

export interface TaskModel {
	uid: string;
	url?: string;
	etag?: string;
	summary: string;
	description?: string;
	due?: string;
	start?: string;
	timezone?: string;
	priority?: number;
	status?: string;
	percentComplete?: number;
	categories: string[];
	relatedTo?: string;
	rrule?: string;
	raw: string;
}
