# Myynd 0.2.5 — first project and continuity

The first-run experience now starts with a real project and goal. It has four moments: project, one useful source, confirmation of source excerpts, and a saved next action. Setup can be resumed from Preferences → Your first project. Existing accounts are not forced through it again.

## Behavior

- `server/avvio.ts` saves an account-scoped session atomically. Mutations require the current revision. A write-ahead record and stable task ID make completion recoverable after a lost response or a process crash without creating another task.
- Source reading uses the existing connector synchronization path. Up to three literal excerpts are selected from project-related documents in the chosen source. Bulk mail, unrelated documents, Markdown headings and frontmatter cannot fill this list. Fewer or zero excerpts are valid; users can continue explicitly without a source or excerpts.
- The first outline contains the explicit goal, confirmed excerpts and an editable next action. It creates an open task with optional local calendar date and a stable project link. It does not mark the goal complete, delegate work, send a message, or pretend that an AI model has performed research.
- Draft fields survive reopening. Save errors preserve input; stale sessions reload their revision. Successful setup hands over to the app without a second automatic task tutorial. The manual guide remains available.
- A shared animated particle brain and colored glass surfaces connect sign-in with onboarding. The effect is generated locally, responds to reduced-motion preferences and stops animating while the page is hidden. No remote video, font or image is needed.

## Project continuity

SQLite migration 34 adds the optional `compiti.progetto` ID without changing existing task content, dates or prepared drafts. The task editor can assign or remove this association. Project details show actual open, working, review and completed task states, along with recorded outcomes. The project prompt includes the next linked action; it does not estimate goal completion from task counts.

Delegated tasks receive the current project name and goal. Confirmed project decisions from the briefing are now available to the next relevant prompt. Entity matching avoids similarly named projects, unconfirmed inferences stay excluded, and renaming a project retains its decision history.

## Verification

- Full suite: 877 tests, 859 passed, 18 skipped, zero failures.
- Targeted checks cover isolated accounts, stale evidence, interrupted completion, duplicate retries, source boundaries, empty sources, goal-only setup, task reopen/delete, renamed projects and decision corrections.
- A separate-process migration test reopens a version-33 database and verifies that its task text, note, date, status and prepared draft remain unchanged.
- Browser QA uses temporary accounts and six local fixture documents. It verifies source connection and reading, three relevant body excerpts, confirmation, edited task recovery, task creation, calendar assignment and the project's task summary.
- Signup and the explicit no-source path were also completed in the browser. The next-action text and Tomorrow date survived reload; the created task appeared on that calendar day, and completing it changed the project summary to one completed task without closing the project.
- Myynd 0.2.5 was packaged for ARM64, its ad-hoc signature verified, and the installed Electron app opened on the new particle-brain onboarding. A duplicate temporary package was removed after startup reported insufficient disk space for a database snapshot; retry then opened the existing account successfully. The previous app was preserved as a backup.

This remains a local development release. Distribution signing/notarization and real paid-provider output quality are separate from the local workflow and UI verification. The new first-outline flow works without a provider key; AI delegation still uses the configured services and existing permission controls.

## 0.2.6 — cinematic first run

Replaced the teal brain composition with an entirely local copper/ivory pixel-light animation inspired by the supplied Vantage reference. The welcome scene has a short editorial headline and one action. Project name and goal now appear as separate questions; the local draft also remembers which question was open. Removed the four-step legend and the form card, changed focus to neutral white, and matched sign-in to the new visual direction. Source selection, evidence confirmation and actual scheduled-task creation retain their existing server behavior. Long connector forms scroll without overlapping the header.

Validation: complete browser flow with a separate local account, including draft text, optional source skip, goal confirmation, saving a task for tomorrow, and finding that task in the calendar. Sign-in visually checked. Full suite: 877 tests, 859 passed, 18 skipped, zero failed. TypeScript and production build passed. Graphics use no remote media or AI requests, honor reduced motion, pause on hidden tabs and have a static fallback. No paid API calls used for this verification.
