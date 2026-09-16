import {test} from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {documentoImpaginato,strutturaDocumento} from './document-layout.ts'

test('editable document has actual hierarchy, safe XML, whitespace and pagination rules',async()=>{
 const body='The subject\n\nA useful hypothesis\n\nAn introduction with enough context for the reader.\n\nA practical approach\n\nThis paragraph contains <markup> & is still plain text.'
 const blocks=strutturaDocumento('The subject',body)
 assert.deepEqual(blocks.map(b=>b.tipo),['title','subtitle','body','heading','body'])
 const z=await JSZip.loadAsync(await documentoImpaginato('The subject',body))
 const xml=await z.file('word/document.xml')!.async('string')
 const styles=await z.file('word/styles.xml')!.async('string')
 assert.equal((xml.match(/The subject/g)||[]).length,1)
 assert.match(xml,/&lt;markup&gt; &amp;/)
 assert.match(styles,/w:keepNext/);assert.match(styles,/w:widowControl/)
 assert.match(styles,/w:line="324"/);assert.match(styles,/Georgia/)
 assert.match(xml,/w:pgMar/);assert.match(xml,/footerReference/)
 assert.doesNotMatch(styles,/w:pBdr/)
})


test('a revised title does not repeat the previous title as a subtitle', async () => {
  const blocks = strutturaDocumento('My Essay — Revised','My Essay\n\nA complete first paragraph that explains the thesis.')
  assert.equal(blocks.length,2)
  assert.equal(blocks[1].tipo,'body')
  const zip=await JSZip.loadAsync(await documentoImpaginato('My Essay — Revised','My Essay\n\nA complete first paragraph that explains the thesis.'))
  const xml=await zip.file('word/document.xml')!.async('string')
  assert.match(xml,/<w:pStyle w:val="Normal"\/><w:keepLines\/>/)
})


test('an explicit two-page brief balances at a paragraph boundary without splitting a heading',async()=>{
 const body=Array.from({length:10},(_,i)=>`Section ${i}\n\n`+'This is a complete sentence explaining the subject. '.repeat(5)).join('\n\n')
 const zip=await JSZip.loadAsync(await documentoImpaginato('Balanced essay',body,{pagine:2}))
 const xml=await zip.file('word/document.xml')!.async('string')
 assert.equal((xml.match(/<w:pageBreakBefore\/>/g)||[]).length,1)
 const normal=await JSZip.loadAsync(await documentoImpaginato('Balanced essay',body))
 assert.equal((await normal.file('word/document.xml')!.async('string')).includes('<w:pageBreakBefore/>'),false)
})


test('comma-separated revision suffix does not duplicate the title', () => {
 const blocks=strutturaDocumento('My Essay, Revised','My Essay\n\nA complete opening paragraph explaining the subject.');
 assert.equal(blocks.length,2);assert.equal(blocks[1].tipo,'body');
});
