# Changelog

## 1.0.0 (2026-08-05)

Initial release.

### Nodes

- **CalDAV** action node (programmatic, versioned, usable as an AI Agent tool)
  - Calendar: Get Many, Create (MKCALENDAR), Delete, Get Availability (client-side busy computation with recurrence expansion)
  - Event: Create, Get (by URL or UID), Get Many (time range, text search, client-side recurrence expansion), Update (ETag-safe, round-trip-preserving), Delete, Move between calendars
  - Task (VTODO): Create, Get Many, Update, Complete, Delete — task lists gated by `supported-calendar-component-set`
- **CalDAV Trigger** polling node: Event Created, Updated, Deleted, Started, Ended — RFC 6578 sync-token sync with ctag and full-resync fallbacks, per-instance started/ended dedup, baseline snapshot on first poll

### Credentials

- CalDAV Basic Auth (iCloud, Nextcloud, Fastmail, Radicale, Baikal, SOGo, Synology, mailbox.org app/account passwords)
- CalDAV OAuth2 (Google Calendar preconfigured; token refresh via tsdav Oauth mode)
- CalDAV Token (custom header/Bearer/API-key schemes)

### Engineering

- ICS parse and generation via ical.js with VTIMEZONE emission (@touch4it/ical-timezones); DST-correct client-side recurrence expansion
- Unit suite (58 tests) and live-server integration suite (9 tests against Radicale) covering CRUD, ETag conflicts, sync cycles, and invalid-sync-token recovery
- Zero-error pass on the official n8n community-node linter
