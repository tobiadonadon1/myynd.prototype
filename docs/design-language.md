# Myynd — design language (9 September 2026)

One identity, two worlds. The **stage** — sign-in and first run — is ink with a
copper light. The **desk** — the app — is ivory with the same copper as its only
accent. Same mark, same display face, same radii, same pills. Only the ground
changes, like the cover and the pages of one book.

## Decisions

- **Copper is the identity.** `#C4623B`, deep `#8E3F1F`, amber `#D98A5A`. It is
  the only accent, used for the primary action, the active nav item, the
  attention pill and the light behind everything. The brand mark is now drawn
  in the copper family alone (deep copper → copper → amber → ivory highlight).
- **Sage green is no longer a brand colour.** It survives only as a status
  colour — connected, ready, done — never as decoration. The green blobs are
  gone from the app background, the green band from the first-run light field,
  the copper→sage gradient from every primary control (25 occurrences).
- **Ink and ivory.** Ink `#22271F` is the text on the desk and the ground of
  the stage. Ivory `#FFF7F0` / `#F6F2EB` is the card on the desk and the text
  on the stage.
- **Type.** Every page title (`h1`) is set in the same serif as the first run
  (Iowan Old Style / Baskerville), light weight, tight tracking. Everything
  else stays Helvetica Neue. This is the most visible thread between stage and
  desk.
- **Radii.** Three radii and a pill: 10 (small), 14 (inputs, nav), 20 (cards),
  99 (pills). The hand-drawn asymmetric corners (`24px 20px 24px 20px` and
  friends) are gone. The one deliberate exception is the chat bubble, whose
  odd corner is its tail.
- **Motion.** One easing for reveals (`cubic-bezier(.16,1,.3,1)`), one glass
  card recipe. Reduced-motion is honoured everywhere.

Tokens live as CSS custom properties in `src/index.css` — every colour in the
app now descends from them, including the ones written inline in TSX, which
carry `var(--…)` strings. `src/tema.ts` keeps the few TypeScript constants and
the theme switch. Nothing should introduce a new literal colour.

## Night (18 September 2026)

The desk has two hours of the day now. **System, Light, Dark**, in Preferences
next to the language; System is the default and follows the computer. The
choice is saved on the profile as `tema` and mirrored into `localStorage` under
`myynd.tema`, so the first paint is already right before the profile answers.

The night is **warm and deep, never cold grey and never black**. The ground is
the near-black brown the app already had on its dark card (`#1F1A17`); cards are
`#3A2F28`, raised surfaces `#4A3A31`, text is the same ivory at 92%. Copper is
still the only accent in both worlds, and green still only means a state.

How it works: a handful of `*-rgb` triplets (`--inchiostro-rgb`, `--carta-rgb`,
`--luce-rgb`, `--rame-rgb`, `--salvia-rgb`, `--ombra-rgb`) plus named tokens
(`--pagina`, `--carta`, `--carta-piena`, `--carta-alta`, `--filo`, `--pieno`,
`--inchiostro`, `--rame-testo`, `--ombra-carta`, `--carta-scura`…). Half the app
writes `rgba(var(--inchiostro-rgb),.5)` for a hairline or a second-level text,
and at night that one line becomes ivory on brown without anyone rewriting it.
`color-scheme` follows, so inputs, selects and scrollbars are native-dark too.

Three things stay the same in both: the copper (`--rame`, `--gradiente-rame`),
the ivory that sits **on** copper and on the dark card (`--avorio`, and
`--su-avorio` for what is written on the ivory itself), and the warm brown
gradient of the dark card (`--carta-scura`). They are the pieces of night the
app already wore by day.

## The first run

