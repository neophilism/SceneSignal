# SS-24 — Verified session-contribution facts

The endpoint-only `SessionContributionLedger` accepts **only** claims returned by an authenticated verifier. The opaque client receipt itself does not award any points. Claims must bind to the exact SceneSignal tenant/session, a unique observation ID, a speaker, a contributor, bounded verified duration and a recent timestamp. Duplicate evidence credits no additional time; conflicting replays fail closed. Per-contributor and ledger record caps prevent unbounded credits in a single endpoint instance.

The private summary reports observed seconds by contributor identifier. These are neutral factual credits, **not** money, tokens, audience rankings, automatic vesting, rights to a share of revenue or field-validated participation. No Distributed Radio Engine or TrackZero economics are imported. The test verifier is a fixture, not a cryptographic device attestation.

## Integration still required

- Pin and exercise DAE-14 and DAE-16 contribution and secure-verifier contracts before treating a receipt as genuine hardware evidence.
- Connect a durable, atomic idempotency store shared across service instances. The current in-memory ledger is not crash-durable or multi-instance authoritative and must not make production payout decisions.
- Verify consent, actual contribution usefulness measurements, retention and authorized reward policy. Signed device evidence, participant identity recovery and live speaker hardware remain external prerequisites.
- Keep deployment and user-facing reward distribution disabled until those tests and explicit policy gates pass.

Negative tests in `tests/session-contribution.test.ts` cover scope denial, stale evidence, inflated duration, replay conflicts, zero proof and per-contributor caps. Passing these tests establishes only this local source contract.
