# myynd.com (working name)

A static site: no build step. Serve the folder as it is.

    python3 -m http.server 4500 --directory site

- `index.html` · the page. Every line for one audience has its twin in a
  `.for-me` / `.for-co` sibling; the pill at the bottom picks which one shows.
  `?for=company` opens the page for companies (use it in outreach links).
- `welcome.html` · where the checkout sends a new member: the download.
- `config.js` · the only file to edit before launch: checkout links (Paddle),
  the pilot booking link, the two DMG links, `signed`, the contact address.
  Empty links keep their buttons honest instead of pointing nowhere.
- `main.js` · the pill and its scan, the live demo window, the flame, the
  light field (ported from `src/onboarding/LightField.tsx`), the calculator.
- `scrollcraft.js` / `.css` · the scroll engine, untouched.

Prices come from the business plan of 24 September 2026 (founding $19 for the
first 100, then $29 or $290 a year; Company pilot $7,500, then $49 a person).

The brief, the verification scripts and the screenshots live in `../site-lab`.
