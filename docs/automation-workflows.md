# Standing orders (automations)

In the UI an automation is a **standing order** ("Ordini fissi" in Italian). Internally the names stay the same: `server/automazioni.ts`, the `/api/automazioni` routes, the `automazioni` table. A standing order is a recipe (data, not code) run by one engine. It prepares; it never sends.

## Recipe

A recipe is a validated JSON file (`valida()` in `server/automazioni.ts`), in the account's `automazioni` folder or in the package (`automazioni/_comuni`, loaded only with `config.diSerie`). Every recipe carries both languages (`en`).

- `quando` — when it runs:
  - `{ ogni: 'giorno', ora }` every day;
  - `{ ogni: 'feriali', ora }` Monday to Friday;
  - `{ ogni: 'settimana', giorno: 0-6, ora }` one day a week (0 is Sunday);
  - `{ ogni: 'mese', giorno: 1-31, ora }` once a month; a month without that day runs on its last day;
  - `{ quandoArriva: true }` after a source sync that brought something new.
  The turn is counted from the last successful run, so a computer that was off catches up once, not once per missed day. Hours are in the user's time zone (`config.fuso`).
- `guarda` — what it reads: `cerca` (index search words, in the documents' language), `soloNuovi` (only what arrived since the last successful run), `ogniVolta` (a reminder: it runs even with nothing to read), `limite`.
- `fai` — the instruction. `passi` — up to six ordered steps (`condizione` stops the run, `trasforma` passes its output on).
- `metti` — `inLista` (oggi, settimana, poi), `modo` (io: a line; bozza: the line is drafted; prompt: a prompt to use elsewhere; `tutto` is still accepted and behaves like `bozza`, the builder no longer offers it), `perDocumento` (one line per document).
- `proponi` — instead of a line, something to approve with one tap:
  - `posta.cestina`, `posta.archivia`: chosen messages to move (never deleted);
  - `posta.bozza`: replies saved as drafts in the mailbox (`mailbox-drafts.ts`), recipient taken from the document, never sent;
  - `agenda.aggiungi`: calendar events, only with a date and time written in the document;
  - `nota.crea`: one note in Apple Notes;
  - `file.crea`: one Word document in the user's delivery place (`mani.luogoPreferito`).
  Each lands as a ready row with the proposal; its single button says "Approve" or "Approve all (N)" and executes exactly what the row shows (`/api/compiti/:id/esegui`, `server/proposte.ts` for the last three). The home page marks it "to approve".
- `attrezzi` — closed vocabulary of sources it may open (`attrezzi.ts`); an unknown name rejects the recipe.

## Lifecycle

- **Create.** From a sentence (`/api/automazioni/componi`, the builder fills while typing: cadence, sources and what it hands back are read without a model), by hand on the builder, or from any task or feed card: "Do this every week" opens a new standing order already written, a weekly reminder (`ogniVolta`) that can be created with one tap.
- **Preview, then live.** Before creating it the builder shows **last month**: the recipe's material selection replayed over the last 30 days of the local index, one occurrence at a time, read-only and without any model (`mese()`, `POST /api/automazioni/mese`, `GET /api/automazioni/:id/mese`). It is an upper bound ("up to N items"). Created standing orders are on and live immediately; "Run it now" works right away, paused or not. The 14-day practice tray is gone: results left in it from before can still be moved to the list or dismissed (`vassoio.ts`), nothing new enters it.
- **Suggestions** (`scoperte.ts`) keep their gate: a suggested recipe is replayed on the past (`collaudo.ts`) and only shown if it passes.
- **Starter pack.** While all of an account's standing orders come from it, the page offers four with one switch each: replies owed, quotes to chase, renewals, changed bank details (`pacchetto()`, `/api/automazioni/pacchetto`). Turning one on copies it into the account's own recipes; off pauses it. If `config.pubblico` is `persona` replies and renewals come first, if `azienda` quotes and bank details.

## Every run leaves a receipt

`store.automazioneGirata` writes the run into the history and into `ricevuta`: documents looked at, items made, or why nothing (`vuoto` nothing to look at, `niente` nothing qualified, `condizione` a step stopped it, `gia` its previous line is still open, `tetto` today's budget is spent, `guaio` it failed). The card and the editor show it in one line.

- **Failures** do not move `ultima` or the `vista` marker; `riprova` is set 30 minutes ahead and the engine retries then (also for "when it arrives" recipes, which do not retry on every sync before that). A failing standing order shows on its card, in its editor, and in the fixed engine row on the first page with a link to the page.
- **Health** (`salute`): `scollegata` (a declared source is not connected), `guaio`, `ferma` (its line is still open), `muta` (four empty runs in a row). `muta` only applies to clock recipes with their own search words: a "when it arrives" or "only new" recipe that finds nothing is normal.

## Budget

Drafting is the only spend that repeats on its own, so automatic drafts (and prepared proposals) are capped by budget, not by a fixed count: standing orders may use half of the day's token cap (`config.tetto`, or `BUDGET_SENZA_TETTO` without one), at an estimated `STIMA_BOZZA` tokens per draft, minus drafts already started today by all standing orders and minus what was actually spent today (`bozzeRimaste`). Over the budget a per-document recipe still writes its lines, without drafts; others skip the run with receipt `tetto`. Manual runs are not capped.

## Scope

A linear engine with conditional stops. No browser automation, shell, webhooks or sending: the only outward actions are the six proposals above, each executed by a person's tap. Scheduled runs need the local service (or the hosted workspace) to be running.

## Verification

- `server/ordini-fissi.test.ts`: weekdays and monthly turns, impossible days rejected, monthly copy matches the schedule, failed runs do not move the clock and retry within the hour, receipts for every outcome, health by trigger type, the read-only month preview, the four proposal kinds (closed ids, recipient from the document, no dashes, never sent, row kept if the mailbox refuses), budget for proposals, reminders from a card, the starter pack and its ordering.
- `server/automazioni-rotte.test.ts`: on a real server, a new standing order is live, "Run now" answers 200 right away and when paused, the month preview does not write, the starter pack switches.
- `server/automazioni.test.ts`, `server/perDocumento.test.ts`: the budget replaces the fixed cap; `server/vassoio.test.ts`: nothing new enters the tray, old results still work.
- `src/ordini-fissi.test.ts`: the sentences in both languages (schedules, receipts, month preview, approve buttons, the card phrase, the engine row).
- Scenes: `OUT=<dir> PORTA=18880 prove/ordini-fissi.sh` (light and dark, 1100 and 1500).
