# Myynd 0.2.3 — desktop design refresh

## Follow-up: 0.2.4

- Removed the News monogram. Opening News schedules a background refresh when needed; the server also checks once a minute while open, with cache/deduplication and retry cooldowns. An existing useful edition survives an empty refresh. Previously read articles remain separately labelled and consultable when no unread items remain.
- Added verified Apple Developer, GitHub and OpenAI RSS sources. Technical updates remain eligible for 14 days; general news retains the shorter relevance/freshness window. No minimum is filled with unrelated articles.
- The task planner shows two or three day agendas at normal desktop widths and the complete week on wide windows. Compact task cards preserve completion, assignment and access to draft/question workflows. The editor has a smaller title field, quiet focus styling and confirmable deletion.
- Connections are an icon grid in both the picker and source page; individual setup/management opens on click. Workflow steps are readable until edited, and secondary controls are collapsed.
- Validation: 794 tests, 776 passed, 18 skipped, zero failures; TypeScript and production build passed. Browser UI checks covered two/three-column layouts, day-specific add, compact editing, icon/detail/back/search navigation, automatic live RSS population and read-archive persistence.

- Native verification: the real account populated four news articles automatically. The final packaged app opened with the revised UI.
- Fixed a startup blocker found during verification: recursive filesystem watcher setup now runs in dedicated workers. The previous run blocked server readiness for 195.5 seconds; the final run logged readiness immediately after listening. Eight watcher tests cover indexing, retries, restart and main-thread responsiveness during a simulated blocking open. Worker files are included outside ASAR; the package signature passed verification.

## Behavior

- News stays behind the small News button. A cream and sage reading panel shows five titles per page and one source summary at a time, with a copper article link. The server caps each edition at eight articles; it may return fewer or none when relevance is insufficient.
- News selection uses explicit focus, active projects and tasks before general interests. Editions are isolated per account, cached with their context, and refreshed when context changes. Read/dismissed articles cannot consume the selection limit. The fallback excludes generic language, including the real regression where “new” and “only” linked an unrelated world-map article to an inbox task.
- To do defaults to a week planner with a selected-day agenda, overdue items and an unscheduled view. Tasks retain an optional local calendar date in SQLite. That date also informs briefing priorities. This planner does not write events to external calendars.
- Task details use a larger modal with title, notes, date presets, Save and Cancel. Keyboard focus starts in the title and returns to the task or composer after closing.
- Automations distinguish active, attention and workflow stages with restrained sage/copper color. Connections are available directly from Automations; the source catalog adds search, status filters and Connect/Manage actions. Planned integrations are collapsed.
- Help navigation is hidden in Electron; the browser guide remains available.

## Validation — 8 September 2026

- Complete Node test suite: 791 tests, 773 passed, 18 skipped, zero failures.
- Client, server and desktop TypeScript checks; production Vite build; whitespace checks.
- Isolated local account: eight News fixtures, pagination/read behavior, empty state, short-window rendering, Escape; calendar date/notes editing persisted across reload; connector search and setup form. No browser console errors observed.
- Packaged Electron app: News, calendar day navigation, temporary task creation and date/notes editing, existing workflow editor, source catalog and hidden Help navigation checked directly through native UI.
- ARM64 Electron package installed at `dist-app/mac-arm64/Myynd.app`; previous packages preserved outside the repository. Ad-hoc signature verified with `codesign --verify --deep --strict`.

## Release limits

This is a local development build. Apple distribution signing, notarization, App Store sandbox/entitlement review and submission have not been completed. Real external connector authorization and AI-provider execution require the user's configured services; this design verification did not send messages or authorize new external accounts. Vite reports the existing main bundle above its 500 kB advisory threshold.
