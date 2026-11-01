# SS-30 — Scoped 10–20 speaker pilot evidence envelope

The endpoint-only ControlledSpeakerPilot plans 10–20 unique speaker/output IDs
with private opaque consent references covering a declared session. It can
accept a verifier-returned observation bound to the exact session and all
planned outputs, while enforcing organizer/operator roles, freshness,
idempotency and duplicate/missing-output denials.

Measured dropout and clock-drift failures are preserved as FAILED envelope
outcomes. The organizer-supplied limits are only declared test thresholds,
not a universal safety standard. A fixture verifier is not hardware proof.
The summary omits participant consent references and always reports
fieldValidated=false. Nothing powers, captures or plays through speakers.

The canonical SS-29 dependency, real 10–20-speaker controlled pilot, signed
endpoint measurement, acoustic field review, authenticated output leases and
participant safety evidence must all be completed before product acceptance.
