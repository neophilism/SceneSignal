# SS-15 — Private composition ingestion contract

Implemented by `src/composition-ingestion.ts`; tests in `tests/composition-ingestion.test.ts`.

## Endpoint trust boundary

The manifest is private and must contain encrypted object references, not key material or PCM. Organizers and operators may admit a complete fallback mix and 1–64 aligned stems only within their tenant/session scope. The manifest is cloned before any asynchronous decode probe to prevent caller mutation races. IDs and encrypted object IDs must be unique; each object declares sample rate, frame count, channel count and a SHA-256 digest of its decoded PCM.

A caller-supplied authorized endpoint probe is responsible for decrypting, decoding, and independently calculating PCM evidence. The server-side ingestion function does **not** possess media decryption keys and does **not** independently inspect media bytes. The probe's evidence must exactly match the private manifest. Audio files or encrypted buffers are never emitted by this API.

The rights policy and organizer/operator authority are checked before private decoding and again before acceptance. Each asset is individually rechecked at probe time to stop subsequent work after rights or role expiry. An optional AbortSignal is passed to the endpoint probe so it can cooperatively cancel active media processing. The ingestion function checks that signal before/after each asynchronous probe; cancellation after a probe begins cannot itself guarantee the endpoint actually stopped that probe.

## Verified software boundaries

The repository tests cover: private manifest cloning; aligned fallback and stems; duplicate and malformed assets; foreign actors; rights revocation; failed PCM evidence; unexpected key material; plaintext rejection; asynchronous caller mutation; cancellation before/during decode; per-asset role expiry; post-probe rights expiry; and cancellation propagation.

Passing these tests proves the source contract and mocked endpoint probes, **not** real decoder behavior, supported recording hardware, field timing, actual decryption or a production release. Real endpoint decode fixtures and DAE-06/DAE-24 media integration must still be exercised with permitted rights and production-like playback and fallback tests.

## Later use

Admission is a snapshot validation step, not durable media import or a public-release authorization. Revalidate current rights and permissions when subsequently loading, rendering or sharing any source. Do not downgrade private media to TLS-only storage or publish the manifest through the public scene projection.
