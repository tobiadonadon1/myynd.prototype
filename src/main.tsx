import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { impostaLingua, linguaSalvata } from './lingua'
import { desktop } from './desktop'

// La scelta sul movimento va applicata prima del primo disegno: aspettare che
// React monti Preferenze significherebbe vedere il fondo partire e poi fermarsi.
if (localStorage.getItem('myynd.sfondo') === 'fermo') {
  document.documentElement.style.setProperty('--mo', 'paused')
}

// Dentro l'app la pagina lo sa dal primo fotogramma: il CSS che fa posto ai
// semafori della finestra sul Mac si aggancia a queste classi, e se
// arrivassero dopo il primo disegno il marchio salterebbe di posto.
const guscio = desktop()
if (guscio) document.documentElement.classList.add('app', `app-${guscio.piattaforma}`)

// La lingua dell'ultima volta, prima del primo disegno: l'accesso e il primo
// avvio compaiono prima che il server dica qualcosa.
impostaLingua(linguaSalvata())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
