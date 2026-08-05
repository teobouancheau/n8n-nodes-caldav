import { DateTime } from 'luxon';

import type { EtagMap, SyncDiff } from '../types';

export function diffEtagMaps(previous: EtagMap, current: EtagMap): SyncDiff {
	const created: string[] = [];
	const updated: string[] = [];
	for (const [href, etag] of Object.entries(current)) {
		if (!(href in previous)) created.push(href);
		else if (previous[href] !== etag) updated.push(href);
	}
	const deleted = Object.keys(previous).filter((href) => !(href in current));
	return { created, updated, deleted };
}

export function instanceKey(
	uid: string,
	recurrenceIdOrStart: string,
	kind: 'started' | 'ended',
): string {
	return `${uid}:${recurrenceIdOrStart}:${kind}`;
}

export interface WindowInstance {
	start: string;
	end?: string;
	key: string;
}

/**
 * Returns keys of instances whose start (or end) falls within [from, to),
 * excluding keys already emitted in earlier polls.
 */
export function windowEvents(
	instances: WindowInstance[],
	from: string,
	to: string,
	kind: 'started' | 'ended',
	alreadyEmitted: ReadonlySet<string>,
): string[] {
	const fromMs = DateTime.fromISO(from, { setZone: true }).toMillis();
	const toMs = DateTime.fromISO(to, { setZone: true }).toMillis();
	const keys: string[] = [];
	for (const instance of instances) {
		if (alreadyEmitted.has(instance.key)) continue;
		const boundary = kind === 'started' ? instance.start : instance.end;
		if (!boundary) continue;
		const boundaryMs = DateTime.fromISO(boundary, { setZone: true }).toMillis();
		if (boundaryMs >= fromMs && boundaryMs < toMs) keys.push(instance.key);
	}
	return keys;
}
