import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mailMessageLink} from './mail-link.ts'
test('Mail opening accepts only an individual message ID',()=>{
 assert.equal(mailMessageLink('message://%3Cmyynd-ab12%40draft.myynd.local%3E'),true)
 for(const x of ['message://compose?to=x@y.com','message:///etc/passwd','message://%3Cx%40y.com%3E?send=true','message://%0A%3Cx%40y.com%3E','message://%zz','file:///tmp/a','javascript:alert(1)',null])assert.equal(mailMessageLink(x),false)
})
