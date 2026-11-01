# SS-27 — Scoped site operations and incident stop kernel

`SceneSiteOperations` is a private endpoint-only contract for site/weather,
access, medical and safety reports. It is pinned to the session/site revision;
operator, organizer or steward must be authenticated by the trusted endpoint
identity adapter. Only an organizer may configure opaque references to
securely held site contacts. This package never accepts raw phone numbers,
emails, permit details, route coordinates or medical records.

A time-bounded operator report can be an advisory (no change in playback)
or a stop. STOP invokes `SceneSession.stop` before recording the incident,
so authorized output is stopped through the session's existing callback;
an old coordinator, credential or timeline is not reauthorized. Same-ID
replays are idempotent, conflicting edits are rejected, and new operations
on a stopped, cancelled or superseded site revision fail closed. Incident
records are memory-local and require private durable storage before deployment.

The returned snapshot exposes only IDs and classifications and always marks
`fieldValidated: false`. An organizer's assertion is not a verified weather
feed, measured accessibility, emergency-service dispatch or professional
medical advice. The full SS-27 acceptance still depends on SS-26 emergency
output controls and on-site operational drills, route review and contact
verification. This kernel creates no new external accounts or paid service.
