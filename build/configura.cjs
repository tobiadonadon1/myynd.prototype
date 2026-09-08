// La configurazione di electron-builder, come oggetto.
//
// `electron-builder.yml` alla radice è la parte fissa: cosa entra, i target,
// le frasi dell'Info.plist. Tre cose però dipendono da chi impacchetta e da
// dove — la firma, la notarizzazione, il feed degli aggiornamenti — e un
// YAML non legge le variabili d'ambiente. Questo file carica quel YAML e ci
// mette sopra quello che cambia. Si usa con `--config build/configura.cjs`;
// anche `electron-builder` da solo funziona, ma senza questa parte.
//
// CommonJS di proposito: electron-builder lo carica con `require`, e il
// package.json dice `"type": "module"` — un `.js` qui verrebbe letto come ESM.
const { readFileSync, writeFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const yaml = require('js-yaml')
const binari = require('./binari.cjs')

const fissa = yaml.load(readFileSync(join(__dirname, '..', 'electron-builder.yml'), 'utf8'))
const amb = process.env

/*
 * La firma, e cosa succede quando non c'è.
 *
 * electron-builder cerca un «Developer ID Application» nel portachiavi solo
 * quando `identity` non è impostata. Su una macchina che ha soltanto un
 * certificato «Apple Development» non lo trova — ed è giusto: quel
 * certificato non vale per distribuire, e su un DMG non va usato — ma nella
 * 26 non c'è nessun ripiego automatico: l'app resta *senza* firma, e su un
 * Mac con chip Apple un'app senza firma non parte nemmeno.
 *
 * Quindi: con CSC_NAME (o CSC_LINK, il .p12) si lascia decidere a lui, che
 * trova il Developer ID e firma davvero; senza, si firma ad hoc (`-`), che è
 * la firma di cui un Mac ha bisogno per far partire l'app in casa. Ad hoc
 * vuol dire senza identità: sugli altri Mac Gatekeeper la rifiuta lo stesso
 * («danneggiata»), finché non arriva il certificato vero. Con hardened
 * runtime la firma ad hoc chiede `disable-library-validation` fra i diritti,
 * che c'è già in build/entitlements.mac.plist perché la chiede Electron.
 */
const firmata = !!(amb.CSC_NAME || amb.CSC_LINK)
const mac = { ...fissa.mac }
if (!firmata) mac.identity = '-'

/*
 * Il binario di canvas, uno per pacchetto.
 *
 * Da node_modules non entra nessun `@napi-rs/canvas-*`: entra quello della
 * cache di build/binari.cjs per la piattaforma e l'architettura del target,
 * che il gancio `beforePack` prepara. La cache sta nella cartella dell'utente,
 * per questo le righe si aggiungono qui e non nel YAML.
 */
// I filtri della piattaforma sostituiscono quelli comuni: conservare la lista
// esplicita, altrimenti builder ripiega su **/* (anche fuori da dist-app).
mac.files = [...fissa.files, ...(mac.files ?? []), ...binari.voci('darwin')]
const win = { ...fissa.win, files: [...fissa.files, ...(fissa.win.files ?? []), ...binari.voci('win32')] }

/*
 * Gli aggiornamenti, se c'è un posto da cui scaricarli.
 *
 * Con MYYND_AGGIORNAMENTI_URL si scrive il feed (`latest-mac.yml`,
 * `latest.yml`) accanto agli artefatti, e il guscio lo chiede a quell'URL.
 * Senza, niente blocco `publish`: l'app parte senza feed e il guscio dice
 * «spento / nessun-feed». Su macOS electron-updater scarica uno zip, non il
 * DMG: quando il feed c'è si aggiunge quel target per ciascuna architettura,
 * altrimenti l'aggiornamento troverebbe la lista vuota. E si aggiorna solo
 * un'app firmata: senza certificato il feed è inutile, e il guscio deve dire
 * «non-firmata» invece di provarci.
 */
const feed = (amb.MYYND_AGGIORNAMENTI_URL || '').trim()
/*
 * `publish: null` e non «assente»: senza niente electron-builder si inventa
 * un feed dal remoto git del progetto, e l'app se lo porterebbe dentro in
 * `app-update.yml` senza che nessuno l'abbia deciso.
 */
const publish = feed ? [{ provider: 'generic', url: feed, channel: 'latest' }] : null
/*
 * Il guscio legge `desktop/feed.json` a runtime — una variabile d'ambiente
 * di chi impacchetta non esiste sul computer di chi scarica. Si scrive qui,
 * quando il feed c'è, e si toglie quando non c'è: un feed di ieri non deve
 * finire nel pacchetto di oggi. Il file è ignorato da git.
 */
const feedJson = join(__dirname, '..', 'desktop', 'feed.json')
if (feed) writeFileSync(feedJson, JSON.stringify({ url: feed }, null, 2) + '\n')
else rmSync(feedJson, { force: true })
if (feed) {
  const archi = new Set(mac.target.flatMap(t => t.arch))
  mac.target = [...mac.target, ...[...archi].map(a => ({ target: 'zip', arch: [a] }))]
}

module.exports = {
  ...fissa,
  mac,
  win,
  publish
}
