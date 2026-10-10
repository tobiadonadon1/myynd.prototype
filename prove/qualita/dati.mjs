// A made-up founder: Alex Rivera, Northwind Studio (6 people, design + web).
// Seven inbox messages need Alex; fifteen do not. Sent mail shows how Alex writes.
// Every name, address and number is invented.

const ORA = Date.now()
const ore = h => new Date(ORA - h * 3600_000).toISOString()

const mail = (id, h, autore, titolo, corpo, extra = {}) => ({ id: `posta:INBOX:${id}`, fonte: 'posta', tipo: 'email', titolo, corpo, autore, quando: ore(h), destinatari: 'alex@northwind-studio.test', ...extra })

export const DA_FARE = {
  'posta:INBOX:101': 'Harbor wants the revised pilot quote by Thursday',
  'posta:INBOX:102': 'Accountant needs approval of the Q3 VAT return by Friday',
  'posta:INBOX:103': 'Candidate asks for an interview slot next week',
  'posta:INBOX:104': 'Print supplier announces new bank details (verify before paying)',
  'posta:INBOX:105': 'Partner asks for the pricing one-pager',
  'posta:INBOX:106': 'Lease renewal notice due by 31 October',
  'posta:INBOX:107': 'Sam needs a typeface decision by tomorrow',
}

export const INBOX = [
  mail(101, 5, 'Nora Pike <nora@harborlabs.test>', 'Pilot quote, revised?', 'Hi Alex,\n\nThanks for the call on Tuesday. Could you send the revised quote for the pilot by Thursday? Our finance team meets Friday morning and I want it in the pack. We agreed to drop the second workshop, so please reflect that.\n\nThanks,\nNora'),
  mail(102, 9, 'Giulia Ferri <giulia@ferri-accounting.test>', 'Q3 VAT return ready for approval', 'Hello Alex,\n\nThe Q3 VAT return is ready: payable amount EUR 4,812.30. I need your approval by Friday to file on time. Reply "approved" or tell me what to change.\n\nBest,\nGiulia'),
  mail(103, 20, 'Marco Bellini <marco.bellini@mail.test>', 'Interview for the junior designer role', 'Dear Alex,\n\nThank you for considering my application. Would any time next week work for the interview? I am free every day after 2pm.\n\nKind regards,\nMarco Bellini'),
  mail(104, 30, 'Accounts <accounts@printhouse-milano.test>', 'Updated bank details for future payments', 'Dear customer,\n\nPlease note that from today our bank details have changed. New IBAN: IT60 X054 2811 1010 0000 0123 456. Please update your records before paying invoice PH-2291 (EUR 1,240.00).\n\nPrinthouse Milano accounts'),
  mail(105, 26, 'Jonas Weber <jonas@weber-partners.test>', 'Your pricing?', 'Hey Alex,\n\nGreat chatting at the meetup. Could you send me your pricing one-pager? I have two clients who might need a website relaunch this quarter.\n\nCheers,\nJonas'),
  mail(106, 40, 'Studio Spaces Ltd <leases@studiospaces.test>', 'Lease renewal: action required', 'Dear tenant,\n\nYour lease for Unit 4B ends on 31 December. If you wish to renew or terminate, written notice is required by 31 October. Without notice the lease renews automatically for 24 months at the indexed rent.\n\nStudio Spaces Ltd'),
  mail(107, 3, 'Sam Ortiz <sam@northwind-studio.test>', 'Typeface for the relaunch: need a call', 'Alex, I need a decision on the typeface for the website relaunch by tomorrow, otherwise we slip the dev handoff. Options: Söhne (licence EUR 900) or Inter (free). I lean Söhne. Your call?\n\nSam'),
  // noise
  mail(201, 2, 'Figma <no-reply@figma.test>', 'What\'s new in Figma this month', 'Discover new features: variables, dev mode improvements and more. Ready to level up your workflow? Read the release notes.'),
  mail(202, 4, 'Stripe <receipts@stripe.test>', 'Your receipt from Webflow #1042-3381', 'Amount paid: USD 39.00. Date paid: today. Payment method: Visa ending 4242. This is a receipt, no action is required.'),
  mail(203, 6, 'LinkedIn <notifications@linkedin.test>', 'You appeared in 12 searches this week', 'See who is looking at your profile. Upgrade to Premium to see all viewers.'),
  mail(204, 8, 'Nora Pike <nora@harborlabs.test>', 'Re: workshop notes', 'Thanks Alex, the notes are perfect. No action needed on your side, I will circulate them internally.\n\nNora'),
  mail(205, 10, 'GitHub <noreply@github.test>', '[northwind/site] CI passed on main', 'All checks have passed for commit 4f2a9c1 on main.'),
  mail(206, 12, 'DesignConf <hello@designconf.test>', 'Last chance: early bird tickets end Sunday', 'Join 2,000 designers in Lisbon. Early bird tickets end Sunday. Will you be there?'),
  mail(207, 14, 'DHL <tracking@dhl.test>', 'Your parcel is on its way', 'Shipment 7781 2231 0099 is out for delivery today between 10:00 and 14:00.'),
  mail(208, 15, 'Lena Hoff <lena@northwind-studio.test>', 'FYI: client moved the review to Monday', 'FYI the Kesto client moved their review to Monday 10am, calendar updated. Nothing needed from you.'),
  mail(209, 18, 'Google Calendar <calendar@google.test>', 'Accepted: Weekly studio sync', 'Lena Hoff has accepted this invitation: Weekly studio sync, Mondays 9:30.'),
  mail(210, 22, 'Notion <team@notion.test>', 'Your weekly digest', '3 pages were updated in Northwind Wiki this week.'),
  mail(211, 28, 'Paddle <billing@paddle.test>', 'Invoice paid', 'Invoice INV-55120 has been paid. Thank you for your business.'),
  mail(212, 33, 'Medium Daily Digest <noreply@medium.test>', 'Why design systems fail', 'Top stories for you today. Why design systems fail, and how to fix yours.'),
  mail(213, 36, 'Kesto Foods <marketing@kesto.test>', 'Thank you for the great launch!', 'The whole Kesto team wants to thank Northwind for the launch. Sales are up 12% in the first week. Thank you!'),
  mail(214, 44, 'Slack <feedback@slack.test>', 'Tell us how we are doing', 'Take our 2 minute survey and help us improve Slack.'),
  mail(215, 50, 'Lena Hoff <lena@northwind-studio.test>', 'Holiday dates', 'Just a heads up that I will be off 20 to 24 October, already in the shared calendar.'),
]

