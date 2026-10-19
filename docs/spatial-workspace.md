# Contributor speakers and Spimes

The endpoint workspace consumes the actual audio-core placement registry, spatial planner and PCM renderer. Contributor-owned physical output IDs are unique within a session; consent expires, gain stays within the contributor and session ceilings, and fixed speaker placement is independent of its owner phone. Moving speakers require bound, fresh, confidence-limited coordinate observations. A position callback is a trusted-adapter input, never proof that Bluetooth hardware was qualified.

Organizers/operators bind a Spime's physical object, source, controller, tracking method and calibration. A Spime moves its instrument, not a speaker. BLE presence/RSSI does not qualify as a coordinate. Stale or expired Spime observations suppress that anchored source until the operator explicitly removes the binding and selects manual placement. Scene/source rights are checked before composition and every mix request. Auditions are labeled simulations and never produce contribution evidence or operational facts.

`preparePrivateEvidence` uses fresh-key attachment encryption at the organizer endpoint for permit files and private assertions. `uploadPrivateEvidence` authenticates the local ciphertext and reference before sending only ciphertext and opaque retention metadata to the relay. Its private manifest/key goes through a separate required authenticated E2EE channel adapter; there is no TLS-only fallback. Relay retention is limited to 30 days. Software tests exercise real attachment encryption and tamper rejection with explicit test relay/channel adapters. Actual channel deployment, credential provisioning, permit decisions and acoustic/positioning hardware evidence remain open.

This is a portable application kernel. Local coordinator provisioning, density-change choreography, native field playback and the producer UI follow as separate work. No simulated mix qualifies a physical deployment.

## Endpoint spatial automation integration (SS-22)

`SpatialAutomation.schedule` validates a bounded monotonic keyframe sequence on the caller's common clock, requires organizer/operator authority and checks source rights. `sample` interpolates the same composition source set and rechecks rights when used. These values are endpoint planning state, not independently measured hardware output.

`SpatialWorkspace.applyAutomation` is the authorized bridge from a scheduled sample to a committed scene revision. It checks the live actor role, rejects concurrent Spime bindings, verifies that source IDs, asset IDs and roles exactly match the current private scene, then goes through the existing `compose` authorization, shape, source-rights and revision checks. It rejects repeated or regressing committed tick times to avoid replayed scene-state updates; failed attempts leave the scene revision unchanged.

No scheduled animation acquires physical output authority by itself. Venue calibration, speaker consent, acoustic safety, network synchronization, decoding and signed output leases remain independently enforced prerequisites for actual sound playback. Do not label these software tests as field validation.
