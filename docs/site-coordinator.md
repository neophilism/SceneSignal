# SS-12 — Scoped local site coordinator (portable kernel)

`SceneSiteCoordinator` integrates the actual pinned Distributed Audio Engine `CoordinatorMonitor` and `CoordinatorChunkTransport` instead of implementing an alternate transport or key protocol.

The organizer or operator can accept a short-lived, signed primary-endpoint coordinator lease that selects one of the previously registered ciphertext-only local transports. If the lease is missing, expired, or the local fetch fails, the core's bounded remote ciphertext fallback applies. The lease never supplies an arbitrary address; the route is bound to an already provisioned transport ID.

Every instance is bound to one `SceneSession` site revision. A plan change, cancellation, stop or endpoint disconnect permanently invalidates the old instance and in-flight results. The next site revision needs a new coordinator with fresh authority. Performer and cross-tenant requests are denied.

`diagnostics()` reports only the candidate local-lease state and always marks native device readiness and field validation **false**. A signed lease proves only scoped authorization, not Bluetooth hardware timing, calibrated acoustics, E2EE decryption, verified gain, or entitlement to broadcast.

This package is an endpoint orchestration adapter, not a production service. Deployment requires real account provisioning, a persistently replay-protected checkpoint store, an authenticated E2EE control decoder, preregistered local transport implementations, native output leases, cross-device clock measurements, controlled field trials and independent review. Private audio keys and spatial telemetry must never be placed in the local ciphertext router or operator diagnostics.
