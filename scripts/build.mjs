#!/usr/bin/env node
/**
 * Build orchestrator. Produces:
 *
 *   dist/index.{js,cjs,d.ts}                   ESM/CJS for npm consumers
 *   dist/react/index.{js,cjs,d.ts}             React adapter
 *   dist/vue/index.{js,cjs,d.ts}               Vue adapter
 *   dist/svelte/index.{js,cjs,d.ts}            Svelte adapter
 *   dist/web-components/index.{js,cjs,d.ts}    Web components (auto-register)
 *   dist/web-components/manual.{js,cjs,d.ts}   Web components (no auto-register)
 *   dist/providers/{google,apple,tiktok,supabase}.{js,cjs,d.ts}
 *   dist/umd/despia-oauth.min.js               Main UMD (window.DespiaOAuth)
 *   dist/umd/web-components.min.js             Web components UMD
 */
import { execSync } from 'node:child_process'
import { renameSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const umdDir = join(root, 'dist', 'umd')

function run(cmd) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, {
    stdio: 'inherit',
    env: { ...process.env, PATH: `${process.cwd()}/node_modules/.bin:${process.env.PATH}` },
  })
}

// 1. ESM + CJS build (clean: true wipes dist first)
run('npx tsup')

// 2. Main UMD bundle
if (existsSync(umdDir)) rmSync(umdDir, { recursive: true })
mkdirSync(umdDir, { recursive: true })
run(
  'npx tsup src/umd.ts --format iife --global-name DespiaOAuth ' +
    '--minify --out-dir dist/umd --no-dts --no-clean',
)
// Rename umd.global.js → despia-oauth.min.js (matches package.json `unpkg`/`jsdelivr`)
const renames = [
  ['umd.global.js', 'despia-oauth.min.js'],
  ['umd.global.js.map', 'despia-oauth.min.js.map'],
]
for (const [from, to] of renames) {
  const src = join(umdDir, from)
  const dst = join(umdDir, to)
  if (existsSync(src)) renameSync(src, dst)
}

// 3. Web components UMD bundle
run(
  'npx tsup src/umd-web-components.ts --format iife --global-name DespiaOAuthWebComponents ' +
    '--minify --out-dir dist/umd --no-dts --no-clean',
)
const wcRenames = [
  ['umd-web-components.global.js', 'web-components.min.js'],
  ['umd-web-components.global.js.map', 'web-components.min.js.map'],
]
for (const [from, to] of wcRenames) {
  const src = join(umdDir, from)
  const dst = join(umdDir, to)
  if (existsSync(src)) renameSync(src, dst)
}

console.log('\n✓ Build complete')
console.log(`  ESM:               dist/index.js`)
console.log(`  CJS:               dist/index.cjs`)
console.log(`  Types:             dist/index.d.ts`)
console.log(`  UMD (main):        dist/umd/despia-oauth.min.js (window.DespiaOAuth)`)
console.log(`  UMD (web cmpts):   dist/umd/web-components.min.js`)
