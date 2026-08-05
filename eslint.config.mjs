import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	...configWithoutCloudSupport,
	{
		// This package targets self-hosted n8n and intentionally uses runtime
		// dependencies (tsdav, ical.js). Verification track is a v2 goal.
		rules: { '@n8n/community-nodes/no-runtime-dependencies': 'off' },
	},
	{
		// The shared layer is pure and has no INode to construct NodeApiError
		// with; node-level code wraps its errors via wrapCalDavError().
		files: ['shared/**'],
		rules: { '@n8n/community-nodes/require-node-api-error': 'off' },
	},
];
