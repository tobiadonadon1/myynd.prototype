# myynd — design spec

CSS lives in `src/renderer/src/design/` (`tokens.css` → `base.css` → `components.css`, import in this order).
Engineers write JSX against these classes. They do not write CSS, colors, sizes, or copy.

## Rules that must not be broken

1. Every value comes from a token. No hex, px, or ms literals in components.
2. `--attesa` (terra di Siena) marks work waiting for a person — `.dot-attesa` only.
   Never on links, focus, hover, buttons, the wordmark, or anything else. There is no second accent.
3. Nothing opaque. The window is `transparent: true` + vibrancy `under-window`; only `.shell`
   paints the wash. Never give a screen, list, or section its own background panel.
4. What the brain writes (answers, draft bodies, excerpts) is serif via `.prose`.
   Everything the app itself says is the system sans. Do not mix.
5. No spinners, no progress bars. Waiting is a sentence: `.thinking`.
6. No cards inside cards. Separation is whitespace first, a hairline (`.rule`) second, never a shadow.
7. Sources are silent: the `.src` dot is the only trace; proof appears on hover/focus only.
   Never render a citation list, chips, or a sources panel.
8. Chiedi is not a chat. One question, one answer; the new answer replaces the old. No bubbles.
9. All copy is Italian, lowercase, short, no exclamation marks, never "io". Use the strings below verbatim.
10. Transitions only via the `--t-*` tokens, only on things that actually change. Nothing moves on load.

## Class vocabulary

- `.shell` — the translucent window; grid of topbar / rail / screen.
- `.topbar` — draggable strip; `.wordmark` ("myynd", serif, centered), `.topbar__status` right.
- `.rail` / `.rail__item` (+ `.is-active`) / `.rail__count` — navigation as a column of words.
- `.dot-attesa` — the accent dot, 6px, next to rail items and waiting rows that hold work for a person.
- `.screen` — the one scroll area. `.screen-title` serif title. `.rule` hairline. `.quiet` `.small` — grey / 12px.
- `.waiting` / `.waiting-item` (+ `--done`) / `__who` `__title` `__when` `__reason` — the work-waiting list.
  `__who` is the sender, an inline span opening `__title`; the ` · ` after the name
  is drawn by the css — never type it in copy.
- `.approval` / `.approval__reason` / `.draft__subject` / `.draft__meta` / `.draft__body` — the drafted mail.
  Body renders proposal text with newlines (`pre-wrap`); add `.prose`.
- `.draft__body[contenteditable]` — in-place edit state (field appears around the words, text does not shift);
  `.edit-hint` under it; `salva` / `annulla` appear in `.actions` while editing.
- `.attachments` / `.attachments__label` / `.attachment` / `__name` `__reason` — identified attachments, plain lines.
- `.actions` / `.btn--primary` (invia only) / `.btn--quiet` (modifica, ignora, salva, annulla).
- `.ask` / `.ask__input` / `.thinking` / `.answer` (+ `.prose`) / `.answer__note` / `.caret` — question and streaming answer.
- `.src` — replaces marker `⟦s1⟧`; contains `.src-pop` (+ `--right`, `--below` near edges) with
  `__title` `__meta` `__excerpt` `__flag`. Give `.src` `tabindex="0"` so keyboards reach the proof.
  The mark takes no horizontal space: punctuation after it stays attached to its word.
  `__excerpt` is plain prose — strip markdown before display; a tabular passage arrives
  flattened into one line with ` · `. The popover never renders a table.
- `.transparency` / `.t-section` / `.t-section__name` / `.t-item` / `__label` `__detail` / `.t-counts`.
- `.log-day` / `.log-day__label` / `.log-entry` / `__time` `__text` — the day-grouped activity list.
  The log is never capped, paginated, or collapsed: completeness is the page's argument,
  and a long day reads as diligence. Day labels are the only structure it needs.
- `.empty` — quiet empty state. `.unknown` / `__text` `__why` — the honest "non lo so".
- `.firstrun` / `__lede` / `__status` — modello non collegato. Una riga, nessun campo,
  nessun wizard. (`__key` resta nel css ma non si usa: non esiste nessuna chiave da incollare.)

## Screens (nav labels, in order)

`oggi` · `lavoro in attesa` · `chiedi` · `trasparenza`

## Actions on a proposal

`invia` (`.btn--primary`) · `modifica` · `ignora` (`.btn--quiet`)

While editing the draft: `salva` · `annulla`, both `.btn--quiet`.
Enter inserts a newline inside the draft — it never sends and never saves.
`invia` stays the only filled button there is.

## Microcopy — use verbatim, always lowercase

- model synced: `sincronizzato.` — not ready: `il modello non è raggiungibile.`
- empty waiting list: `niente in attesa.`
- proposal reason prefix: none — one plain line, ≤ ~90 characters,
  e.g. `chiede quale listino vale per il 2026`. If it wants to wrap, shorten the
  thought, not the box: the list row clamps at one line, the approval view never truncates.
- proposal done rows: `approvata` / `ignorata` — non `inviata`: niente parte da
  qui, la bozza resta una bozza finché non la manda una persona dal suo client.
  la stessa regola vale nel registro della pagina trasparenza.
- attachments label: `allegati` — attachment reason follows the name after `—`
- edit hint: `esc annulla`
- ask placeholder: `chiedi.`
- thinking lines: present tense, one line, e.g. `sto leggendo la posta.` / `sto cercando nei documenti.`
- unknown answer: `non lo so.` + one grey line saying what is missing,
  e.g. `non c'è materiale su questo: nessuna mail e nessun documento ne parlano.`
- superseded source flag: `fonte superata da: {titolo}`
- transparency sections: `cosa legge` / `cosa scrive` / `cosa esce dal computer`
- counts line: `{n} messaggi · {n} documenti · {n} frammenti · {modello}` (dots, tabular numbers)
- log day labels: `oggi` / `ieri` / `{12 marzo}`
- modello non collegato: `claude non trovato.` oppure `claude non collegato.` —
  sotto, una riga grigia: `il lavoro già preparato resta leggibile.`
  Nessun bottone, nessun campo, nessun «riprova». si dice e ci si ferma.

## Popovers near edges

`.src-pop` opens above-left by default and must never leave the window.
Add `--right` in the last ~320px of a line: the popover's width is fixed (300px).
Its height is not — it varies with the excerpt (195–214px in practice) — so no
fixed distance-from-top can decide `--below`. Measure the rendered popover at
hover time and add `--below` when it does not fit between the mark and the top
of the screen.

## The one deliberate exception

`.btn--primary` is the only filled element in the app. If a screen seems to need a second
one, the screen is wrong, not the rule.
