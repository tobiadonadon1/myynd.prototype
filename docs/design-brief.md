# Myynd design brief (23 September 2026)

Written after the first outside tester went through sign-up, first run,
sources and projects. It extracts principles from the products that did this
best, and adds them to the rules Myynd already keeps (`design-language.md`).
Every change should trace back to one of these, or to a user need.

## What the best products teach

| Product | What they got right | Principle for Myynd |
|---|---|---|
| Stripe | Each onboarding screen explains exactly one thing, in one line | **P1 One job per screen** |
| Apple setup | One decision per step, and you always know where you are | **P2 Progress is always visible** |
| Linear | Speed, keyboard first, restraint in motion and colour | **P3 Restraint, keyboard first** |
| Notion, Arc | An empty place says what goes there and offers the one action that fills it | **P4 Empty states teach by doing** |
| Superhuman | You feel capable in minutes because the first win comes fast | **P5 First win fast** |
| All of them | Nothing surprises: same thing, same look, same place | **P6 Consistency** |
| All of them | The screen reacts before the server does | **P7 Feedback within 100 ms** |
| All of them | What the screen says is true, everywhere, now | **P8 State is always true** |

## The principles

**P1 One job per screen.** The heading says the job. At most one supporting
line says what the person gets from it. No line repeats another line on the
same screen. If two lines say the same thing, one goes.

**P2 Progress is always visible.** In a sequence the person can see which
step they are on and how many remain. Back is always there.

**P3 Restraint, keyboard first.** Motion and colour only where they carry
meaning, subtle, and off under reduced motion. Enter advances, Esc backs out.
Copper is the only accent; green only means connected, ready, done.

**P4 Empty states teach by doing.** An empty list is a one-line invitation
plus the control that fills it, in place. Not a paragraph, not a tooltip.

**P5 First win fast.** Connect everything you want, then read it all in one
go, and show what was found. Never make the person repeat a step per source.

**P6 Consistency.** Every field has a visible label above it, the same way,
everywhere. Placeholders show an example; they never carry the label. Pages of
the same flow share one anatomy: kicker (optional), heading, one supporting
line, labelled fields, one primary action.

**P7 Feedback within 100 ms.** Every press changes something visible at once
(pressed state, optimistic row, progress line). The network confirms later.

**P8 State is always true.** A connection has one source of truth. When it
changes, every surface that shows it updates immediately. Never show a prompt
to do something that is already done.

**P9 Written for someone half paying attention.** Plain words, verb first,
no idioms or metaphors ("get my bearings"), no jargon ("token scopes") without
the exact label the person will see on the other site.

## The quality bar for integrations

The Google Calendar card is the reference the tester liked:
1. one line that says what Myynd gets,
2. one thing to paste, with a visible label,
3. a collapsed "Where do I find it?" with numbered steps that name the exact
   buttons and menus of the other site,
4. an immediate, countable confirmation ("Read 42 events from Work").

Every integration is held to those four.

## Rules Myynd already keeps (unchanged)

- No em or en dashes in interface strings or generated text.
- Do not explain the software: title and control; only state earns a line.
- Nothing overflows its box.
- One primary action per card or screen.
- Italian source strings, English through `src/lingua.ts`.
