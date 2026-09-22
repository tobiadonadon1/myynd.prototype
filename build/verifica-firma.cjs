// Dopo il pacchetto: com'è firmata davvero l'app che sta per essere installata.
//
// Il 22 settembre 2026 il certificato locale era scaduto da sei ore,
// electron-builder ha saltato la firma senza fallire, e l'app installata
// portava la firma del binario di Electron: identificatore «Electron», ad hoc.
// Per macOS era un'altra app — l'accesso completo al disco sparito, le Note
// cadute al riavvio — e niente l'aveva detto. Da qui non passa più:
// l'identificatore deve essere quello dell'app, e ad hoc solo se chiesto.

const { spawnSync } = require('node:child_process')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const yaml = require('js-yaml')

/** Cosa dice `codesign -dv` di un'app, e se va bene. */
function giudicaFirma(uscita, { appId, adhocAmmesso }) {
  const identificatore = uscita.match(/^Identifier=(.+)$/m)?.[1]?.trim() ?? ''
  const adhoc = /^Signature=adhoc$/m.test(uscita)
  const guai = []
  if (identificatore !== appId) guai.push(`the app is signed as "${identificatore || '?'}", not "${appId}": macOS would treat it as a different app`)
  if (adhoc && !adhocAmmesso) guai.push('the app is signed ad hoc without MYYND_FIRMA_ADHOC=1: macOS would forget its permissions at every update')
  return { identificatore, adhoc, guai }
}

function verifica(radice = join(__dirname, '..'), env = process.env) {
  const appId = yaml.load(readFileSync(join(radice, 'electron-builder.yml'), 'utf8')).appId
  const app = ['mac-arm64', 'mac'].map(d => join(radice, 'dist-app', d, 'Myynd.app')).filter(existsSync)
  if (!app.length) throw new Error('No packaged Myynd.app in dist-app')
  for (const a of app) {
    const r = spawnSync('codesign', ['-dv', '--verbose=2', a], { encoding: 'utf8' })
    const g = giudicaFirma(`${r.stdout}\n${r.stderr}`, { appId, adhocAmmesso: env.MYYND_FIRMA_ADHOC === '1' })
    if (g.guai.length) throw new Error(`${a}: ${g.guai.join('; ')}`)
    console.log(`myynd · firma · ${a.replace(radice + '/', '')} · ${g.identificatore}${g.adhoc ? ' · ad hoc (chiesto)' : ''}`)
  }
}

if (require.main === module) {
  try { verifica() } catch (e) { console.error(`myynd · firma · ${e.message}`); process.exit(1) }
}
module.exports = { giudicaFirma, verifica }