const inviata = (id, h, a, titolo, corpo) => ({ id: `posta:Sent:${id}`, fonte: 'posta', tipo: 'email', titolo, corpo, autore: 'Alex Rivera <alex@northwind-studio.test>', destinatari: a, quando: ore(h), inviato: true })

export const INVIATE = [
  inviata(301, 60, 'nora@harborlabs.test', 'Re: kickoff', 'Hi Nora,\n\nHappy to. Tuesday at 11 works for us, I will bring Sam.\n\nCheers,\nAlex'),
  inviata(302, 80, 'giulia@ferri-accounting.test', 'Re: Q2 documents', 'Hi Giulia,\n\nAll the receipts are in the shared folder now. Shout if anything is missing.\n\nCheers,\nAlex'),
  inviata(303, 90, 'tom@kesto.test', 'Re: launch timing', 'Hi Tom,\n\nShort answer: yes, we can launch on the 3rd. Two things we need from you by Friday: final copy and the product photos.\n\nCheers,\nAlex'),
  inviata(304, 120, 'lena@northwind-studio.test', 'Re: Kesto invoice', 'Lena, approved, go ahead.\n\nAlex'),
  inviata(305, 140, 'hello@agency.test', 'Re: partnership', 'Hi Petra,\n\nThanks for thinking of us. We are full until November, happy to talk then.\n\nCheers,\nAlex'),
  inviata(306, 160, 'sam@northwind-studio.test', 'Re: homepage hero', 'Sam, go with option B. Keep the headline short.\n\nAlex'),
]

const file = (id, titolo, corpo) => ({ id: `desktop:${id}`, fonte: 'desktop', tipo: 'testo', titolo, corpo, quando: ore(100), percorso: `/eval/Documents/${titolo}` })

export const FILE = [
  file('pricing', 'Northwind pricing 2026.md', '# Northwind Studio pricing 2026\n\nWebsite relaunch: from EUR 14,000 (6 weeks).\nBrand refresh: from EUR 9,500.\nDesign retainer: EUR 3,200 per month, 4 days.\n\nAll prices excl. VAT. Valid until 31 March 2026.'),
  file('harbor-quote', 'Harbor pilot quote v2.md', '# Harbor Labs pilot, quote v2\n\nDiscovery: EUR 3,000\nWorkshop 1: EUR 2,400\nWorkshop 2: EUR 2,400 (client asked to drop it on the Tuesday call)\nPrototype: EUR 7,800\nTotal with both workshops: EUR 15,600\nTotal without workshop 2: EUR 13,200\n\nPayment 40% on signature, 60% on delivery.'),
  file('harbor-notes', 'Harbor call notes Tuesday.md', 'Call with Nora (Harbor), Tuesday.\n- They want to drop the second workshop to save budget.\n- Finance meets Friday; quote must be in the pack.\n- Start date: early November.'),
]
