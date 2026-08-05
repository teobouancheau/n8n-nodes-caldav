# Testing

## Automated

- `npm test` — unit tests: ICS parse/build round-trips, recurrence expansion (DST, EXDATE, overrides, COUNT), sync diffing, free/busy merging, auth option building, error mapping.
- `npm run test:integration` — end-to-end against a live Radicale server (`RUN_INTEGRATION=1`, server URL override via `CALDAV_TEST_URL`): calendar creation/listing/deletion, event CRUD with ETag conflict rejection, availability computation, the full trigger sync cycle (baseline, create, update, delete), invalid-sync-token recovery, task lifecycle.

CI runs both suites; the integration job installs Radicale via pip.

## Manual provider smoke checklist (before each release)

For each provider — iCloud, Google (OAuth2), Nextcloud, Fastmail — verify:

1. Credential test passes with the documented setup (app password / OAuth flow).
2. Calendar dropdown lists the account's calendars.
3. Event: create with timezone + reminder, verify in the provider's own UI; update the title; delete.
4. Recurring event: create with `FREQ=WEEKLY`, Get Many with expansion on, verify per-occurrence output.
5. Trigger: activate a Created/Updated/Deleted workflow, make a change in the provider UI, verify the poll emits exactly one item for it.
6. Tasks (Nextcloud/Fastmail only): create, complete, delete; confirm Google task operations list no calendars.
7. Attendee warning: confirm creating an event with an attendee shows the invitation caveat.

Record results per release in the GitHub release notes.
