# GitHub Pages: public local-draft preview

GitHub Pages provides a no-Render alternative for publishing the **static, browser-only SceneSignal draft** from `main`. Workflow: `.github/workflows/deploy-pages.yml`. It uses pinned GitHub Actions and the same immutable Distributed Audio Engine source as CI; it runs `npm run check` before publishing any artifact.

## Enable and verify

1. In `neophilism/SceneSignal`, choose **Settings → Pages → Build and deployment → Source: GitHub Actions** if this has not already been configured. Pages publication requires repository admin configuration; committing a workflow alone does not verify that Pages is enabled.
2. A new successful push to `main` will start **Deploy SceneSignal draft preview to GitHub Pages**. Check that the build and deployment jobs both pass.
3. Use the exact `page_url` emitted by GitHub's deployment job. The standard project-path candidate is `https://neophilism.github.io/SceneSignal/`, but do not advertise it as live until deployment and HTTPS reachability are confirmed.
4. Verify that the browser bundle serves paths under `/SceneSignal/`, local plan and WAV uploads work, and **Activate session remains disabled**. Inspect actual network requests to confirm private permit bytes, private manifests/keys, WAV stems, and coordinates do not leave the browser.
5. Record the confirmed URL and deployment evidence as a **preview** in Engine Room. A public preview URL is not operational concert readiness or an acceptable production E2EESA audit.

## Boundaries

The site has no backend, no account login or authenticated key channel, no permit reviewer, no persisted drafts, no real community speaker audio route, no payments, and no verified field tests. The GitHub Actions deployment publishes only bundled static files. It cannot make a private service, live concert, or protected-media delivery system by itself.

GitHub Pages is a distinct static-only deployment path. The Render blueprint in `render.yaml` retains its normal Vite `/` asset base, while GitHub Pages builds with `SCENESIGNAL_STATIC_BASE_PATH=/SceneSignal/`. Invalid base overrides fail the build. Do not enable live output controls or add user credentials to the static build.
