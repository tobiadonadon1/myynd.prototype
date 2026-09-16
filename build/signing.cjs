const { existsSync, readFileSync } = require('node:fs')

/** Distribution credentials take priority. A pinned local certificate must
 * never silently become ad-hoc after an update (that loses macOS grants). */
function signingConfiguration(mac, env, localSigningPath) {
  if (env.CSC_NAME || env.CSC_LINK) return { ...mac }
  if (!existsSync(localSigningPath)) return { ...mac, identity: '-' }
  const localSigning = JSON.parse(readFileSync(localSigningPath, 'utf8'))
  if (typeof localSigning.identity !== 'string' || !localSigning.identity.startsWith('Apple Development: ') || !localSigning.identity.slice(19).trim()) {
    throw new Error('Invalid local signing identity')
  }
  return { ...mac, identity: localSigning.identity, type: 'development', notarize: false }
}
module.exports = { signingConfiguration }
