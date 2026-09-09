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

Tokens live in `src/tema.ts` (TypeScript; the shared styles in `src/ui.tsx`
read the gradient and the deep copper from it) and as CSS variables in
`src/index.css` (the page-title rule reads `--serif`). Older inline styles
still carry literal values; move them to the tokens as they are touched.

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
