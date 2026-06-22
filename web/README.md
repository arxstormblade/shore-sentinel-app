# Web UI scaffold

Phase 0 includes the repository and Docker skeleton. The files under `app/`, `components/`, and `lib/` are retained as a later-phase UI prototype preview only; they are not the Phase 0 approval target.

Because the prototype files remain in this workspace, they are kept internally consistent for validation:
- `app/layout.jsx` imports `app/globals.css`.
- `scripts/verify-mvp.mjs` validates the prototype route/component/data contract.
- `package.json` exposes `npm run test` for the web package check.
