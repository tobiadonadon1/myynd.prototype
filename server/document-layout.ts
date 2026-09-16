import JSZip from 'jszip'

export type StileDocumento = { corpo?: string; titolo?: string; dimensione?: number; nome?: string; pagine?: number }
export type BloccoDocumento = { tipo: 'title' | 'subtitle' | 'heading' | 'body'; testo: string }
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const normale = (s: string) => s.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()

/** Content structure remains editable; typography is not painted into an image. */
export function strutturaDocumento(titolo: string, testo: string): BloccoDocumento[] {
  const righe = testo.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(normale).filter(Boolean)
  const baseTitle = (s: string) => normale(s).toLowerCase().replace(/\s*[—–,:-]\s*(?:revised|revision|updated|revisione|rivisto|aggiornato)(?:\s+\d+)?$/i, '').trim()
  if (righe[0] && baseTitle(righe[0]) === baseTitle(titolo)) righe.shift()
  const blocchi: BloccoDocumento[] = [{ tipo: 'title', testo: titolo.trim() }]
  for (const riga of righe) {
    const breve = riga.length < 100 && riga.split(/\s+/).length <= 12 && !/[.!?;:]$/.test(riga) && !riga.includes('\n')
    blocchi.push({ tipo: breve ? (blocchi.length === 1 ? 'subtitle' : 'heading') : 'body', testo: riga })
  }
  return blocchi
}

export async function documentoImpaginato(titolo: string, testo: string, stile: StileDocumento = {}): Promise<Buffer> {
  const z = new JSZip()
  const font = (s: string | undefined, base: string) => s && s.length <= 80 && !/[<>\x00-\x1f]/.test(s) ? s : base
  const corpo = xml(font(stile.corpo, 'Georgia'))
  const titoloFont = xml(font(stile.titolo, 'Georgia'))
  const size = Math.round(Math.max(11, Math.min(12, stile.dimensione ?? 11.5)) * 2)
  const run = (fontName: string, size: number, bold = false, color = '202124') => `<w:rPr><w:rFonts w:ascii="${fontName}" w:hAnsi="${fontName}" w:cs="${fontName}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color}"/>${bold ? '<w:b/>' : ''}</w:rPr>`
  const styles = `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault>${run(corpo,size)}</w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="324" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="324" w:lineRule="auto"/><w:widowControl/></w:pPr>${run(corpo,size)}</w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="0" w:after="260" w:line="270" w:lineRule="auto"/></w:pPr>${run(titoloFont,46,true,'000000')}</w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="240"/></w:pPr>${run(corpo,25,false,'000000')}</w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/><w:spacing w:before="260" w:after="100"/></w:pPr>${run(corpo,25,true,'000000')}</w:style></w:styles>`
  const blocks = strutturaDocumento(titolo,testo)
  // Balance an explicitly requested short document at paragraph boundaries.
  // The actual Pages export is still checked; this estimate never claims a page count.
  const breaks = new Set<number>()
  if (stile.pagine === 2 && blocks.length >= 6) {
    const heights = blocks.map(b => b.tipo === 'title' ? Math.ceil(b.testo.length / 44) * 28 + 18 : b.tipo === 'heading' ? 32 : b.tipo === 'subtitle' ? 32 : Math.ceil(b.testo.length / 86) * 15 + 8)
    const total = heights.reduce((a,b)=>a+b,0)
    let before=0, best=-1, distance=Infinity
    for(let i=0;i<blocks.length;i++) {
      if(i>=3 && i<blocks.length-1 && blocks[i-1].tipo==='body') {
        const score=Math.abs(before-total/2)
        if(score<distance){distance=score;best=i}
      }
      before+=heights[i]
    }
    if(best>=0)breaks.add(best)
  }
  const body = blocks.map((b,index) => {
    const style = {title:'Title',subtitle:'Subtitle',heading:'Heading1',body:'Normal'}[b.tipo]
    return `<w:p><w:pPr>${breaks.has(index) ? '<w:pageBreakBefore/>' : ''}<w:pStyle w:val="${style}"/>${b.tipo === 'body' ? '<w:keepLines/>' : ''}</w:pPr><w:r>${b.testo.split('\n').map(s=>`<w:t xml:space="preserve">${xml(s)}</w:t>`).join('<w:br/>')}</w:r></w:p>`
  }).join('')
  z.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>')
  z.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  z.file('word/_rels/document.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="footer" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>')
  z.file('word/styles.xml',styles)
  z.file('word/footer1.xml',`<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r>${run(corpo,17,false,'666666')}<w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`)
  z.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1200" w:right="1320" w:bottom="1200" w:left="1320" w:header="480" w:footer="560"/></w:sectPr></w:body></w:document>`)
  return z.generateAsync({type:'nodebuffer',compression:'DEFLATE'})
}
