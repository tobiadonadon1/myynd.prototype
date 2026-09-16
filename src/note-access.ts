import type {Stato} from './api.ts'
/** The Notes-specific current-process probe outranks the old generic folder
 * check. Missing archives and IO errors must never be called missing FDA. */
export function statoAccessoNote(stato:Pick<Stato,'accessoNote'|'accessoDisco'>):{problema:boolean;permessoNegato:boolean;messaggio:string|null} {
  const current=stato.accessoNote?.stato
  if(current==='leggibile'||current==='non-mac')return {problema:false,permessoNegato:false,messaggio:null}
  if(current==='assente')return {problema:true,permessoNegato:false,messaggio:'Non trovo le Note su questo Mac. Apri Note una volta e riprova.'}
  if(current==='errore')return {problema:true,permessoNegato:false,messaggio:'Non riesco a leggere le Note.'}
  if(current==='negato'||(!current&&stato.accessoDisco==='no'))return {problema:true,permessoNegato:true,messaggio:'La lettura è sospesa: manca l’accesso al disco.'}
  return {problema:false,permessoNegato:false,messaggio:null}
}
