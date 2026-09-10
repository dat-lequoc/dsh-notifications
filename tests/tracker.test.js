import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTracker } from '../src/tracker.js'

function setup() {
  const rows = new Map([
    ['main', { id: 'main', running: false, displayTitle: 'Main' }],
    ['child', { id: 'child', running: false, origin: 'subagent', parentId: 'main' }],
    ['fork', { id: 'fork', running: false, parentId: 'main' }],
    ['addressed', { id: 'addressed', running: false }],
  ])
  const pending = new Map()
  const events = []
  const tracker = createTracker({ row: id => rows.get(id), isChild: id => id === 'addressed',
    pending: () => pending, emit: event => events.push(event) })
  tracker.baseline([...rows.values()])
  return { tracker, rows, pending, events }
}

test('initial idle, repeated stops, unknown sessions and both child representations stay silent', () => {
  const { tracker, events } = setup()
  tracker.status('main', false)
  for (const id of ['child', 'addressed', 'unknown']) {
    tracker.status(id, true); tracker.status(id, false)
  }
  assert.deepEqual(events, [])
  tracker.status('main', true); tracker.status('main', false); tracker.status('main', false)
  assert.deepEqual(events, [{ kind: 'complete', sessionId: 'main', title: 'Main' }])
})

test('forks and rapid consecutive main-thread runs each notify', () => {
  const { tracker, events } = setup()
  for (const id of ['fork', 'main', 'main']) {
    tracker.status(id, true); tracker.status(id, false)
  }
  assert.deepEqual(events.map(event => event.sessionId), ['fork', 'main', 'main'])
})

test('notifications use the project directory and include the first actual question', () => {
  const { tracker, rows, pending, events } = setup()
  rows.get('main').cwd = '/home/nightfury/dsh-plugins/'
  tracker.status('main', true); tracker.status('main', false)
  assert.equal(events[0].title, 'dsh-plugins')
  pending.set('main', { key: 'q', kind: 'question', questions: [
    { question: 'Which branch should I use?' }, { question: 'Should I deploy?' },
  ] })
  tracker.attention()
  assert.equal(events[1].title, 'dsh-plugins')
  assert.equal(events[1].question, 'Which branch should I use?')
})

test('an already-running baseline arms completion; reconnect itself does not notify', () => {
  const { tracker, rows, events } = setup()
  tracker.reset()
  tracker.baseline([{ ...rows.get('main'), running: true }])
  tracker.status('main', false)
  tracker.status('main', true)
  tracker.reset()
  tracker.baseline([...rows.values()])
  tracker.status('main', false)
  assert.equal(events.length, 1)
})

test('questions, approvals and plan reviews alert once per request and suppress the concurrent stop', () => {
  const { tracker, pending, events } = setup()
  tracker.status('main', true)
  for (const kind of ['question', 'approval', 'plan-review']) {
    pending.set('main', { key: kind, kind })
    tracker.attention(); tracker.attention()
  }
  tracker.status('main', false)
  assert.deepEqual(events.map(event => event.reason), ['question', 'approval', 'plan-review'])
  pending.clear(); tracker.attention()
  tracker.status('main', true); tracker.status('main', false)
  assert.equal(events.at(-1).kind, 'complete')
})

test('child questions stay silent and delayed main metadata resolves pending attention', () => {
  const { tracker, pending, rows, events } = setup()
  for (const id of ['child', 'addressed', 'new']) pending.set(id, { key: id, kind: 'question' })
  tracker.attention()
  assert.equal(events.length, 0)
  rows.set('new', { id: 'new', displayTitle: 'New' })
  tracker.attention()
  assert.equal(events.length, 1)
  tracker.remove('new')
  tracker.status('new', false)
  assert.equal(events.length, 1)
})
