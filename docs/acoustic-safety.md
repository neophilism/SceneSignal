# SS-26 — Authenticated acoustic observations and emergency stop

`SceneAcousticMonitor` is a portable SceneSignal policy component built on the pinned Distributed Audio Engine's `ControlVerifier` and encrypted control-payload decoder. It does not introduce a competing identity, signature or E2EE protocol.

A scoped organizer, operator or steward can accept fresh, signed `acoustic-observation` reports with site revision, meter identity, calibration reference and claimed sound level. The configured site policy specifies a dBA threshold and maximum report staleness. Reports for old sites, forged signers, expired calibration and untrusted roles cannot qualify. Out-of-bounds signed reports trigger a persistent stop via `SceneSession.stop`; the next site requires fresh authorization. An explicit steward emergency stop does not require any sensor.

**A correctly signed number is not proof of actual calibrated sound.** Even fresh below-threshold data is labeled `adapter-reported-below-limit` and returns `verifiedPhysicalEvidence: false` / `safeForProductionRelease: false`. Signed reports are authenticated statements from a configured authority, not measurements independently audited on site.

When `tick()` is called during an active session and no current qualifying observation is available, output stops as `ACOUSTIC_MONITOR_STALE`. Production must run a watchdog externally at a reliable cadence; this library alone is not a hardware watchdog. Mobile OS suspension, dropped sensors, physical volume knob changes, acoustic reflections, local regulation, device-route switches, and uncontrolled speakers require additional site-specific safety controls and real field review. A normalized digital gain ceiling cannot be equated with a physical sound-pressure level.

Never expose private meter IDs, permit evidence or detailed site conditions in a public listing or Engine Room dashboard. Report only real monitored operational status through a scoped signed adapter, and do not mark a session field-valid or release-ready because these software tests pass.
