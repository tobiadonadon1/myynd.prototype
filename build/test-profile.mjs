// Every Node test worker starts with a private data directory before imports.
// A test may replace it with its own fixture, but never inherits a real profile.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'myynd-test-worker-'))
process.env.MYYND_DATI = profile
process.once('exit', () => rmSync(profile, { recursive: true, force: true }))
