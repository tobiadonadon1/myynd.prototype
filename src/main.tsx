import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { impostaLingua, linguaSalvata } from './lingua'

// La scelta sul movimento va applicata prima del primo disegno: aspettare che
// React monti Preferenze significherebbe vedere il fondo partire e poi fermarsi.
if (localStorage.getItem('myynd.sfondo') === 'fermo') {
  document.documentElement.style.setProperty('--mo', 'paused')
}

// La lingua dell'ultima volta, prima del primo disegno: l'accesso e il primo
// avvio compaiono prima che il server dica qualcosa.
impostaLingua(linguaSalvata())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
