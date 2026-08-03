# Myynd — Product Brief

This document describes what Myynd is, how it behaves, how it should feel, and where it lives. It contains no architecture and no code. Every technical decision is yours to make.

---

## 1. The idea

Every company runs on a few people who know how things actually work. Which supplier we stopped using and why. Which version of the file is the real one. What we say to a client who asks for a discount. That knowledge is not written down anywhere. It lives in one head, usually the founder's, and everyone else gets it by interrupting them.

Myynd is a copy of that person, made from their files, their mail, and a conversation with them. Colleagues ask the copy instead of interrupting the original.

This is not about what happens when they leave. It's about what happens while they stay. The founder keeps working. He just stops being the place every small question has to pass through. The twenty interruptions a day that each cost him four minutes and cost the asker two hours of waiting stop happening. He gets his afternoons back and the company stops queueing behind him.

The models are good enough already. Context is the only thing missing, and context is what this product supplies.

---

## 2. How the brain forms, and how it grows

It starts as a copy of one person. It ends up as a copy of the company. The path between those two states is the product.

**It starts at the top.** The first install replicates the founder, the CEO, or whoever the company actually runs through. That person is the seed because he is the one everyone else interrupts.

Replicating him means taking everything, not a curated selection. Every mailbox and every thread inside it, not just the attachments. Google Drive, SharePoint, OneDrive, whatever shared folders exist. Slack, Teams, and the internal chat wherever it happens. Calendars. Documents, spreadsheets, presentations, PDFs, scans. The half-finished things and the superseded versions as much as the final ones, because knowing what was abandoned is part of knowing what's current.

Be clear-eyed about what that means: this is an enormous and continuous data pipeline, and managing it well is most of the engineering in this product. It has to handle scale, duplication, formats that fight back, permissions that differ per source, things that change under it, and things that quietly go stale. None of that is visible to the user, and all of it determines whether the answers are any good. The interface is the easy half.

**It grows sideways.** Every manager becomes responsible for their team's material, and can delegate that to two or three people. But responsibility here does not mean work. Nobody sits down to upload anything.

**It grows without anyone doing anything.** Because the sources are already connected, the brain learns from what people share with each other in the normal course of work. Somebody attaches the new price list to an internal thread and the brain has the new price list. Somebody drops a folder in the team's SharePoint and it's in. The company already generates its own knowledge every day. Myynd just stops it from evaporating.

This is the single most important behavioral promise of the product: **it gets better on its own, and nobody has to feed it.** If a user ever feels like they are doing data entry, something has gone wrong.

**It learns judgment three ways.** Files give it facts. It needs the reasoning too, and that comes from:

1. **The onboarding conversation.** During setup, the brain interviews the founder. Not a form, not a settings wizard. A twenty-minute conversation in plain Italian where it asks how he decides things. What makes a client worth saying yes to. What he checks before signing off on a quote. What mistakes he's seen people make. This is where the twin gets its shape, and it should feel like the most interesting part of buying the product, not the tax you pay before using it.

2. **Corrections in use.** Every time someone edits a draft before sending it, that edit is a lesson. Occasionally, not every time, the brain asks why: "Hai tolto il riferimento allo sconto. Devo evitarlo sempre con questo cliente?" One question, answerable in five words, dismissible. This is the highest-value learning in the product and almost nobody builds it.

3. **Further conversations, over time.** New topics as they come up. The brain notices it doesn't know something and asks for ten minutes when convenient.

---

## 3. Where it lives

It is an application. You open it the way you open any app, it sits in the dock, and it has its own window. A global keyboard shortcut brings it forward from anywhere without you leaving what you were doing. Mentally, it's Claude: a real app with a fast way in.

It also has a small presence in the menu bar, but that presence is only a signal. A quiet mark, a dot when something is waiting. Clicking it brings the app forward. Do not build a full panel inside the menu bar. Reading a draft in a 300 pixel dropdown is a bad experience, and the people this is for do not live in their menu bar.

So: **one app, one shortcut, one quiet status mark.** That's the whole footprint.

---

## 4. How it behaves

**It does things for you.** This is the point. Not a question box that returns paragraphs, but something that carries out work. It sees the email that needs answering and answers it. It makes the document that gets made every Tuesday. It handles the small requests that would otherwise land on the founder's desk. Anyone can build something you can ask questions to. The power, and the thing being sold, is that it acts.

