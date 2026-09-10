/** Live browser smoke; synthetic client signals never submit prompts or change Host sessions. */
import { chromium, expect } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const log = await readFile(process.env.DSH_LOG, 'utf8')
const token = [...log.matchAll(/\?token=([^\s]+)/g)].at(-1)?.[1]
if (!token) throw new Error('No login URL in DSH_LOG')
await mkdir('verification', { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 },
  permissions: ['notifications'], recordVideo: { dir: 'verification/video' } })
// Expose the plugin's existing callbacks only in this isolated browser response.
await context.route('**/plugins/**', async route => {
  if (new URL(route.request().url()).pathname === '/plugins/events') return route.continue()
  const response = await route.fetch()
  let body = await response.text()
  if (body.includes('dsh-notifications.sender.v1')) {
    assert.ok(body.includes('    const baseline = () => {'))
    body = body.replace('    const baseline = () => {',
      '    window.__notificationsQA = { tracker, ctx, browser };\n    const baseline = () => {')
    body = body.replace('      leader = true;', '      leader = true; window.__notificationsQALeader = true;')
  }
  await route.fulfill({ response, body })
})
await context.addInitScript(() => {
  window.__notice = []
  window.__notes = 0
  window.__permissionCalls = 0
  const Native = window.Notification
  window.Notification = new Proxy(Native, {
    construct(target, args) {
      const notification = Reflect.construct(target, args)
      window.__notice.push(notification)
      return notification
    },
    get(target, key) {
      if (key === 'permission') return Native.permission
      if (key === 'requestPermission') return (...args) => {
        window.__permissionCalls++
        return Native.requestPermission(...args)
      }
      return Reflect.get(target, key)
    },
  })
  const create = AudioContext.prototype.createOscillator
  AudioContext.prototype.createOscillator = function() {
    window.__notes++
    return create.call(this)
  }
})
const errors = []
context.on('page', page => {
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.text().includes('[dsh-notifications]')) console.log(message.text()) })
})
const page = await context.newPage()
try {
  await page.goto(`http://127.0.0.1:3080/?token=${encodeURIComponent(token)}`)
  await expect(page.getByRole('button', { name: 'Enable notifications', exact: true })).toBeVisible()
  assert.equal(await page.evaluate(() => window.__permissionCalls), 0)
  await page.screenshot({ path: 'verification/prompt.png' })
  await page.getByRole('button', { name: 'Enable notifications', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__notice.length)).toBe(1)
  assert.equal(await page.evaluate(() => window.__notes), 2)
  assert.equal(await page.evaluate(() => window.__permissionCalls), 1)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Test notification & chime' })).toBeVisible()
  await page.getByRole('button', { name: 'Test notification & chime' }).click()
  await expect.poll(() => page.evaluate(() => window.__notice.length)).toBe(2)
  await page.screenshot({ path: 'verification/settings.png' })
  const main = await page.evaluate(() => {
    const { ctx } = window.__notificationsQA
    return Object.values(ctx.sessions.list.getSnapshot().byId).find(row => !row.blank && row.origin !== 'subagent').id
  })
  await page.evaluate(id => {
    const { tracker } = window.__notificationsQA
    tracker.status(id, true); tracker.status(id, false); tracker.status(id, false)
  }, main)
  await expect.poll(() => page.evaluate(() => window.__notice.length)).toBe(3)
  const reasons = await page.evaluate(id => {
    const { ctx, tracker } = window.__notificationsQA
    const publish = ctx.uiSession.registerPendingInteraction(() => 1000)
    for (const kind of ['question', 'approval', 'plan-review']) {
      const remove = publish({ sessionId: id, key: `notifications-qa-${kind}`, kind }, async () => {})
      tracker.attention()
      tracker.status(id, true); tracker.status(id, false)
      remove()
    }
    return window.__notice.slice(-3).map(notice => notice.body)
  }, main)
  assert.equal(await page.evaluate(() => window.__notice.length), 6)
  assert.deepEqual(reasons, ['Question', 'Approval needed', 'Review plan'])
  await page.evaluate(() => window.__notice.at(-1).onclick())
  assert.equal(await page.evaluate(() => window.__notificationsQA.ctx.sessions.list.getSnapshot().current), main)
  // A second tab shares preferences but cannot duplicate event notifications.
  const second = await context.newPage()
  await second.goto('http://127.0.0.1:3080/')
  await second.waitForFunction(() => window.__notificationsQA?.ctx.sessions.list.getSnapshot().phase === 'ready')
  await second.evaluate(id => {
    const { tracker } = window.__notificationsQA
    tracker.status(id, true); tracker.status(id, false)
  }, main)
  assert.equal(await second.evaluate(() => window.__notice.length), 0)
  await page.close()
  await second.waitForFunction(() => window.__notificationsQALeader === true)
  await second.evaluate(id => {
    const { tracker } = window.__notificationsQA
    tracker.status(id, true); tracker.status(id, false)
  }, main)
  await expect.poll(() => second.evaluate(() => window.__notice.length)).toBe(1)
  await second.getByRole('button', { name: 'Settings', exact: true }).click()
  await second.getByRole('checkbox', { name: 'Play a sound' }).uncheck()
  await second.getByRole('button', { name: 'Disable notifications' }).click()
  await second.reload()
  await second.waitForFunction(() => window.__notificationsQA)
  assert.equal(await second.evaluate(() => window.__notificationsQA.browser.getSnapshot().enabled), false)
  assert.equal(await second.evaluate(() => window.__notificationsQA.browser.getSnapshot().sound), false)
  assert.deepEqual(errors, [])
  await writeFile('verification/browser-report.json', JSON.stringify({ passed: true, errors,
    checks: ['permission click', 'native Notification construction', 'real AudioContext notes', 'settings test',
      'completion deduplication', 'question/approval/plan review', 'click navigation',
      'two-tab suppression and takeover', 'mute/disable persistence'] }, null, 2))
  console.log('Browser QA passed: permissions, native notifications, audio, attention, navigation, multiple tabs, persistence; zero page errors.')
} catch (error) {
  if (!page.isClosed()) console.log(await page.evaluate(() => ({
    state: window.__notificationsQA?.browser.getSnapshot(), permission: Notification.permission,
    calls: window.__permissionCalls, notes: window.__notes, errors: document.body.innerText.slice(-1200),
  })))
  throw error
} finally {
  await context.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
  await browser.close()
}
