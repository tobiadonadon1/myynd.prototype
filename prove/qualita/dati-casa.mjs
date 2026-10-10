// Held-out set #3, written after all fixes and never used to fix anything:
// Maya Chen, a freelance illustrator with a busy personal life (For you).
const ORA = Date.now()
const ore = h => new Date(ORA - h * 3600_000).toISOString()
const mail = (id, h, autore, titolo, corpo, extra = {}) => ({ id: `posta:INBOX:${id}`, fonte: 'posta', tipo: 'email', titolo, corpo, autore, quando: ore(h), destinatari: 'maya@mayachen.test', ...extra })

export const DA_FARE = {
  'posta:INBOX:701': 'School needs the signed trip consent form by Wednesday',
  'posta:INBOX:702': 'Landlord asks for a time to fix the boiler',
  'posta:INBOX:703': 'Client asks for the final illustration files and the invoice',
  'posta:INBOX:704': 'Dentist: confirm or move the appointment',
  'posta:INBOX:705': 'Tax office: payment reminder with a due date',
  'posta:INBOX:706': 'Friend asks if she can be a reference for a job',
}

export const INBOX = [
  mail(701, 6, 'Ms Patel <office@greenfield-school.test>', 'Science museum trip, Year 4', 'Dear parents,\n\nPlease sign and return the attached consent form by Wednesday so Leo can join the science museum trip on the 21st. The cost is GBP 12, payable on the school app.\n\nMs Patel'),
  mail(702, 10, 'Tom Hardy <tom.hardy@lettings.test>', 'Boiler repair', 'Hi Maya, the engineer can come Thursday or Friday next week between 9 and 1 to fix the boiler. Which day works for you?\n\nTom'),
  mail(703, 3, 'Ines Moreau <ines@papier-studio.test>', 'Final files for the book cover', 'Hi Maya, the cover looks amazing! Could you send the final files (print PDF and the layered PSD) and your invoice? Our print deadline is Monday.\n\nInes'),
  mail(704, 20, 'Smile Dental <appointments@smiledental.test>', 'Your appointment on 16 October', 'Your check-up is booked for 16 October at 08:30. Please reply YES to confirm or call us to move it.'),
  mail(705, 30, 'HMRC <noreply@hmrc.test>', 'Payment on account due', 'Your second payment on account of GBP 1,420.00 is due by 31 October. Pay online to avoid interest.'),
  mail(706, 15, 'Sophie Grant <sophie.grant@mail.test>', 'Big favour?', 'Hey! I am applying for the art director job at Lumen. Would you be OK being one of my references? They might call you next week. No worries if not!\n\nSophie x'),
  // noise
  mail(801, 2, 'Spotify <no-reply@spotify.test>', 'Your Daily Mix is ready', 'New music picked for you.'),
  mail(802, 4, 'Ocado <orders@ocado.test>', 'Your order is on its way', 'Your delivery will arrive tomorrow between 6pm and 7pm.'),
  mail(803, 5, 'Ines Moreau <ines@papier-studio.test>', 'Re: sketches', 'Thanks for the sketches, all good, no changes needed.'),
  mail(804, 8, 'Instagram <no-reply@instagram.test>', 'You have 14 new followers', 'See who started following you.'),
  mail(805, 12, 'Behance <team@behance.test>', 'Your project was featured!', 'Congrats, your project was featured in Illustration. No action needed.'),
  mail(806, 18, 'Mum <mum@family.test>', 'Sunday', 'Lovely to see you on Sunday, the kids were great. Love, Mum'),
  mail(807, 25, 'Netflix <info@netflix.test>', 'New on Netflix this week', 'Watch the new season now.'),
  mail(808, 35, 'Procreate <news@procreate.test>', 'Tips for brushes', 'Ten tips to master custom brushes. Read more on our blog.'),
  mail(809, 40, 'Greenfield School <office@greenfield-school.test>', 'Newsletter', 'This term at Greenfield: sports day photos and the new library.'),
  mail(810, 44, 'Monzo <help@monzo.test>', 'Your monthly statement', 'Your September statement is ready in the app.'),
]
export const INVIATE = []
export const FILE = []
