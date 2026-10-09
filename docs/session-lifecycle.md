# Session lifecycle

The session kernel lives at an authorized organizer/operator endpoint. It requires trusted scoped roles and signed site-specific authorization via the audio core's control verifier and authenticated E2EE payload decoder. Role claims come from an identity adapter; the kernel does not provision accounts or invent a key channel.

Permit verification and no-permit-required assertions bind the exact site revision, canonical private-condition digest, operating period, encrypted evidence object and consented gain ceiling. A recorded assertion is an organizer assertion, not a legal determination. Actual permit review, location-specific requirements and organizer identity verification remain operational inputs. Private permits and site details use the pinned attachment profile; their private manifest/key require the authenticated endpoint channel. The public listing deliberately discloses only the organizer's summary, period and free-admission state.

Changing a site or conditions clears authorization and stops output. Expiry, cancellation, steward emergency stop and superseded asynchronous authorization cannot restore activation. Session activation supplies limits for a separately signed, expiring audio-core lease; it does not directly authorize a sink. Native output enforcement and production identity/key-channel integration remain gates.

Software tests cover denial, signatures, scope, dates, changed conditions, stopping and asynchronous cancellation using explicit test identity and E2EE decoder adapters. No physical session, legal approval, live deployment or independent security qualification is asserted.
