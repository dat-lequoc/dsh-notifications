import React from 'react'
import { createTracker } from './tracker.js'
import { createBrowser } from './browser.js'
import { createTabBadge } from './tab-badge.js'
import { en, zh } from './locales.js'

const NS = 'dsh-notifications'
const card = {
  boxSizing: 'border-box',
  padding: 18, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12,
  color: 'var(--dsw-alias-label-primary, #202124)',
  background: 'var(--dsw-alias-bg-layer-2, #fff)',
  border: '1px solid var(--dsw-alias-border-l1, #d0d7de)', fontSize: 14,
}
const button = {
  borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1, #d0d7de)',
  padding: '8px 12px', background: 'transparent', color: 'inherit', cursor: 'pointer',
}

/** Same observable preferences in the first-run prompt and General settings. */
function Controls({ browser, t, prompt = false }) {
  const state = React.useSyncExternalStore(browser.subscribe, browser.getSnapshot)
  const [busy, setBusy] = React.useState(false)
  if (prompt && (state.dismissed || state.enabled || state.permission === 'unsupported')) return null
  const status = state.error || (state.permission === 'granted' ? state.enabled ? 'granted' : 'off' : state.permission)
  return <section aria-label={t('title')} style={prompt ? {
    ...card, position: 'fixed', bottom: 24, right: 24, width: 380,
    maxWidth: 'calc(100vw - 48px)', zIndex: 1000, boxShadow: '0 8px 32px #0003',
  } : card}>
    <strong style={{ fontSize: 16 }}>{t('title')}</strong>
    <div>{t('description')}</div>
    <div role="status" style={{ fontSize: 12 }}>{t(status)}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {(!state.enabled || state.permission !== 'granted')
        ? <button style={button} disabled={busy || state.permission === 'unsupported'} onClick={async () => {
          setBusy(true)
          try { await browser.enable() } finally { setBusy(false) }
        }}>{t('enable')}</button>
        : <>
          <button style={button} onClick={() => void browser.test()}>{t('test')}</button>
          <button style={button} onClick={browser.disable}>{t('disable')}</button>
        </>}
      {prompt && <button style={button} onClick={browser.dismiss}>{t('later')}</button>}
    </div>
    {!prompt && <>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={state.sound} onChange={event => browser.sound(event.target.checked)} />
        {t('sound')}
      </label>
      {state.enabled && state.sound && !state.audioReady && <div style={{ fontSize: 12 }}>{t('audio')}</div>}
      {state.enabled && state.delivery && <div role="status" style={{ fontSize: 12 }}>{t(state.delivery)}</div>}
      <div style={{ fontSize: 12, opacity: 0.75 }}>{t('note')}</div>
    </>}
  </section>
}

export const inject = ['sessions', 'uiSession', 'remote', 'slots', 'locale', 'layout']

/** Mount only browser-owned effects through Cordis so HMR disposes all resources. */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }))
  const t = ctx.locale.bind(NS)
  ctx.effect(() => {
    const badge = createTabBadge(window)
    const browser = createBrowser({ win: window, t, open: id => {
      if (!ctx.sessions.list.getSnapshot().byId[id]) return
      ctx.sessions.open(id)
      ctx.layout.selectPanel(null)
    } })
    const list = ctx.sessions.list
    const pending = ctx.uiSession.pendingInteractions
    const tracker = createTracker({
      row: id => list.getSnapshot().byId[id],
      isChild: id => Boolean(ctx.sessions.subagentAddress(id)),
      pending: () => pending.getSnapshot(),
      emit: event => { badge.mark(); browser.notify(event) },
    })
    const baseline = () => {
      const state = list.getSnapshot()
      if (state.phase === 'ready') tracker.baseline(Object.values(state.byId))
      tracker.attention()
    }
    const disposers = [
      list.subscribe(baseline),
      pending.subscribe(() => tracker.attention()),
      ctx.remote.$on('api-session/status', (id, active) => tracker.status(id, active)),
      ctx.remote.$on('api-session/removed', id => tracker.remove(id)),
      ctx.on('connection/reset', () => tracker.reset()),
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay', id: NS, order: 90, locale: NS,
        inject: () => ({ browser, prompt: true }),
      }, Controls)),
      ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item', id: NS, order: 90, locale: NS,
        inject: () => ({ browser }),
      }, Controls)),
    ]
    baseline()
    return () => { for (const dispose of disposers.reverse()) dispose(); browser.dispose(); badge.dispose() }
  })
}
