// Everything the site needs from the business, in one place. Nothing here is
// invented: the prices come from the business plan of 24 September 2026, and
// every link that does not exist yet is left empty on purpose. An empty link
// keeps its button honest (it says the checkout is not open yet) instead of
// sending a stranger to a page that 404s.
window.MYYND = {
  // Paddle checkout links (plan L3). Paste the hosted checkout URL of each
  // price once Paddle has approved the seller. Success URL: /welcome.html
  checkout: {
    founding: '',   // $19 a month, locked for life, first 100 people
    personal: ''    // $29 a month or $290 a year, after the first 100
  },

  // How a company books its pilot: a calendar link, or a mailto:.
  pilot: '',

  // The two builds electron-builder makes (Myynd-<version>-<arch>.dmg).
  download: {
    arm64: '',      // Apple silicon
    x64: ''         // Intel
  },

  // False until the Developer ID certificate exists (plan L1). While false,
  // the welcome page shows the one extra step macOS asks for the first time.
  signed: false,

  // Shown in the footer and on the welcome page. Leave empty until the
  // domain and the inbox exist (plan L10, L13).
  contact: ''
};
