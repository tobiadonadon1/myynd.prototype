// Un guscio nudo per guardare il sito: una finestra, un indirizzo, niente altro.
// Non è il prodotto — il prodotto è il sito. Questo serve solo alle prove.
const { app, BrowserWindow } = require('electron')
app.whenReady().then(() => {
  // invisibile: è una sonda, non deve comparire sullo schermo di nessuno
  const w = new BrowserWindow({ width: 1280, height: 860, show: false })
  w.loadURL('http://127.0.0.1:5173/')
})
app.on('window-all-closed', () => app.quit())
