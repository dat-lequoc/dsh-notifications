import { build } from 'esbuild'
import { mkdir, copyFile } from 'node:fs/promises'

await mkdir('lib', { recursive: true })
await copyFile('src/index.js', 'lib/index.js')
await build({
  entryPoints: ['src/client.jsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  external: ['react'],
  target: ['es2022'],
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-notifications",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
})
