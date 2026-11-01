# SS-28 — Optional live microphone candidate gate

A SceneSignal endpoint may receive a verified, short-lived measurement report
from a separately trusted, authenticated native audio verifier. The report
names one scoped input and performer-monitor route and contains bounded
round-trip latency, jitter, multiple samples, verified monitoring and performer
consent. The organizer/operator supplies the maximum latency/jitter policy;
the library does not invent a universal acceptable threshold.

The private `LiveInputCandidateGate` checks scopes, expiry, evidence shape,
replay mutation, metric ceilings, consent and current operator role before
holding a candidate. Its result explicitly marks `fieldValidated:false`
and is NOT a live capture, audio routing action, output-device command,
encrypted transport authorization or production safety certification.
A separate native monitor, signed transport/output lease, safety stop and
current session authorization are required to begin actual sound.

No measurement or hardware experiment has been conducted, and test callback
fixtures are not authentic signed microphone evidence. Real performer
monitoring/latency field results and predecessor SS-27 remain required.
