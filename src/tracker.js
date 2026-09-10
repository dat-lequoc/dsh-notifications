/**
 * Observe live main-thread edges without treating an initial idle snapshot,
 * reconnect, history replay, or child-agent completion as a new completion.
 * Forks are independent threads: parentId alone does not imply a subagent.
 * @param {object} options - authoritative sources and notification sink.
 * @returns subscription callbacks; their lifetimes belong to the client plugin.
 */
export function createTracker({ row, isChild, pending, emit }) {
  const running = new Map()
  const questions = new Map()
  const project = entry => entry.cwd?.split(/[\\/]/).filter(Boolean).at(-1) || entry.displayTitle
  const main = id => {
    const entry = row(id)
    return entry && entry.origin !== 'subagent' && !isChild(id) ? entry : undefined
  }
  return {
    baseline(rows) {
      const ids = new Set(rows.map(entry => entry.id))
      for (const id of running.keys()) if (!ids.has(id)) running.delete(id)
      for (const entry of rows) {
        if (!running.has(entry.id)) running.set(entry.id, entry.running)
      }
    },
    status(id, active) {
      const previous = running.get(id)
      running.set(id, active)
      const entry = main(id)
      if (entry && previous === true && !active && !pending().has(id)) {
        emit({ kind: 'complete', sessionId: id, title: project(entry) })
      }
    },
    attention() {
      const current = pending()
      for (const id of questions.keys()) if (!current.has(id)) questions.delete(id)
      for (const [id, request] of current) {
        const entry = main(id)
        if (!entry || questions.get(id) === request.key) continue
        questions.set(id, request.key)
        const question = request.questions?.[0]?.question
        emit({ kind: 'attention', reason: request.kind, sessionId: id, title: project(entry),
          ...(question ? { question } : {}) })
      }
    },
    reset() { running.clear() },
    remove(id) { running.delete(id); questions.delete(id) },
  }
}
