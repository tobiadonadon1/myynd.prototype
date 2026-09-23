# Sources inside a company (23 September 2026)

The first outside tester asked: how does Myynd work in a large company, where
an admin has to approve integrations? This note describes the path now in the
app, the copy, and what the owner still has to decide.

## The rule

The app says "your company has to approve this" only when the service says so
in plain words. Everywhere else the old message stays, because "wrong password"
is far more common than "blocked by IT". Telling someone to bother IT over a
typo costs as much as telling them their correct password is wrong.

## What is detected (`server/connettori/amministratore.ts`)

| Where | What the service says | Case |
|---|---|---|
| Gmail IMAP login | `[ALERT] IMAP access is disabled for your domain. Please contact your domain administrator…` | `gmail` |
| Entra ID return / token exchange | `AADSTS65001`, `90094`, `90095`, `50105`, `53003`, `530035`, `consent_required` | `microsoft-oauth`, with the admin consent link |
| Google return | `admin_policy_enforced`, `org_internal`, `access_not_configured` | `google-oauth` |
| GitHub, token sees 0 repositories | nothing specific: a pending org token reads only public repos | `github-org` as **maybe** |

Not detected, on purpose: Gmail `[AUTHENTICATIONFAILED] Invalid credentials`
(same string for a typo, a revoked app password and an admin revoke), a Google
or Outlook iCal 404 (same for a wrong, reset or blocked address), AADSTS65004
(the user said no, or asked for approval and went back).

Where nothing reaches Myynd, the person notices on the other site: the secret
iCal address section is missing, or Google says app passwords are "not
available for your account". So the last step of the Calendar and Mail
"Where do I find it?" lists says so, with the same request one click away.

## The flow

1. The card shows one line in the sand warning style, not red: who has to act.
   "Your company does not let other apps read Gmail. Your admin can allow it."
2. Two buttons: **Email your admin** (opens the mail app with subject and body,
   no recipient, since Myynd does not know who IT is) and **Copy the request**.
3. Collapsed below: **What the request says**, the full text.

For the "maybe" case (GitHub) the red line keeps the likelier cause ("choose
All repositories under Repository access") and the admin block sits under it,
worded as a condition: "If the token belongs to an organization…".

One component (`ChiediAllAmministratore` in `forms.tsx`) serves Mail, Calendar,
GitHub, Google, Drive and Microsoft.

## The request (`src/amministratore.ts`)

Written in the interface language, five lines an admin can act on without
writing back:

- what the person wants to connect, and why IT is involved;
- **what Myynd reads**, and exactly what that access can do. "Read-only" is
  written only where it is true (the iCal address, Microsoft's `*.Read`
  scopes, the GitHub token). Over IMAP Myynd saves drafts and archives when the
  person presses a button, and the Google consent asks for `gmail.modify`, so
  those say "never on its own, only when I press a button";
- **where the data stays**: on this computer (or, hosted, on the named
  server), and only the passages needed go to the connected AI model;
- **what to change**, with the console path in the console's own words
  (for example `Apps › Google Workspace › Gmail › End User Access › POP and
  IMAP access`), and for Microsoft the tenant-wide consent link
  `https://login.microsoftonline.com/{tenant}/adminconsent?client_id=…`.

## Open decisions for the owner

1. **Verified OAuth apps.** Google and Microsoft sign-in stay off
   (`pronto: false`). In most work tenants they cannot work without them.
   Since 2026 Entra's default consent policy does not let users consent to
   `Mail.Read` / `Calendars.Read`, so every Microsoft 365 user hits the admin
   screen. `gmail.modify` is a restricted Google scope, which means an
   annual security assessment. This is a business and legal step, not code.
2. **Microsoft 365 mail has no password route at all.** Exchange Online
   refuses every IMAP password, including app passwords, and no admin can turn
   that back on. The Mail card now says the Outlook connection "is coming
   soon" instead of sending people to a card that is not offered.
3. **Hosted sign-in.** When Google or Microsoft say no on the hosted web flow,
   the return page shows the sentence but not the request block. Carrying the
   case back to the card needs a small redirect change.
4. **Google rarely comes back.** On `admin_policy_enforced` Google usually
   stays on its own error page and never redirects. Myynd then only sees a
   timeout. We could offer the admin request after a timeout on a work domain.
5. **Admin address.** The request opens with no recipient. Asking once
   "who handles IT for you?" would let it go straight to the right person.