Research on first-run experiences agrees on a few things: lead with value
before asking for setup, keep it short and skippable, tie learning to a real
first action, and let the empty state arrive already filled. Deck-of-cards
tutorials work only when each card is one idea, one image, dismissible
([NN/g on mobile onboarding](https://www.nngroup.com/articles/mobile-app-onboarding/),
[NN/g on tutorials vs contextual help](https://www.nngroup.com/articles/onboarding-tutorials/),
[Appcues, 2026 examples](https://www.appcues.com/blog/best-user-onboarding-examples),
[UXCam, 2026 examples](https://uxcam.com/blog/10-apps-with-great-user-onboarding/)).

Myynd's first run is therefore:

1. **Five moments, ~25 seconds, skippable.** What it is → what it reads → what
   you get every morning → what it prepares → what stays yours. Each moment is
   a kicker, a two-line serif headline, one sentence, and a figure built from
   the app's own components (source tiles, the front page in miniature, a
   ready draft with its Send, a three-line fact table). The figure is the app
   in miniature, so what comes next is already familiar. Hover pauses the
   clock; arrows, click and Esc move it.
2. **Then the first real action.** A project and a goal, then the first task —
   the first layer Myynd works on. Each question carries a one-line "why".
3. **Then the app, already filled.** The first task is on the front page.

The account email is no longer repeated on the intro: it is in the footer.

## The working row (21 September 2026)

A row Myynd is working on is a **fire**, not a veil. The whole row becomes
the stage: a warm amber rim at the top that falls through copper and deep
red into the near-black brown of the night theme, cut by thin vertical
streaks, like light behind ribbed glass. The layer sits at 60% over the card,
so the paper still shows through and the text keeps the theme colour.

**What moves, and why it all moves one way.** He asked twice. The first
version crossed two layers of streaks in opposite directions: «not two layers
overlapping each other and going in opposite directions». The second held the
streaks still and passed a wave through them, and it read as nothing at all:
«it still doesn't really move… it is very, very weak». Measured, between one
frame and the next only two tenths of a point out of 255 changed inside the
row. So now five things move, all of them left to right, none of them ever
reversing:

1. **the streak pattern itself drifts sideways**, slowly (34 px a second).
   The lines are the thing that travels. The pattern is periodic on the width,
   so a streak that leaves on the right comes back on the left with no seam;
2. **a band of light travels through the streaks**, much faster (one lap in
   four seconds), with a short soft leading edge and a long tail. Its tail is
   still leaving on the right while its head is entering on the left, so it
   never restarts;
3. **each streak has its own flame**, and the height flickers with two
   octaves of one-dimensional noise, never a sine. A sine is recognisable
   after three seconds and turns the row into a meter. This is what keeps the
   top edge, where the amber is, alive;
4. **dark smears climb from the bottom** on a slower wave in the same
   direction, and pass in front of the light, like smoke on the glass;
5. **a few blurred embers** drift up and to the right, and fade before they
   disappear.

**How it is drawn.** One canvas. The colour columns are built once per size
of the row and then stretched with `drawImage`, instead of a fresh gradient
per streak per frame: about 0.15 ms of work per frame, 60 fps, no measurable
CPU. It stops entirely when the row scrolls out of view or the window goes to
the background, and reduced motion leaves a single still frame.

**When the work is done.** `fase="finita"`: one and four tenths of a second
in which the band gathers and stops, the fire cools from amber to a quiet
copper, the streaks settle to one height and fade to nothing. Then the
component calls `onFinita` and the row moves on. It is not a notice that
appears, it is a thing that stops.

The reason, in his words: the earlier copper glow at a quarter opacity
vanished at night, and «the only thing that was telling me that he was
working was a tiny little square on the top left that kind of moved, which
is not enough». The two reference images were an orange-to-red-to-black
gradient with vertical streaks; the row keeps their texture and feel with the
palette's own colours (amber `#D98A5A` family, copper `#C4623B`, deep
`#8E3F1F`, the near-black warm brown of the dark card), so it still belongs
to the desk it sits on. Those literals are the one deliberate exception to
the tokens: a five stop gradient is an image, not a component. It never
becomes a progress bar: it says «happening», not «how long». Rules in
`src/components/aurora-compito.css`, and why each motion runs in that
direction in `src/components/AuroraCompito.tsx`.
