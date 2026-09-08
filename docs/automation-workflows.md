# Automation workflows

The automations page provides a compact library, evidence-based suggestions, a workflow editor and run history. Suggestions are discovered when the page loads or is refreshed; they are not a background activity monitor.

## Discovery

`server/scoperte.ts` examines titles from the latest 200 indexed documents. At least two matching titles from connected sources are required. Rules cover invoices, proposals and meeting notes in English and Italian. Three indexed emails can also suggest inbox priorities; five indexed work files can suggest project updates. At most three suggestions are shown. Evidence and the source permissions are shown before adoption. Adoption persists an editable, paused recipe; stable IDs prevent duplicate adoption. Dismissals use the existing account-scoped hidden-automation state. Discovery does not call an AI provider.

## Execution

Recipes can include up to six ordered `passi`, each with a unique `id`, a `tipo` and an instruction in `testo`:

- `trasforma`: processes the previous output and passes its result forward.
- `condizione`: evaluates the current material; false stops the workflow without creating a task. True preserves the input.

The initial input is bounded to eight source documents, with up to 3,000 body characters each. Steps use the configured AI provider and run sequentially. Results become context for the existing task/draft engine. Existing schedules, source permissions, per-document output and daily limits remain in effect. A workflow run with steps counts toward the daily AI budget. Concurrent executions of the same recipe within one account are guarded to prevent duplicate tasks.

Manual runs save edited fields first. Invalid edits prevent execution. Preview remains tied to saved settings. Manual failures are recorded in run history. Completed AI workflow output is retained with the last twenty runs (up to 24,000 characters each) and can be expanded in the editor. Closing a changed editor offers keep-editing or discard actions.

## Scope

This is a linear workflow engine with conditional stops, not a general graph runner. It uses the existing source/tool registry. It does not introduce browser automation, arbitrary shell execution, local file writes, new third-party connector actions, webhooks, branching/merging, or n8n connector compatibility. Source synchronization must populate the local index before discovery and source selection can use it. Scheduled execution requires the local service to be running.

## Desktop packaging

The local macOS arm64 app is version 0.2.1. Platform-specific packaging retains the shared file allowlist; the post-pack hook rejects development files, private environment configuration and nested builds. This is checked even when the output directory is outside the repository. The local bundle uses an ad-hoc signature; this is not a notarized public release.

## Verification

`server/flusso.test.ts` checks ordering, short-circuiting and invalid responses. Automation integration tests check result propagation, immutability and concurrent-run suppression. `server/scoperte.test.ts` checks evidence, connection restrictions, persistence, paused adoption and dismissal. Browser verification uses isolated data under `/tmp`. The packaged Electron application is also tested with its configured provider. A live creation check caught an unsupported `maxItems` schema keyword; the request schema now describes that limit in prose while the server continues to enforce it. Provider errors propagate to the editor instead of being replaced with a misleading request to rephrase.

The final build passes type checking and the full suite: 754 passed, 18 skipped, zero failures. Native Electron verification covered provider-backed creation, adding an AI step, save-and-run, task creation, paused state and persistence after restart.
