# Deploying the public draft preview (not a production concert service)

`render.yaml` defines one Render **static** service, `scenesignal-draft-preview`, from `main`. It prepares the pinned Distributed Audio Engine source and runs the actual repository checks before publishing `web-dist`. Render should use Node 24.19.0.

## What visitors can and cannot do

The preview is a **local-only drafting tool**: a user can plan a session in their browser, upload matching mono WAV stems for simulation, place draft speaker positions, audition up to three seconds of a local mix and locally encrypt a private permit. The app does not upload these drafts, store them on the host, create remote user accounts, authorize a site, send sound to contributed speakers or enable public session activation. Draft data disappears when the tab is closed.

It is safe to demonstrate this limited workflow publicly **only while those boundaries remain intact**. This is not a field-approved concert engine and does not establish actual acoustic performance, availability, production authentication, real permit approval, payments, or end-to-end security certification.

## Provisioning checklist

1. Select the **correct** Render workspace and confirm that Render's GitHub integration can access `neophilism/SceneSignal`. Do not silently select an unrelated workspace.
2. Deploy the Blueprint or configure a static site with build command `npm run core:prepare && npm ci --ignore-scripts && npm run check` and publish path `web-dist`. Set `NODE_VERSION=24.19.0`.
3. Confirm that the deployment commit SHA matches `main`; open the assigned HTTPS URL and verify the app loads. Test plan save, WAV upload, local audition and encrypted evidence preparation in an actual supported browser.
4. Confirm that the **Activate session** control remains disabled in the public preview and no uploaded bytes, private keys, permits, raw stems, or coordinates are sent to a service.
5. Register the resulting exact Render service ID and URL in Engine Room. GitHub PR state alone is not proof of uptime. Observe HTTP status and deploy timestamps from actual provider responses, not invented values.
6. For an operational launch, deploy a separate application backend only after trusted identity, authenticated E2EE key-channel, ciphertext-only storage, permit workflows, native signed output leases, retention, recovery, and independent reviews are verified.

## Rollback

If the build fails, keep the last known-good deployment. If the preview violates the draft boundary, disable its public route and revert the offending commit. Never enable public session activation just to pass a smoke test.
