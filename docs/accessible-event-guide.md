# SS-25 — Accessible event text and non-device admission

`accessibleVisitorGuide` converts only the authorized `PublicSessionPage` projection into portable text suitable for a printable handout, large-text rendering, or screen-reader delivery. It provides UTC timing, free admission and the explicit fact that a phone or account is not required to **attend**. Attendance does not imply permission to operate a physical speaker, contribute votes or receive rewards.

The formatter never reads private site authorizations, permit files, device coordinates, speaker identifiers or contribution receipts. Control characters are normalized to avoid broken textual announcements. An event area, performer names and accessibility summary are included only when already present in the approved public projection.

If the publisher has not provided accessibility details, the guide states that they are unpublished. It must not invent a quiet route, accessible path, hearing-loop availability, restroom access, or transit accommodations. A verified quiet-zone description may be included in the organizer's explicit public accessibility summary, subject to its existing disclosure review.

Unit tests cover non-device wording, authorized-field-only text, control-character removal and invalid date ranges. Real large-print and screen-reader usability, route audits, signage and non-device entrance procedures require on-site acceptance. SS-24's contribution-reward integration is a separate dependency; this text guide does not certify or trigger rewards.
