import type { INodeTypeBaseDescription, IVersionedNodeType } from 'n8n-workflow';
import { VersionedNodeType } from 'n8n-workflow';

import { CalDavV1 } from './v1/CalDavV1';

export class CalDav extends VersionedNodeType {
	constructor() {
		const baseDescription: INodeTypeBaseDescription = {
			displayName: 'CalDAV',
			name: 'calDav',
			icon: { light: 'file:caldav.svg', dark: 'file:caldav.dark.svg' },
			group: ['transform'],
			description:
				'Manage calendars, events, and tasks on any CalDAV server (iCloud, Google, Nextcloud, Fastmail, Radicale, and more)',
			defaultVersion: 1,
		};
		const nodeVersions: IVersionedNodeType['nodeVersions'] = {
			1: new CalDavV1(baseDescription),
		};
		super(nodeVersions, baseDescription);
	}
}
