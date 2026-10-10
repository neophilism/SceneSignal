# Restricted owner PR auto-merge

The optional `Merge verified owner PRs` workflow runs from the **trusted default branch**, after GitHub reports successful completion of either `SceneSignal CI` or `Planning CI`. It never checks out or executes code from the submitted PR branch.

## Eligibility

It attempts a merge only when ALL of these are true:

- Pull request is open, non-draft, authored by `neophilism`, and its head **and base** are in `neophilism/SceneSignal`, targeting `main`.
- Branch uses the approved `feat/`, `feature/`, or `ci/` prefix.
- The latest run of BOTH required workflows is completed successfully for the **exact current head SHA** and branch. Older successful runs, a failed rerun, canceled checks, and pending statuses are insufficient.
- GitHub commit comparison confirms the PR branch includes the **current `main` commit** (zero commits behind). If `main` has moved, a maintainer must reconcile the branch and rerun checks.
- GitHub's actual pull-request merge API accepts an exact-head-SHA squash merge and any branch protection/review requirements. A GitHub rejection leaves the PR open.

The workflow uses only repository-scoped GitHub Actions credentials with `contents:write`, `pull-requests:write`, and `actions:read`; it never accesses the audio/content encryption keys, payment credentials, Render accounts, hardware, or deployment secrets. Logs exclude the token. Repository administration may forbid write-scoped workflow tokens; if so, automatic merging remains unavailable and manual merges after checks are still required.

Auto-merging code does **not** certify field sound measurements, calibrated speakers, physical permits, E2EESA security review, production deployment, website health or business payout correctness. These remain independent gates explicitly recorded in the SceneSignal roadmap. The Pages workflow, if enabled, may publish the *draft-only static preview* after a code merge, but cannot activate a live concert.

This automation is separate from GitHub's built-in auto-merge setting (currently disabled). To disable the fallback, disable the `Merge verified owner PRs` workflow or revert its workflow file on `main`.
