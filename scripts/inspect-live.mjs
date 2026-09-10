import { chromium } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'

const log = await readFile(process.env.DSH_LOG, 'utf8')
const token = [...log.matchAll(/\?token=([^\s]+)/g)].at(-1)?.[1]
if (!token) throw new Error('No login URL in DSH_LOG')
await mkdir('verification', { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.goto(`http://127.0.0.1:3080/?token=${encodeURIComponent(token)}`)
await page.waitForTimeout(6000)
const label = process.argv[2] || 'inspect'
await page.screenshot({ path: `verification/${label}.png` })
const result = await page.evaluate(() => ({ text: document.body.innerText,
  globals: Object.keys(window).filter(key => /dsh|context|module/i.test(key)),
  boot: window.__DSH_BOOT__,
}))
await writeFile(`verification/${label}.json`, JSON.stringify({ errors, ...result }, null, 2))
console.log(JSON.stringify({ errors, text: result.text.slice(-3500), globals: result.globals,
  notificationsInBoot: JSON.stringify(result.boot).includes('dsh-notifications') }))
await browser.close()
