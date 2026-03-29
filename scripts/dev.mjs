#!/usr/bin/env node

// Runs tsc --watch and auto-copies .js + .d.ts from dist/ to demo/lib/
// so the skill distribution stays in sync during development.

import { spawn } from 'child_process'
import { watch, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const LIB = join(ROOT, 'demo', 'lib')

if (!existsSync(LIB)) mkdirSync(LIB, { recursive: true })

// Start tsc --watch
const tsc = spawn('npx', ['tsc', '--watch', '--preserveWatchOutput'], {
  cwd: ROOT,
  stdio: 'inherit',
})

// Wait for dist/ to exist (first compile), then watch it
function startWatcher() {
  if (!existsSync(DIST)) {
    setTimeout(startWatcher, 500)
    return
  }

  watch(DIST, (_event, filename) => {
    if (!filename) return
    if (filename.endsWith('.js') || filename.endsWith('.d.ts')) {
      const src = join(DIST, filename)
      const dst = join(LIB, filename)
      try {
        copyFileSync(src, dst)
        console.log(`\x1b[36m[dev]\x1b[0m ${filename} -> demo/lib/`)
      } catch (err) {
        // File may be mid-write, ignore transient errors
      }
    }
  })

  console.log('\x1b[36m[dev]\x1b[0m Watching dist/ -> demo/lib/')
}

startWatcher()

tsc.on('exit', (code) => process.exit(code ?? 1))
process.on('SIGINT', () => { tsc.kill(); process.exit() })
process.on('SIGTERM', () => { tsc.kill(); process.exit() })
