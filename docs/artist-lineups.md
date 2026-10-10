# SS-07 artist calls and lineup agreement kernel

This development module provides organizer-scoped artist calls, performer applications, private offer/response state, schedule-conflict checks and a consent-filtered public lineup. Performer acceptance is a workflow acknowledgement, **not** a signature or legal contract.

## Trust and storage boundary

The application receives `SceneActor` claims exclusively from a verified identity adapter. Do not wire the local draft actor to this module for remote operations. Private pitches, fee terms, share percentages, rights references and performer identity IDs remain only on authorized endpoints and require authenticated E2EE storage/transport adapters. No server-side plaintext persistence is provided.

The public API returns only open-call public text and accepted, explicitly publication-consented stage names and time slots. A site revision hides old calls and lineups; re-offer terms for the new plan. Private state is memory-only until an authenticated persistence integration is delivered.

## Remaining SS-07 acceptance gates

Connect real identity, encrypted draft storage, invitations, rights verification, enforceable contract signing where required, organizer/performer UI and cancellation notifications. Test actual accounts and role revocation independently. This PR is a portable domain implementation, not a finished production event-management workflow.
