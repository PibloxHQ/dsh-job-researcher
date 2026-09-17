import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('dsh-job-researcher manifest', () => {
  it('package.json declares dsh.bundle + client platform', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    assert.equal(pkg.name, 'dsh-job-researcher')
    assert.equal(pkg.type, 'module')
    assert.ok(pkg.dsh?.bundle?.patch)
    assert.equal(pkg.dsh?.client?.platform, 'web')
    assert.ok(pkg.exports?.['.'])
    assert.ok(pkg.exports?.['./client'])
  })

  it('cordis.patch.yml inserts matching id', () => {
    const yaml = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
    assert.match(yaml, /id:\s*dsh-job-researcher/)
    assert.match(yaml, /name:\s*'dsh-job-researcher'/)
  })

  it('host entry exports name + apply', async () => {
    const mod = await import(join(ROOT, 'src/index.js'))
    assert.equal(mod.name, 'dsh-job-researcher')
    assert.equal(typeof mod.apply, 'function')
    assert.deepEqual(mod.inject, ['secrets', 'timer'])
  })
})
