# Research D: mascots and characters in tech, and what myynd should do

Researched 30 Sep 2026 from live pages. Where a fact came only from a search snippet or a secondary blog, I say so. "Not verified" means I could not confirm it from a page I could open.

Myynd's candidate: small orange plush-like monster, pale belly, two antennae, 40 px next to AI chat messages, planned for the macOS menu bar with a "watching" state.

---

## 1. Field notes, one entry per example

Each entry: build / motion / where it lives and where it does not / attention or failure / lesson.

### Duolingo, Duo and the World Characters
- **Build.** The 2018-19 redesign made Duo geometric on purpose. Head of Design Tyler Murphy: "His wings are just half circles hiding behind the body... He's more or less a cylinder with wings", and the simple geometry "made the animation and illustration time go down drastically". Before that Duo had basically two states, happy and crying, like the Twitter bird. Flat 2D vector, no outlines, saturated green. [Apple Developer, "The evolution of the Duolingo owl"](https://developer.apple.com/news/?id=e2e1faj4). The ten World Characters follow the same rule: geometric, big eyes, body with wings, detached feet ([Duolingo blog, "Building character"](https://blog.duolingo.com/building-character/)). One design lead described "wholes, halves and quarters of four basic shapes" (search snippet only; not verified on a primary page).
- **Motion.** Rive state machines. Duolingo says Rive made the files "smaller and more performant" and made lip-sync possible at scale: 20+ mouth shapes (visemes) per character, driven by timing data sent from the server instead of video ([Duolingo blog, "World character visemes"](https://blog.duolingo.com/world-character-visemes/)). Idle is head nods, blinking, eyebrow moves, plus reactions to lesson performance. For the AI Video Call with Lily, Rive's write-up says 8 head animations x 8 body animations give 64+ neutral variants, nested artboards split head and body, the whole file is under 1 MB, and code fires event-triggered expressions while animators author the pieces ([Rive blog, Lily case study](https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life)). A blog claim that Duo blinks every 4-6 s is from a secondary source (not verified).
- **Where present / absent.** Present in lessons, streak, notifications, widgets, social. Duolingo publishes no rule I could open about where Duo is absent from the product (not verified). The social account is a separate, looser voice: Duolingo employs a "mascot specialist" from Sesame Street to set what Duo may do, "This is what Elmo was allowed or not allowed to do" ([The Drum](https://www.thedrum.com/news/2025/02/25/duolingo-s-tiktok-mastermind-its-unhinged-social-strategy-and-killing-its-mascot)).
- **Attention.** "Death of Duo" (11 Feb 2025): three business days of planning, legal consulted, customer support warned, Japan treated as "dead tired" not dead, 144M views on X, 450 articles, "The comments are your next media brief" ([PR Daily](https://www.prdaily.com/duolingo-shares-pr-secrets-of-viral-death-of-duo-campaign/)). Duo returned on 24 Feb; a secondary aggregator claims DAU rose 11% Jan to Feb (not verified).
- **Failure mode.** On 28 Apr 2025 the CEO's "AI-first" memo drew a backlash; Duolingo wiped its TikTok and Instagram on 17 May, reportedly after 300,000+ unfollows ([PR Daily walk-back](https://www.prdaily.com/the-scoop-duolingo-ceo-walks-back-ai-first-memo/), wipe details from search snippets, not verified). The mascot's warmth made a cold business memo feel like betrayal. Duo is "notoriously pushy" (The Drum): the character is powerful because it is emotionally loaded, and that is also its liability.
- **Lesson for myynd.** Copy the construction (cylinder plus half-circles, modular parts, state machine) not the tone (pushy, guilt). Duolingo's character earns trust in a game where nothing is at stake. Myynd's stakes are the user's mail.

### Anthropic, Claude Code "Clawd" (and the spark)
- **Build.** 8-bit pixel sprite, orange, stout, "stacked squares" with two black eyes, sometimes read as crab, sometimes blob ([Stark Insider](https://www.starkinsider.com/2025/10/clawd-ai-retro-mascot-command-line.html)). Name is a pun on Claude + claw. The Claude changelog shows it is a maintained asset: v2.1.282 (24 Sep 2026) "Changed the Clawd mascot's feet in the start-up banner to sit under the corners of his body", v2.1.236 fixed "eyes and feet rendering unevenly in iTerm2 at some font sizes" ([Claude Code changelog](https://code.claude.com/docs/en/changelog)). That is the real cost of a tiny mascot: it must render exactly on someone else's grid.
- **Motion.** The startup banner sprite is static as far as Stark Insider reports ("No fancy animation"). Separate from Clawd, Anthropic shipped an April Fools 2026 companion, `/buddy`: 5-line x 12-column ASCII sprites with idle and blink frames, LLM-written speech bubbles, deterministic species by account hash, and `/buddy off` and `/buddy mute` ([claudefa.st](https://claudefa.st/blog/guide/mechanics/claude-buddy); third-party, not an Anthropic page, so treat details as unverified).
- **Where present / absent.** Startup banner only; not in the transcript, not in tool output, not in permission prompts. GitHub issue #8536 (30 Sep 2025) complained that Clawd was on social media but missing from the extension's empty state; no staff reply visible ([issue](https://github.com/anthropics/claude-code/issues/8536)). A user noticed the sprite turned blue around v2.0.67 with no changelog line; the issue was closed "not planned" ([#13755](https://github.com/anthropics/claude-code/issues/13755)).
- **Attention.** Anthropic explained almost nothing, and the community filled the gap (3D prints, desktop toys). Ambiguity did the work.
- **Claude spark.** Not verified: I could not open an Anthropic brand page on the spark's construction.
- **Lesson for myynd.** Silhouette plus two eyes is enough identity. Put it in the one quiet moment (arrival), keep words out of its mouth, and treat any colour change as a semantic event (people asked "does the colour mean my tier?").

### GitHub, Octocat / Mona (and Copilot mascot)
- **Build.** Part cat, part octopus, originally a stock illustration by Simon Oxley that GitHub bought; Cameron McEfee then built the Octodex (each piece 6-12 hours), the Invertocat silhouette, and vinyl figures ([McEfee](https://cameronmcefee.com/work/the-octocat/)). Current standard is "Octocat 2.0"; Copilot has its own AI mascot in purple/blue/pink shading.
- **Motion.** Animation became central by 2014, "neutral body movements" and comic problem-solving (McEfee).
- **Rules.** McEfee: the Octocat "must never speak (avoiding mascot failures like Clippy)", keep suction cups and ears intact, permissive licence that requires linking to a profile. GitHub's Brand Toolkit is the best written restraint policy I found: "Less is more. Overuse or use of mascots as space fillers can be distracting and annoying." Don't use them "for serious topics including Money, security, sales, enterprise offerings, apologies, politics or crises"; not in sales, support or training; not as logos or sub-team branding; "prevent mascots from interrupting user workflows"; all public use approved by Brand & Marketing Design ([GitHub Brand Toolkit, Mascots](https://brand.github.com/graphic-elements/mascots)).
- **Lesson.** The mascot lives at events, swag, community, milestones; the product surfaces that carry risk are explicitly excluded. This list is the template for myynd's "never" list.

### Mailchimp, Freddie
- **Build.** Chimp head with cap and wink. The 2018 Collins rebrand made Freddie "simplified" alongside a chunky wordmark, Cavendish Yellow and Cooper Light; earlier wordmark was Jessica Hische's 2013 script ([Creative Review](https://www.creativereview.co.uk/mailchimp-goes-yellow-in-rebrand-by-collins/), [It's Nice That](https://www.itsnicethat.com/news/mailchimp-collins-brand-system-graphic-design-270918)). Exact geometry not verified.
- **Restraint.** Mailchimp's voice guide: "it's always more important to be clear than entertaining", "don't go out of your way to make a joke", and when unsure "keep a straight face" ([Mailchimp Content Style Guide](https://styleguide.mailchimp.com/voice-and-tone/)). (Mailchimp's guide does not list contexts by name; I am not claiming it does.) One secondary write-up says Freddie now appears in loading states and error messages (Canny Creative; not verified on a primary source).
- **Lesson.** When you simplify a mascot, you make it cheaper to place everywhere, which raises the discipline needed. Mailchimp's answer was a tone rule, not a placement rule.

### Headspace characters
- **Build.** Curved, free-flowing blobs with no sharp edges, no human faces or traditional limbs, mixed sizes and colours; they depict inner states, not people ([Raw Studio case study](https://raw.studio/blog/how-headspace-designs-for-mindfulness/), secondary).
- **Where.** Onboarding, explainer animations, emotion education. Not Headspace's exercises themselves (the guided audio is voice only; general knowledge, not fetched).
- **Lesson.** Abstract characters let you signal state without implying a person is watching you. For myynd, "creature" is safer than "person", and the less face, the less staring.

### Finch (self-care pet)
- **Build.** A customizable bird ("birb") you name and give pronouns; it grows and gets clothes as you complete your own goals ([Pratt IxD critique](https://ixd.prattsi.org/2026/02/design-critique-finch-self-care-pet-ios-app/)). Rewards are "rainbow stones".
- **Rules.** Reviews describe a no-punishment policy: if you miss goals or step away, it only encourages (from a search summary of a review; Finch's own page frames "small steps count" and does not spell out missed-day behaviour: [finchcare.com](https://finchcare.com/about-finch)).
- **Lesson.** A pet earns affection by being forgiving. Myynd's watcher should never look sad, hurt, sick or lonely when the user ignores it. Absence is a normal state.

### Discord, Wumpus
- **Build.** Lilac/purple blob with stub legs and a leaf; described as a blank-slate character with "no friends" and no formal personality document ([Mascotti Studio](https://mascotti.studio/blog/mascots-we-love-wumpus-discord)).
- **Where.** Empty servers, loading, 404 and connection errors; "barely in Discord's external communications". Affection accumulates from "hundreds of tiny warm moments" in places that would otherwise be generic placeholders. One source also says safety warnings (search snippet, not verified); this is the one Discord placement I would not copy.
- **Lesson.** Best placement is where the product has nothing to say: idle, empty, waiting. Wumpus never speaks, so the community wrote its lore.

### Notion, illustrations (Roman Muradov) and the AI face
- **Build.** Muradov's style is "simple, smooth, and polished while maintaining pronounced gestural quality", one gesture per shape ([Skillshare/It's Nice That coverage](https://www.itsnicethat.com/articles/buck-notion-graphic-design-illustration-project-170724)). The AI face has three features only: eyes, eyebrows, a nose. Fast Company: "if Microsoft's Clippy grew up drinking dirty martinis and reading New Yorker cartoons" ([BUCK write-up](https://the-brandidentity.com/project/how-buck-gave-notions-ai-assistant-a-hand-drawn-personality)); Notion AI ("Nosy") launched 2024.
- **Motion.** BUCK animated cel-style first, then rebuilt it in a Rive state machine so states mix: "eyebrows that wave while thinking", "a face that momentarily falls apart for errors", layered so it can think while showing progress ([BUCK](https://buck.co/work/notion-ai)). Brief: "delightful, alert and engaged, but not distracting". Won a Webby for Best Use of AI.
- **Where.** Follows the cursor and the AI states inside Notion's editor; the marketing illustrations are separate. Notion's own post frames Clippy as "early and wrong": the concept was right, the tech was not, and its AI has "a face, but I'm not human" ([Notion blog](https://www.notion.com/blog/clippy-walked-so-notion-ai-could-run)).
- **Lesson.** Three features and a state machine is enough. Note the error state: even "falls apart" is a comic beat, which is precisely what myynd must not do for data errors.

### Microsoft, Clippy (why it failed) and Copilot "Mico"
- **Clippy.** Designed by Kevan Atteberry, descended from Microsoft Bob's characters. Failure causes from reporting: it interrupted ("the worst thing about Clippy... was that he interrupted", Byron Reeves); users outgrew "beginner mind"; heavy lids became large pupils that read as "leering"; it was turned off by default in XP (~2001) ([Seattle Met](https://www.seattlemet.com/news-and-city-life/2022/08/origin-story-of-clippy-the-microsoft-office-assistant)). Stanford's Nass and Reeves argued people treat computers socially, so social rules (do not interrupt, do not repeat) apply to the character.
- **Mico.** Announced 22-23 Oct 2025. A floating blob face that appears in voice conversations, listens, reacts, changes colour to reflect the interaction, "optional" and can be disabled; tap it repeatedly and it becomes Clippy as an Easter egg ([BleepingComputer](https://www.bleepingcomputer.com/news/microsoft/meet-the-new-clippy-microsoft-unveils-copilots-mico-avatar/), [The Register](https://www.theregister.com/2025/10/24/microsoft_clippy_copilot_update/)). Suleyman framed it as "human-centered". I could not open Microsoft's own post (not verified beyond press quotes). One critic in The Register felt Copilot itself acted "like a salesman", showing the mascot cannot redeem pushy behaviour.
- **Lesson.** Abstract shape, appears only in a mode the user chose (voice), colour = state, opt-out. Mico's design is Clippy's autopsy applied.

### rabbit r1 (and Humane)
- **Build.** Teenage Engineering hardware; the character is a pixelated, "heavily stylized and disembodied rabbit head" on a small screen that bobs slowly while listening, blinks, winks, wears headphones for music ([Engadget](https://www.engadget.com/rabbit-r1-is-an-adorable-ai-powered-assistant-co-designed-by-teenage-engineering-001051537.html)). It is the status indicator of the device.
- **Failure.** The character survived the product's reviews; the problems were speed, accuracy and the AI Pin's mandatory $24/month (Humane analysis, [substack](https://ibansal.substack.com/p/humane-ai-pin-failure-analysis)). Humane had no mascot at all.
- **Lesson.** A charming face on a device that fails the job amplifies the disappointment. The face must be earned by reliability.

### Friend, and Tamagotchi-like AI companions
- **Build.** A sub-2-inch pendant with no screen that is always listening and replies by text in an app; compared to a Tamagotchi ([Wikipedia](https://en.wikipedia.org/wiki/Friend_(product))). $1M+ NYC subway campaign (11,000+ rail cars, "Your new roommate is waiting") widely defaced; CEO called the backlash "artistically validating" ([CNN via search summary](https://www.cnn.com/2025/11/16/tech/friend-ai-device-backlash-ceo-avi-schiffmann), not opened).
- **Lesson.** "Always listening" plus a friendly persona is exactly the combination people rejected: the persona read as covering for surveillance. Myynd's "watching" pet has the same risk unless the character is a truthful indicator, not a friend.
- **Research.** Studies report anthropomorphic cues lower disclosure thresholds and can blur privacy boundaries (e.g., [arXiv 2601.10754](https://arxiv.org/pdf/2601.10754) and related items; snippets only, not deep-read). Conversational style matters more than visual appearance in one study, so a silent mascot is lower risk than a talking one.

### OpenAI Codex "pets" (the closest analogue to myynd's menu-bar plan)
- Optional floating overlay pets (pixel-art, eight built in, `/pet` to summon or dismiss, `/hatch` to make your own). They "don't do any coding" and exist to show what Codex is doing and to alert when a task finishes or needs input, so you need not switch windows. Rolled out as experimental in early May 2026, macOS and Windows ([Engadget](https://www.engadget.com/2162796/openai-introduces-ai-generated-pets-for-its-codex-app/)). Sprite sheet spec not verified.
- **Lesson.** The category is validated: a small sprite as ambient status indicator, opt-in, with a one-command off.

### Poke, Cluely, Ollama, Hugging Face, Bun, Deno (brief)
- **Poke** (text-message assistant). No mascot found; poke.com shows a simple mark and message screenshots ([poke.com](https://poke.com/)). Mascot claims not verified. A chat-native assistant can feel personal through tone alone.
- **Cluely.** Brand is provocation ("ragebait"); the CEO later admitted misstating revenue ([TechCrunch](https://techcrunch.com/2026/03/05/cluely-ceo-roy-lee-admits-to-publicly-lying-about-revenue-numbers-last-year/)). No official mascot. Attention bought with edge collapses when trust is questioned.
- **Ollama.** One-colour llama head as the mark (design origin not verified). Works in READMEs, terminals and menu bars.
- **Hugging Face.** Not a drawn mascot: the emoji, "our favorite emoji" per Delangue ([Fortune](https://fortune.com/2026/09/03/hugging-face-goes-from-a-scrappy-startup-named-after-an-emoji-to-13-billion-nvidia-acquisition/), search summary). A borrowed glyph gave warmth at zero animation cost.
- **Bun / Deno.** Bun's mascot construction not verified (it joined Anthropic 2 Dec 2025: [Bun blog](https://bun.com/blog/bun-joins-anthropic)). Deno's "Dino in the Rain" is Ryan Dahl's hand-drawn original under MIT with a community gallery ([deno.com/artwork](https://deno.com/artwork)). An open, remixable mascot suits open source, not a private-data product.

### Rive (the tool)
- State machine = graph of states and transitions; input types are boolean, number, trigger; 1D blend states mix timelines along one number; direct/additive blend states combine several numbers "enabling complex poses like facial expressions"; multiple layers let idle run underneath one-shot reactions from Any State; data binding via view models exposes number/boolean/string/color/trigger properties; runtimes on web, React, Apple, Android, Flutter, Unity ([Rive states](https://rive.app/docs/editor/state-machine/states), [Rive runtimes](https://rive.app/docs/runtimes/state-machines)). Sub-1 MB files per Duolingo's Lily and Notion's BUCK build.

---

## 2. What this means for myynd's build (suggestions, my synthesis)

**Construction.** Your monster has five identity marks: orange body, pale belly, two antennae, two eyes, soft silhouette. Keep it to about 7 vector parts: body, belly, 2 antennae, 2 eyes (each with a lid). Follow Duo: a simple base solid (cylinder or blob) with detachable parts. Antennae are your "wings": they carry emotion and state at 16-40 px where eyes are two dots. Flat fills, no strokes, so scaling and template rendering stay predictable. A soft plush look at 40 px reduces to a flat body plus one belly tone; do not chase texture.

**Motion budget.**
- Idle: slow breathing on the body (about 3-4 s), blink at randomised 4-6 s intervals, occasional single antenna twitch. Never loop visibly in a fixed cycle (Lily's randomised gestures exist to avoid this).
- Squash and stretch: small, from the base, belly following the body; one-shots under about 600 ms with ease-out.
- Reactions are one-shots on a second layer over idle.
- Pause animation entirely when hidden, backgrounded or Reduce Motion is on (Anthropic removed ripples and glimmer in 2.1.282, same direction).

**State machine (inputs).** Boolean `watching`, boolean `working`, number `attention` (0 idle, 1 something for you), triggers `done` and `blink`. Every state is a real app fact: eyes open only while a source is actually being read; eyes closed and antennae down when watching is paused. This is the Mico rule (colour = state) with a privacy twist: the mascot is the equivalent of a camera LED and must never say "watching" when nothing is read, or the reverse.

**Two renders.** Rive (or SVG plus CSS) for chat and popover, where colour and motion are available. Menu bar: pre-render a small set of monochrome template frames (idle, blink, watching, working, paused); the silhouette is antennae plus eyes cut out. Running a Rive canvas inside an NSStatusItem is my assumption, not something I verified. Codex pets and Clawd both use pre-authored sprite frames.

---

## 3. Rules for an AI mascot

1. **Put it in the waiting places, not the deciding places.** Wumpus lives in empty servers, loading and 404; Notion's face lives in AI states; Clawd only greets at startup. Deciding places (send, delete, pay, grant access) stay plain.
2. **It never speaks and never interrupts.** McEfee's Octocat rule ("must never speak") and GitHub's "prevent mascots from interrupting user workflows"; Clippy's fatal flaw was interruption. Speech bubbles (Claude `/buddy`) are the riskiest feature of a companion.
3. **List the forbidden surfaces in writing and gate exceptions.** GitHub's toolkit: "Money, security, sales, enterprise offerings, apologies, politics or crises", plus approval for public use. Write myynd's version (section 4) into docs/design-language.md.
4. **Draw it from few simple shapes, then rig the shapes.** Duo is a cylinder with half-circle wings (Tyler Murphy), Notion's assistant is eyes, brows and a nose, Clawd is stacked squares. Fewer parts means cheaper states, fewer render bugs (Clawd's iTerm2 fixes) and legibility at 16-40 px.
5. **Drive it with a state machine tied to real app state, with a tiny file.** Duolingo (Lily under 1 MB, inputs like mouth, expression events), Notion via BUCK. Randomise idle so it does not loop.
6. **Make it optional with a real off.** Mico is optional, Codex pets use `/pet` to dismiss, Claude `/buddy off`. For a product that reads mail, off must mean the mascot process stops, and the default in Company mode should be off.
7. **Never punish absence.** Finch does not guilt users; Duo's notoriously pushy notifications are the counter-example. The myynd mascot must never look hurt, sleepy-sad or needy when ignored.
8. **Keep marketing personality and product personality separate.** Duolingo let Duo "die" on social under a mascot specialist and legal review, not in the lesson screen; and a cold AI-first memo showed the mascot cannot buy back a trust break. The site can be looser than the app.
9. **Do not let charm outrun reliability.** rabbit r1 had a lovable rabbit on an unreliable device; Friend's persona could not mask "always listening"; Cluely's edge broke on the revenue admission. The face is a tax on every failure.
10. **Ambiguity and restraint let people project; explanation cheapens it.** Anthropic left Clawd unexplained, Wumpus has "no friends" and no lore document, and the Octodex grew because people supplied the stories. Do not write a backstory, name gags or catchphrases for the monster.

---

## 4. Should a product that reads your mail and files have a mascot?

**Yes, but as an indicator with a face, not as a friend.** The reasons:

- In myynd's case the biggest user fear is not boredom, it is "what is it doing with my mail". A truthful, tiny, silent state signal answers that fear better than a settings page: eyes open while reading, closed while paused, antennae raised when something needs you. That is the Codex-pet job (status without switching windows) and the Mico job (colour as state).
- The risk is real. Research summaries say anthropomorphic cues lower disclosure thresholds and blur privacy boundaries, and Friend shows how "friendly persona plus always listening" is read as a costume over surveillance. So: no speech, no personality copy, no first-person feelings ("I missed you"), and never reacting to the content of a message. The mascot may react to app events (done, waiting, paused), never to what a mail says (a monster that looks sad about someone's bad news is surveillance with a face).
- Eyes deserve care: Clippy's redrawn pupils were read as "leering" and some participants found the gaze creepy. Do not aim the eyes at the user or the screen; at rest they look neutrally forward or slightly down, like a lamp, not a stare. For "watching", use a raised antenna or open eyelids, not a tracking gaze.

**Where the mascot must never appear** (extends GitHub's list):
1. Errors about data: sync failure, lost or unreadable mail, index corruption, wrong or hallucinated summary, deletion or overwrite. Plain text, plain icon. (Notion's "face falls apart for errors" is charming for a chatbot hiccup and wrong here.)
2. Permission and consent: mail/calendar OAuth, Full Disk Access, folder grants, "allow Myynd to read". The user must read the words, not a smile.
3. Security and privacy: keys, sign-in, verification, password reset, data export, "delete my account", revoked tokens.
4. Billing and limits: prices, plans, the daily token cap, "Finished for today" states, receipts, refunds. A cute face on "pay us" or "you are out" reads as manipulation. (GitHub: "Money".)
5. Sending or acting on the user's behalf: the send-reply confirmation, automation approvals, anything irreversible. The mascot must not look like the thing that decides.
6. Enterprise/Companies mode: admin console, audit logs, compliance, retention and access settings, IT-facing setup, sales and procurement material. Off by default; an admin switch.
7. Apologies, incidents and outages (GitHub: "apologies... crises").
8. Legal text, terms, DPA, privacy policy.
9. Inside the content the AI produces or quotes (drafts, summaries, mail bodies), and in the middle of any screen where the user is reading their own data.
10. Notifications and menu-bar alerts that interrupt; it can change state quietly but must not bounce, chime or pop out.

**Permitted, quiet homes:** next to chat replies (40 px, already planned), empty states, first-run welcome, "all quiet" (non-error), the menu-bar state light, a very small moment on completion. It may not move more than once per event.

---

## 5. Open items and caveats

- Not verified: Claude spark construction; Poke, Cluely, Ollama, Bun mascot design details; Freddie's exact geometry; Deno official brand rules; Duolingo's own list of where Duo is not shown; Codex pet sprite spec; Wumpus in safety warnings.
- Microsoft's own Mico post, Fast Company's Notion piece, Windows Central details were blocked or thin (403/empty), so Mico details come from BleepingComputer and The Register.
- Recommendations in sections 2-4 are my synthesis, not findings.
