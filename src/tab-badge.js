/** Red favicon dot for unread thread events; restoring attention clears it. */
export function createTabBadge(win) {
  const doc = win.document
  let generation = 0
  let originals = []
  let owned
  let disposed = false
  let badgeUrl

  function clear() {
    generation++
    for (const { node, attributes } of originals) {
      // Do not overwrite a favicon another plugin changed in the meantime.
      if (node.getAttribute('href') !== badgeUrl) continue
      for (const [key, value] of Object.entries(attributes)) {
        if (value === null) node.removeAttribute(key)
        else node.setAttribute(key, value)
      }
    }
    originals = []
    owned?.remove()
    owned = undefined
    badgeUrl = undefined
  }

  function mark() {
    if (disposed || originals.length || owned) return
    const revision = ++generation
    const links = [...doc.querySelectorAll('link[rel~="icon"]')]
    const source = links.find(node => !node.media || win.matchMedia(node.media).matches)?.href
    originals = links.map(node => ({ node, attributes: {
      href: node.getAttribute('href'), type: node.getAttribute('type'), sizes: node.getAttribute('sizes'),
    } }))
    if (!links.length) {
      owned = doc.createElement('link')
      owned.rel = 'icon'
      doc.head.append(owned)
    }
    const canvas = doc.createElement('canvas')
    canvas.width = canvas.height = 32
    const context = canvas.getContext('2d')
    if (!context) { clear(); return }
    function paint(icon) {
      if (disposed || revision !== generation) return
      context.clearRect(0, 0, 32, 32)
      if (icon) context.drawImage(icon, 0, 0, 32, 32)
      context.beginPath()
      context.arc(24, 8, 7, 0, Math.PI * 2)
      context.fillStyle = '#ef233c'
      context.fill()
      context.strokeStyle = '#fff'
      context.lineWidth = 2
      context.stroke()
      badgeUrl = canvas.toDataURL('image/png')
      for (const node of owned ? [owned] : links) {
        node.href = badgeUrl
        node.type = 'image/png'
        node.setAttribute('sizes', '32x32')
      }
    }
    paint()
    // Draw the original icon under the dot when it finishes loading. A failed
    // or cross-origin icon keeps the dot; clearing fences out late image loads.
    if (source) {
      const icon = new win.Image()
      icon.crossOrigin = 'anonymous'
      icon.onload = () => {
        try { paint(icon) } catch { /* Canvas export can reject a cross-origin image. */ }
      }
      icon.src = source
    }
  }
  const visible = () => { if (doc.visibilityState === 'visible') clear() }
  win.addEventListener('focus', clear)
  win.addEventListener('pointerdown', clear)
  win.addEventListener('keydown', clear)
  doc.addEventListener('visibilitychange', visible)
  return {
    mark, clear,
    dispose() {
      disposed = true
      clear()
      win.removeEventListener('focus', clear)
      win.removeEventListener('pointerdown', clear)
      win.removeEventListener('keydown', clear)
      doc.removeEventListener('visibilitychange', visible)
    },
  }
}
