# Engine Room project registration and live evidence

SceneSignal ships a source-controlled `.exechub/project.yml` for the Engine Room GitHub App registration workflow. The approved **16-PR delivery grouping** is distinct from the **32 SceneSignal roadmap work packages** in `docs/roadmap.json`: PRs can cover multiple work packages. Do not add the numbers together, present the 16 PR groups as 32 individual merged PRs, or count software-only implementation as field qualification.

## Four delivery milestones

1. Specifications and foundations — PRs 1–4: specification, session lifecycle, spatial primitives and browser draft workspace.
2. Artist discovery and commerce — PRs 5–8: lineup, public discovery, sponsors and authorized album commerce.
3. Spatial hardware and operations — PRs 9–12: contributor setup, complete scene authoring, native spatial playback and operator control.
4. Rewards, safety and field release — PRs 13–16: session contribution rewards, acoustic/site operations, reporting and progressive physical release qualification.

This is a delivery grouping of the approved proposed PR sequence, not a guarantee that each future scope fits in a single PR. If real work requires additional PRs or materially changes the plan, approve and version the manifest rather than silently changing history.

## How Engine Room imports this project

1. Discover `neophilism/SceneSignal` and its **actual** GitHub PR state. GitHub App installation-based reconciliation is required to approve/register the manifest; the best-effort public GitHub import alone discovers repositories and PRs but does not imply approved roadmap registration.
2. Read `.exechub/project.yml` from `main`; parse and verify the repository identity and 16 milestone counts. Reconcile using Engine Room's authorized Settings synchronization and persist the approved plan version.
3. Only associate a roadmap unit with its concrete merged GitHub PR **after explicit PR-to-plan mapping review**. GitHub PR #N is not automatically roadmap work package SS-N. A merged code PR is not a passing field test.
4. For faster refresh, configure authenticated GitHub webhooks or a trusted scheduler; the no-cost public importer is best effort (default about every two hours while the web instance is running).
5. Configure separate scoped Render and real service telemetry for deployment, uptime and incidents. PR merges, CI green, operational readiness and field validation are distinct signals.

## Release evidence currently missing

There is no accepted real multi-speaker field test, native output certification, key-channel deployment, production account provider, public permit review process, or independent E2EESA release assessment. Keep `released`, `field_validated` and `deployed` false in the machine-readable roadmap until actual evidence is recorded.

Never place encrypted permits, private coordinates, manifests, media keys, artist financial agreements or user identifiers in Engine Room's public repository feed. Only publish authorized project metadata and aggregated non-sensitive operational observations.
