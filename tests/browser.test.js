import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBrowser } from '../src/browser.js'

function setup({ permission = 'default', stored, locks, blockedStorage = false } = {}) {
  const win = new EventTarget()
  const shown = []
  const notes = []
  const calls = []
  let saved = stored
  let audio
  class Notification {
    static permission = permission
    static async requestPermission() { calls.push('permission'); return this.permission }
    constructor(title, options) { this.title = title; this.options = options; shown.push(this) }
    close() { this.onclose?.() }
  }
  class AudioContext {
    state = 'suspended'
    currentTime = 0
    destination = {}
    constructor() { audio = this }
    async resume() { calls.push('audio'); this.state = 'running' }
    async close() { this.state = 'closed' }
    createOscillator() {
      const node = { frequency: {}, connect() {}, disconnect() {}, start() { notes.push(node.frequency.value) }, stop() {} }
      return node
    }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} } }
  }
  Object.assign(win, { Notification, AudioContext, isSecureContext: true, navigator: { locks },
    focus() { calls.push('focus') },
    localStorage: { getItem() { return saved }, setItem(key, value) {
      if (blockedStorage) throw new Error('disabled')
      saved = value
    } },
  })
  const browser = createBrowser({ win, t: key => key, open: id => calls.push(id) })
  return { browser, win, shown, notes, calls, audio: () => audio }
}

test('permission is requested only by enable; denied permission never produces a notification', async () => {
  const { browser, shown, calls } = setup({ permission: 'denied' })
  assert.deepEqual(calls, [])
  browser.notify({ kind: 'complete' })
  await browser.enable()
  assert.equal(shown.length, 0)
  assert.deepEqual(calls, ['audio', 'permission'])
  assert.equal(browser.getSnapshot().enabled, false)
  browser.dispose()
})

test('enable plays a two-note test, click opens the thread, mute and disable take effect', async () => {
  const { browser, shown, notes, calls, audio } = setup({ permission: 'granted' })
  await browser.enable()
  assert.equal(shown.length, 1)
  assert.deepEqual(notes, [659.25, 880])
  browser.notify({ kind: 'attention', reason: 'question', sessionId: 'main', title: 'Work' })
  assert.equal(shown[1].options.requireInteraction, true)
  shown[1].onclick()
  assert.deepEqual(calls.slice(-2), ['focus', 'main'])
  browser.sound(false)
  browser.notify({ kind: 'complete', sessionId: 'main' })
  assert.equal(notes.length, 4)
  browser.disable()
  browser.notify({ kind: 'complete' })
  assert.equal(shown.length, 3)
  browser.dispose()
  assert.equal(audio().state, 'closed')
  await browser.test()
  assert.equal(shown.length, 3)
})

test('stored opt-out, malformed values and unavailable storage remain usable', async () => {
  const { browser, shown } = setup({ permission: 'granted', stored: '{broken', blockedStorage: true })
  assert.equal(browser.getSnapshot().enabled, false)
  await browser.enable()
  assert.equal(shown.length, 1)
  browser.dispose()
  const second = setup({ stored: JSON.stringify({ enabled: 'yes', sound: false, dismissed: true }) })
  assert.equal(second.browser.getSnapshot().enabled, false)
  assert.equal(second.browser.getSnapshot().dismissed, true)
  second.browser.dispose()
})

test('unsupported browser never prompts', async () => {
  const { browser, win, calls } = setup()
  win.isSecureContext = false
  await browser.enable()
  assert.equal(browser.getSnapshot().permission, 'unsupported')
  assert.deepEqual(calls, [])
  browser.dispose()
})

test('notification title contains only the project and body contains a compact question preview', async () => {
  const { browser, shown } = setup({ permission: 'granted' })
  await browser.enable()
  browser.notify({ kind: 'attention', title: 'my-project', question: 'Which branch\n  should I use?' })
  assert.equal(shown.at(-1).title, 'my-project')
  assert.equal(shown.at(-1).options.body, 'Which branch should I use?')
  browser.notify({ kind: 'attention', title: 'my-project', question: 'x'.repeat(200) })
  assert.equal(shown.at(-1).options.body.length, 180)
  assert.ok(shown.at(-1).options.body.endsWith('…'))
  browser.dispose()
})

test('desktop delivery is reported separately from chime and every test creates a fresh alert', async () => {
  const { browser, shown, notes } = setup({ permission: 'granted' })
  await browser.enable()
  assert.equal(browser.getSnapshot().delivery, 'deliveryPending')
  assert.equal(notes.length, 2)
  shown[0].onshow()
  assert.equal(browser.getSnapshot().delivery, 'deliveryShown')
  await browser.test()
  assert.equal(shown[1].options.tag, undefined)
  assert.equal(shown[1].options.requireInteraction, true)
  shown[0].onshow()
  assert.equal(browser.getSnapshot().delivery, 'deliveryPending')
  const warn = console.warn
  console.warn = () => {}
  try { shown[1].onerror() } finally { console.warn = warn }
  assert.equal(browser.getSnapshot().delivery, 'deliveryFailed')
  assert.equal(browser.getSnapshot().error, 'failed')
  assert.equal(notes.length, 4)
  browser.dispose()
  shown[1].onshow()
  assert.equal(browser.getSnapshot().delivery, 'deliveryFailed')
})

test('a waiting tab does not send events and disposal while permission is pending cannot notify', async () => {
  const locks = { request: () => new Promise(() => {}) }
  const { browser, shown, win } = setup({ permission: 'granted', locks })
  await browser.enable()
  browser.notify({ kind: 'complete' })
  assert.equal(shown.length, 1) // Explicit test bypasses leader election.
  let resolve
  win.Notification.requestPermission = () => new Promise(done => { resolve = done })
  const pending = browser.enable()
  browser.dispose()
  resolve('granted')
  await pending
  assert.equal(shown.length, 1)
})
