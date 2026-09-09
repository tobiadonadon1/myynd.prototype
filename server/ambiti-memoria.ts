/** I nomi sono entità: Acme non è AcmeCloud, né Rossi è Rossini. */
export function nomeNormalizzato(testo: string): string {
  return (testo.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []).join(' ')
}

export function nominaAmbito(testo: string, nome: string): boolean {
  const entita = nomeNormalizzato(nome)
  if (entita.replace(/ /g, '').length < 3) return false
  return ` ${nomeNormalizzato(testo)} `.includes(` ${entita} `)
}
