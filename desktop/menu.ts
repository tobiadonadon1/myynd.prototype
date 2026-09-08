// Il menu nativo.
//
// Le voci di Modifica con i ruoli standard non sono un lusso: senza, in
// Electron ⌘C e ⌘V non fanno niente. Il resto sono le porte verso il renderer
// (`naviga`) e due scorciatoie che la gente si aspetta da un'app da scrivania:
// ⌘, per le preferenze, ⌘N per una chat nuova.
//
// Su Windows lo stesso menu sta nascosto e compare con Alt.

import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { t } from './lingua.ts'

export type Azioni = {
  naviga(dove: string | { dove: 'chat'; id: string }): void
  cartellaDati(): string
  registro(): string
}

export function costruisci(su: Azioni) {
  const mac = process.platform === 'darwin'
  const voci: MenuItemConstructorOptions[] = []

  if (mac) {
    voci.push({
      label: 'Myynd',
      submenu: [
        { role: 'about', label: t('Informazioni su Myynd') },
        { type: 'separator' },
        { label: t('Preferenze…'), accelerator: 'CommandOrControl+,', click: () => su.naviga('preferenze') },
        { type: 'separator' },
        { role: 'services', label: t('Servizi') },
        { type: 'separator' },
        { role: 'hide', label: t('Nascondi Myynd') },
        { role: 'hideOthers', label: t('Nascondi gli altri') },
        { role: 'unhide', label: t('Mostra tutto') },
        { type: 'separator' },
        { role: 'quit', label: t('Esci da Myynd') }
      ]
    })
  }

  const file: MenuItemConstructorOptions[] = [
    { label: t('Nuova chat'), accelerator: 'CommandOrControl+N', click: () => su.naviga('nuova-chat') },
    { type: 'separator' }
  ]
  if (!mac) {
    file.push({ label: t('Preferenze…'), accelerator: 'CommandOrControl+,', click: () => su.naviga('preferenze') })
    file.push({ type: 'separator' })
    file.push({ role: 'quit', label: t('Esci') })
  } else {
    file.push({ role: 'close', label: t('Chiudi finestra') })
  }
  voci.push({ label: t('File'), submenu: file })

  voci.push({
    label: t('Modifica'),
    submenu: [
      { role: 'undo', label: t('Annulla') },
      { role: 'redo', label: t('Ripeti') },
      { type: 'separator' },
      { role: 'cut', label: t('Taglia') },
      { role: 'copy', label: t('Copia') },
      { role: 'paste', label: t('Incolla') },
      { role: 'pasteAndMatchStyle', label: t('Incolla senza formattazione') },
      { role: 'delete', label: t('Elimina') },
      { type: 'separator' },
      { role: 'selectAll', label: t('Seleziona tutto') }
    ]
  })

  voci.push({
    label: t('Vista'),
    submenu: [
      { role: 'reload', label: t('Ricarica') },
      { role: 'forceReload', label: t('Ricarica da capo') },
      { type: 'separator' },
      { role: 'resetZoom', label: t('Dimensione normale') },
      { role: 'zoomIn', label: t('Ingrandisci') },
      { role: 'zoomOut', label: t('Riduci') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: t('Schermo intero') }
    ]
  })

  const finestra: MenuItemConstructorOptions[] = [
    { role: 'minimize', label: t('Contrai') },
    { role: 'zoom', label: t('Zoom') }
  ]
  if (mac) {
    finestra.push({ type: 'separator' }, { role: 'front', label: t('Porta tutto in primo piano') })
  } else {
    finestra.push({ role: 'close', label: t('Chiudi finestra') })
  }
  voci.push({ label: t('Finestra'), role: 'window', submenu: finestra })

  voci.push({
    label: t('Aiuto'),
    role: 'help',
    submenu: [
      { label: t('Cartella dei dati'), click: () => { void shell.openPath(su.cartellaDati()) } },
      { label: t('Registro dell’app'), click: () => shell.showItemInFolder(su.registro()) },
      ...(mac ? [] : [{ type: 'separator' as const }, { role: 'about' as const, label: t('Informazioni su Myynd') }])
    ]
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(voci))
  // su Windows il ruolo `about` apre una finestrella di Electron, non del
  // sistema: senza queste tre righe direbbe poco
  app.setAboutPanelOptions({ applicationName: 'Myynd', applicationVersion: app.getVersion(), copyright: '© 2026 Myynd' })
}