**It also answers.** Ask it anything and it replies immediately, in the company's own language, with a short synthetic answer. Not a summary of five documents, not a wall of retrieved text. The answer, directly, the way a colleague who knows would say it out loud.

**It's calm about all of this.** When it has prepared something, the work waits quietly in the app with a small mark in the menu bar. It does not pop up, it does not interrupt, it does not notify unless something is genuinely time-sensitive. The posture is *available*, not *eager*. An assistant that talks first every time becomes noise within a week, and once it's noise it's dead.

**It never acts alone.** It drafts, prepares, and suggests. A person presses the button. Sending an email means the mail client opens with the draft written and the attachments picked, and the human hits send. This is not a limitation to remove later, it's the reason people trust it enough to let it work.

**Sources are there, and almost invisible.** Everything it says is grounded in something it actually read, and you can see what, but only if you look. A faint mark in the text, revealed on hover. No citation blocks, no chips, no "view sources" panel, nothing that turns a two-line answer into a research report. The proof is available on demand and silent otherwise. Most of the time nobody checks, and that's the correct outcome.

If it cannot find material for something, it says so and stops. It never fills the gap with a plausible guess. One confident wrong answer about the company's own business costs more trust than fifty correct ones earn.

---

## 5. How it should feel

**Fast.** The shortcut brings the window forward instantly. Answers start appearing immediately, streaming, never behind a spinner. If it takes a second to think, it says what it's doing in one short line, in words a human would use. Slowness here is not an inconvenience, it's fatal. People abandon a tool that makes them wait, no matter how good the answers are.

**Quiet.** Almost no color. Off-white surfaces, near-black text, one muted grey for anything secondary. A single warm accent, used for exactly one purpose: marking that something is waiting for a person. Nowhere else. If you find yourself reaching for a second accent color, the interface has too much in it.

**Transparent, literally.** Surfaces are frosted and layered. You see your own desktop, your own document, your own inbox through them. This is not decoration. The product's argument is that it sits *over* your existing work rather than replacing it, and the interface should say that before any copy does. Nothing gets migrated, nothing gets moved, nothing gets locked in.

**Light.** Hairline borders. Real whitespace. No cards inside cards, no panels inside panels, no shadows doing work that space should do. If an element on screen is not the answer, the sources, or an action a person can take, question whether it should exist.

**Calm in language.** Italian, plain, short, lowercase. "Sincronizzato." Not "Sincronizzazione completata con successo!" It never says "I" and never performs enthusiasm. The voice is the most competent person in the room, who happens to have time for you.

**Trustworthy in the boring way.** There is a page, in plain Italian, that says what the brain can read, what it can write, and what leaves the computer. Below it, a readable list of everything it has actually done, by day. No toggle grids, no jargon, no consent theatre. For an Italian company handing over its mail, this page is not a settings screen, it is the reason they say yes.

---

## 6. What's in this version

The first install is a single person on their own material. Everything below must work properly for one user before anyone thinks about a second.

**In:**
- Connect a mail account and a folder of documents
- Ask questions and get answers with visible sources
- Ask it to write something, get a draft in the right voice with the right attachments identified
- The onboarding conversation that captures how the person decides things
- Prepared work waiting quietly when the brain is confident
- The transparency page and the activity log
- The app, the shortcut, the menu bar mark

**Out, deliberately:**
- Any kind of knowledge map or graph visualization. It photographs well and nobody opens it twice.
- Multiple users, teams, roles, permissions between people
- Anything that sends, posts, or changes something on its own
- The provider console where every client company is visible. That's a separate product and it comes later.
- Mobile

Building fewer things properly is the entire strategy here. This has to be shown to real people and it has to look finished.

---

## 7. What done looks like

Not a feature list. One scene.

You are working. An email arrives asking for something that requires knowing which file is current and why. Without you doing anything, the answer is already waiting in the app with a quiet mark in the menu bar. You press the shortcut. The window comes forward over your work, translucent, and there is a written reply in your own voice with the right file attached.

You read it in four seconds. You press send. You never wondered where it got any of it, and if you had wondered, hovering over one line would have told you.

If that scene works, on real mail, with real files, the product exists. Everything else is expansion.
