# SS-19 — Smooth contributor-density changes

`SceneSpeakerTransition` operates on real Distributed Audio Engine `MixPlan` records. It interpolates **gains only**, keeping the latest authorized plan's source set, speaker list and gain ceilings authoritative.

- A newly joined speaker starts silent and ramps into the next plan.
- A departed, disconnected or consent-revoked speaker is **omitted immediately**. The engine does not attempt to fade out a device it no longer controls or has permission to use.
- Continuing speakers can move smoothly to their new spatial weight. A lowered ceiling is enforced at every step, including the initial instant.
- Rapid successive topology changes start from the currently rendered safe gain plan; source-set changes are rejected pending a separately authorized timeline transition.
- Input gain plans are checked for limits and source/row completeness; stale time moves are rejected.
- Returns `fieldValidated: false`. This is a portable computational envelope only. It does not prove physical output attenuation, measured synchronization, consent revocation timing, acoustic safety or acceptable speaker dropout.

The native renderer must enforce independent output-route identity and signed lease boundaries. Immediate hardware disconnect can produce unavoidable discontinuities at the absent device; this algorithm cannot transmit a fade command to lost hardware. Actual synchronized 10–20-speaker pilot evidence and hardware safety limits are still release gates.
