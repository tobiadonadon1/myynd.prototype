import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /*
     * Questa porta o niente.
     *
     * Senza, Vite fa una cosa che sembra gentile ed è la peggiore possibile:
     * trova la 5173 occupata — di solito da un `npm run dev` di ieri rimasto
     * aperto — e passa alla 5174, **che è la porta del server**. Da lì in poi
     * non c'è più niente che dica cosa sia successo: il server non riesce più
     * a mettersi in ascolto, l'interfaccia si apre normalmente, e ogni
     * chiamata torna un errore di proxy verso sé stessa. Si perde mezz'ora a
     * cercare un guasto nell'API che è invece due processi che si pestano i
     * piedi.
     *
     * Con `strictPort` Vite si ferma e lo dice. Un avvio che fallisce con una
     * frase vale mezz'ora di un avvio che riesce a metà.
     */
    strictPort: true,
    // sempre lo stesso indirizzo, IPv4: «localhost» da solo può legarsi al solo
    // IPv6, e la finestra dell'app — che bussa a 127.0.0.1 — trova chiuso.
    host: '127.0.0.1',
    // niente `open`: apriva una scheda nuova del browser a ogni avvio. La
    // pagina è sempre la stessa, si aggiorna col ricarica e basta.
    proxy: { '/api': { target: 'http://127.0.0.1:5174', changeOrigin: true } }
  }
})
