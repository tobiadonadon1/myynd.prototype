import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Richiamo } from './richiamo/Richiamo'
import './index.css'
import { impostaLingua, linguaSalvata } from './lingua'
import { desktop } from './desktop'

// `?richiamo=1` è la barra della scorciatoia, non l'app: la stessa pagina,
// un componente solo. Si legge qui perché nel guscio il fondo va tolto prima
// del primo disegno — la finestra è trasparente, e un lampo color sabbia
// sopra a un'altra app si vede.
const richiamo = new URLSearchParams(location.search).get('richiamo') === '1'

// La scelta sul movimento va applicata prima del primo disegno: aspettare che
// React monti Preferenze significherebbe vedere il fondo partire e poi fermarsi.
if (localStorage.getItem('myynd.sfondo') === 'fermo') {
  document.documentElement.style.setProperty('--mo', 'paused')
}

// Dentro l'app la pagina lo sa dal primo fotogramma: il CSS che fa posto ai
// semafori della finestra sul Mac si aggancia a queste classi, e se
// arrivassero dopo il primo disegno il marchio salterebbe di posto.
const guscio = desktop()
if (guscio && !richiamo) document.documentElement.classList.add('app', `app-${guscio.piattaforma}`)
if (richiamo && guscio?.dentroIlRichiamo) {
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
}

// La lingua dell'ultima volta, prima del primo disegno: l'accesso e il primo
// avvio compaiono prima che il server dica qualcosa.
impostaLingua(linguaSalvata())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {richiamo ? <Richiamo /> : <App />}
  </StrictMode>
)
