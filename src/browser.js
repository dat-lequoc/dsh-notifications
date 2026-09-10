const KEY = 'dsh-notifications.preferences.v1'
const DEFAULTS = { enabled: false, sound: true, dismissed: false }

/** Browser permission, audio and preference lifetime, shared by both UI seats. */
export function createBrowser({ win, t, open }) {
  let prefs = read()
  let audio
  let disposed = false
  let leader = !win.navigator.locks
  let releaseLeader
  const abort = new AbortController()
  const listeners = new Set()
  const notifications = new Set()
  let snapshot
  let error = ''
  let delivery = ''
  let latestNotification

  function read() {
    try {
      const stored = JSON.parse(win.localStorage.getItem(KEY))
      return Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) =>
        [key, typeof stored?.[key] === 'boolean' ? stored[key] : value]))
    } catch { return { ...DEFAULTS } } // Restricted storage or invalid saved JSON.
  }
  function permission() {
    return win.isSecureContext && win.Notification ? win.Notification.permission : 'unsupported'
  }
  function publish() {
    if (disposed) return
    snapshot = { ...prefs, permission: permission(), audioReady: audio?.state === 'running', error, delivery }
    for (const listener of listeners) listener()
  }
  function save(patch) {
    prefs = { ...prefs, ...patch }
    try { win.localStorage.setItem(KEY, JSON.stringify(prefs)) }
    catch { /* Browser storage can be disabled; preferences still work for this tab. */ }
    publish()
  }
  function report(key, cause) {
    if (disposed) return
    error = key
    console.warn('[dsh-notifications]', key, cause)
    publish()
  }
  function unlock() {
    if (disposed || !prefs.sound) return Promise.resolve()
    try {
      const Audio = win.AudioContext || win.webkitAudioContext
      if (!Audio) return Promise.resolve()
      audio ??= new Audio()
      audio.onstatechange = publish
      return audio.resume().then(publish).catch(cause => report('soundFailed', cause))
    } catch (cause) {
      report('soundFailed', cause)
      return Promise.resolve()
    }
  }
  function chime() {
    if (!prefs.sound || audio?.state !== 'running') return
    // Two short sine notes with attack/decay envelopes avoid clicks.
    for (const [offset, frequency] of [[0, 659.25], [0.17, 880]]) {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      const start = audio.currentTime + offset
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.13, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32)
      oscillator.connect(gain)
      gain.connect(audio.destination)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
      oscillator.start(start)
      oscillator.stop(start + 0.35)
    }
  }
  function notify(event, test = false) {
    if (disposed || !prefs.enabled || permission() !== 'granted' || (!test && !leader)) return
    const title = test ? t('testTitle') : event.title || t('projectFallback')
    const detail = test ? t('testBody') : event.kind === 'complete' ? t('finished')
      : event.question || t(['question', 'approval', 'plan-review'].includes(event.reason) ? event.reason : 'generic')
    const compact = detail.replace(/\s+/g, ' ').trim()
    const characters = Array.from(compact)
    const body = characters.length > 180 ? `${characters.slice(0, 179).join('')}…` : compact
    delivery = 'deliveryPending'
    latestNotification = undefined
    publish()
    try {
      const notification = new win.Notification(title, {
        body,
        // Each occurrence gets a new banner rather than silently replacing a
        // previous notification. The tracker already deduplicates live events.
        silent: true,
        requireInteraction: test || event.kind === 'attention',
      })
      latestNotification = notification
      notifications.add(notification)
      notification.onshow = () => {
        if (disposed || latestNotification !== notification) return
        delivery = 'deliveryShown'
        publish()
      }
      notification.onerror = () => {
        notifications.delete(notification)
        if (disposed || latestNotification !== notification) return
        delivery = 'deliveryFailed'
        report('failed', 'The desktop notification emitted an error event.')
      }
      notification.onclose = () => notifications.delete(notification)
      notification.onclick = () => {
        notification.close()
        if (disposed) return
        win.focus()
        if (event.sessionId) open(event.sessionId)
      }
    } catch (cause) { delivery = 'deliveryFailed'; report('failed', cause) }
    try { chime() } catch (cause) { report('soundFailed', cause) }
  }
  async function enable() {
    error = ''
    if (permission() === 'unsupported') { publish(); return }
    // Both privileged browser calls begin synchronously within the click.
    const soundReady = unlock()
    let allowed
    try { allowed = await win.Notification.requestPermission() }
    catch (cause) { report('failed', cause); return }
    if (disposed) return
    save({ enabled: allowed === 'granted', dismissed: allowed === 'granted' })
    await soundReady
    if (!disposed && allowed === 'granted') notify({}, true)
  }
  async function test() {
    error = ''
    await unlock()
    notify({}, true)
    publish()
  }
  const gesture = () => { if (prefs.enabled) void unlock() }
  const storage = event => { if (event.key === KEY || event.key === null) { prefs = read(); publish() } }
  win.addEventListener('pointerdown', gesture)
  win.addEventListener('keydown', gesture)
  win.addEventListener('storage', storage)
  win.addEventListener('focus', publish)
  // Exactly one live tab sends event alerts. Closing/unloading it releases the
  // browser-owned lock; the next waiting tab takes over without replaying events.
  if (win.navigator.locks) {
    void win.navigator.locks.request('dsh-notifications.sender.v1', { signal: abort.signal }, async () => {
      if (disposed) return
      leader = true
      await new Promise(resolve => { releaseLeader = resolve })
      leader = false
    }).catch(cause => { if (!disposed) report('failed', cause) })
  }
  publish()
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => snapshot,
    enable, test, notify,
    dismiss: () => save({ dismissed: true }),
    disable: () => save({ enabled: false, dismissed: true }),
    sound(value) { save({ sound: value }); if (value) void unlock() },
    dispose() {
      disposed = true
      abort.abort()
      releaseLeader?.()
      win.removeEventListener('pointerdown', gesture)
      win.removeEventListener('keydown', gesture)
      win.removeEventListener('storage', storage)
      win.removeEventListener('focus', publish)
      for (const notification of notifications) notification.close()
      notifications.clear()
      listeners.clear()
      if (audio) { audio.onstatechange = null; void audio.close().catch(() => {}) }
    },
  }
}
