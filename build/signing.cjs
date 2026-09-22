const { existsSync, readFileSync } = require('node:fs')
const { execFileSync } = require('node:child_process')

/** The identities macOS will actually sign with: valid, unexpired, with their key. */
function validIdentities() {
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
    return [...out.matchAll(/"([^"]+)"/g)].map(m => m[1])
  } catch { return [] }
}

/** Distribution credentials take priority. A pinned local certificate must
 * never silently become ad-hoc after an update (that loses macOS grants).
 *
 * «Silently» happened on 22 September 2026: the pinned Apple Development
 * certificate expired at 09:41 GMT, electron-builder skipped signing without
 * failing, and the build installed that afternoon was ad-hoc with the
 * identifier "Electron". macOS took it for a different app: Full Disk Access
 * was gone and the Notes source fell on the first restart. A pin now has to
 * be a valid identity, or the package stops and says why. */
function signingConfiguration(mac, env, localSigningPath, valid = validIdentities) {
  if (env.CSC_NAME || env.CSC_LINK) return { ...mac }
  // ad hoc on purpose, said out loud: the pin stays, and the next package with
  // a valid certificate goes back to it. Never a silent fallback.
  if (env.MYYND_FIRMA_ADHOC === '1') return { ...mac, identity: '-' }
  if (!existsSync(localSigningPath)) return { ...mac, identity: '-' }
  const localSigning = JSON.parse(readFileSync(localSigningPath, 'utf8'))
  if (typeof localSigning.identity !== 'string' || !localSigning.identity.startsWith('Apple Development: ') || !localSigning.identity.slice(19).trim()) {
    throw new Error('Invalid local signing identity')
  }
  if (!valid().includes(localSigning.identity)) {
    throw new Error(`The local signing certificate "${localSigning.identity}" is not valid on this Mac (expired or missing its key). ` +
      'Renew it in Xcode › Settings › Accounts › Manage Certificates, then package again. An ad-hoc build would make macOS forget ' +
      'the permissions Myynd has (Full Disk Access, Calendar, Automation).')
  }
  return { ...mac, identity: localSigning.identity, type: 'development', notarize: false }
}
module.exports = { signingConfiguration, validIdentities }
