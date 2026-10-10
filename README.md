# SceneSignal

**Development and handoff plan:** [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

Community spatial music sessions, built directly on Distributed Audio Engine. No dependency on Distributed Radio Engine or TrackZero.

The first application implementation supplies an endpoint-owned session lifecycle: scoped organizer/operator/steward roles, site and condition revisions, signed permit or organizer-assertion decisions, current-time activation, automatic expiry, cancellation and minimized free-admission listings. [Session lifecycle](docs/session-lifecycle.md) · [Implementation and evidence](docs/implementation-status.md) · [Development plan](docs/scenesignal-development-plan.md)

Use Node 24.19.0. Run `npm run core:prepare` to fetch/build the immutable source pinned in dependency-pin.json, then `npm ci --ignore-scripts` and `npm run check`. The prepared dependency archive is ignored by Git; CI reproduces it from the pinned source. Private manifests, keys and media never belong in that archive or repository.

`npm run dev` opens the local draft workspace: plan the session, upload aligned mono WAV stems, place instruments and draft speakers, audition their mixes and prepare encrypted private evidence. [Browser workspace and validation](docs/browser-workspace.md). Drafts stay in the browser tab; public activation requires connected identity, authorization and endpoint channels.

The library accepts trusted identity and authenticated E2EE channel adapters. It does not supply a fallback account or key protocol. Current software checks use explicit test adapters; native output enforcement, real permit/authorization operations, hardware pilots, deployed recovery and independent review remain release requirements. Development continues in the four-repository order recorded in the roadmap.
