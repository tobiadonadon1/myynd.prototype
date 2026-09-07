// La notarizzazione, solo quando può farla.
//
// electron-builder chiama questo file dopo la firma (`afterSign`). Apple
// vuole tre cose — l'Apple ID, una password per le app e il Team ID — e
// senza anche una sola di queste non c'è niente da tentare: si dice che si è
// saltata e si va avanti, invece di fallire il pacchetto a metà. Un'app
// firmata ad hoc non si può notarizzare: anche lì si salta, e si dice.
module.exports = async function notarizza(contesto) {
  if (contesto.electronPlatformName !== 'darwin') return

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID, CSC_NAME, CSC_LINK } = process.env
  const credenziali = [APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID]
  if (credenziali.some(v => !v)) {
    console.log('  • notarizzazione saltata: servono APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD e APPLE_TEAM_ID')
    return
  }
  if (!CSC_NAME && !CSC_LINK) {
    console.log('  • notarizzazione saltata: l\'app è firmata ad hoc (manca CSC_NAME o CSC_LINK)')
    return
  }

  // arriva con electron-builder, non è una dipendenza nostra: se manca si
  // dice cosa manca, non «Cannot find module»
  let notarize
  try { ({ notarize } = require('@electron/notarize')) } catch {
    throw new Error('Manca @electron/notarize: `npm i -D @electron/notarize`.')
  }

  const nome = contesto.packager.appInfo.productFilename
  const appPath = `${contesto.appOutDir}/${nome}.app`
  console.log(`  • notarizzazione di ${nome}.app (può volerci qualche minuto)`)
  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  })
  console.log('  • notarizzata.')
}
