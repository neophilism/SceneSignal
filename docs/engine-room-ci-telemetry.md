# Optional automatic CI evidence for Engine Room

`.github/workflows/report-engine-room.yml` listens for the successful **main-branch push** completion of `SceneSignal CI`. It posts exactly one release **candidate/source revision** record via Engine Room's authenticated `engine-room-v1` telemetry adapter. This is GitHub CI evidence only: it **does not mark a service live, approved, field-validated or healthy**.

Nothing is sent until credentials are provisioned. Without all three GitHub Actions secrets the workflow skips cleanly; partial configuration fails closed.

## Configuration (in the authorized accounts only)

1. Register `neophilism/SceneSignal` in Engine Room using its approved `.exechub/project.yml` manifest. Obtain that project's actual UUID; do not guess it.
2. Issue a random per-project secret (at least 32 bytes) into the **Engine Room service's secret store**, in its `ENGINE_ROOM_TELEMETRY_KEYS` JSON array. Give the entry `adapter: "engine-room-v1"`, `capabilities: ["release"]`, `evidenceTransitions: []`, `source: "github-actions"`, and the correct `projectId` and `environment`. Do not grant permission to mark live or approved releases.
3. Configure these **GitHub Actions repository secrets**, never repository files:
   - `ENGINE_ROOM_TELEMETRY_URL`: the authorized Engine Room HTTPS origin (no path).
   - `ENGINE_ROOM_TELEMETRY_KEY_ID`: the exact scoped key ID.
   - `ENGINE_ROOM_TELEMETRY_SECRET`: the secret matching Engine Room.
4. Merge a CI-passing commit to `main` and verify the dedicated reporting workflow, receipt, and project source in Engine Room. A failed ingestion must be treated as unknown, not success.
5. Separately configure authenticated GitHub PR webhooks/reconciliation and *actual* Render/endpoint monitoring. This CI candidate alone is neither an operating metric nor deployment evidence.

The payload contains only the commit SHA and deterministic source key. Every transmission is HMAC-SHA256 signed over the exact `<millisecondTimestamp>.<JSONbytes>` sequence with a five-minute authorization window. The deterministic delivery ID permits safe retries for the same commit without inventing separate release events.

This is optional until Engine Room's approved environment is configured. Do not deploy, attach secrets or allocate resources in the excluded Render workspace.
