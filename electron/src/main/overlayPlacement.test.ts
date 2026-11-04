import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateOverlayBounds,
  resolveOverlayBounds,
  gridBoundsForOverlay,
  displayForBounds,
  placementFromBounds,
  parsePlacement,
  serializePlacement,
  type DisplayInfo,
  type Rect
} from './overlayPlacement.ts'

// Work areas copied from a real `screen.getAllDisplays()` on a two-monitor Mac:
// built-in Retina (primary) and a 2560x1440 external monitor above it.
const LAPTOP: DisplayInfo = { id: 1, workArea: { x: 0, y: 33, width: 1512, height: 870 } }
const EXTERNAL: DisplayInfo = { id: 3, workArea: { x: -509, y: -1410, width: 2560, height: 1410 } }

function assertInside(r: Rect, wa: Rect): void {
  assert.ok(r.x >= wa.x && r.y >= wa.y, `top-left ${r.x},${r.y} outside ${JSON.stringify(wa)}`)
  assert.ok(
    r.x + r.width <= wa.x + wa.width && r.y + r.height <= wa.y + wa.height,
    `bottom-right outside ${JSON.stringify(wa)}: ${JSON.stringify(r)}`
  )
}

test('no saved placement: grid position on the primary display', () => {
  const r = resolveOverlayBounds({ saved: null, displays: [LAPTOP, EXTERNAL], primaryId: 1, position: 'bottom-center' })
  assert.deepEqual(r, { x: 529, y: 448, width: 454, height: 435 })
})

test('saved placement on the external display: restored on the external display', () => {
  const r = resolveOverlayBounds({
    saved: { displayId: 3, fx: 0.5, fy: 0.5, width: 454, height: 433 },
    displays: [LAPTOP, EXTERNAL],
    primaryId: 1,
    position: 'bottom-center'
  })
  assert.deepEqual(r, { x: 544, y: -921, width: 454, height: 433 })
})

test('saved display unplugged: same relative position on the primary display, fully inside', () => {
  const r = resolveOverlayBounds({
    saved: { displayId: 3, fx: 1, fy: 1, width: 800, height: 600 },
    displays: [LAPTOP],
    primaryId: 1,
    position: 'bottom-center'
  })
  assert.deepEqual(r, { x: 712, y: 303, width: 800, height: 600 })
  assertInside(r, LAPTOP.workArea)
})

test('saved size larger than the target work area: size is clamped', () => {
  const r = resolveOverlayBounds({
    saved: { displayId: 3, fx: 0.2, fy: 0.7, width: 2000, height: 1200 },
    displays: [LAPTOP],
    primaryId: 1,
    position: 'bottom-center'
  })
  assert.deepEqual(r, { x: 0, y: 33, width: 1512, height: 870 })
})

test('work area shrinks (dock shown): overlay stays inside', () => {
  const shrunk: DisplayInfo = { id: 1, workArea: { x: 0, y: 33, width: 1512, height: 700 } }
  const r = resolveOverlayBounds({
    saved: { displayId: 1, fx: 1, fy: 1, width: 454, height: 435 },
    displays: [shrunk],
    primaryId: 1,
    position: 'bottom-center'
  })
  assertInside(r, shrunk.workArea)
  assert.equal(r.y + r.height, 733)
})

test('grid pick while the overlay is on the external display: grid of the external display', () => {
  const current = { x: 1000, y: -700, width: 454, height: 433 }
  const r = gridBoundsForOverlay('bottom-right', current, [LAPTOP, EXTERNAL], 1)
  assert.deepEqual(r, calculateOverlayBounds('bottom-right', EXTERNAL.workArea))
  assertInside(r, EXTERNAL.workArea)
})

test('drag to the external display, save, restore: same bounds', () => {
  const dragged = { x: 1000, y: -700, width: 454, height: 433 }
  const display = displayForBounds(dragged, [LAPTOP, EXTERNAL], 1)
  assert.equal(display.id, 3)
  const cfg = serializePlacement(placementFromBounds(dragged, display))
  const saved = parsePlacement(cfg.overlay_display_id, cfg.overlay_bounds)
  const r = resolveOverlayBounds({ saved, displays: [LAPTOP, EXTERNAL], primaryId: 1, position: 'bottom-center' })
  assert.deepEqual(r, dragged)
})

test('bounds off every display: nearest display is used', () => {
  const offscreen = { x: 1700, y: 500, width: 400, height: 300 }
  assert.equal(displayForBounds(offscreen, [LAPTOP, EXTERNAL], 1).id, 1)
})

test('bad config strings: no placement', () => {
  assert.equal(parsePlacement(undefined, '0.5,0.5,400,300'), null)
  assert.equal(parsePlacement('3', undefined), null)
  assert.equal(parsePlacement('abc', '0.5,0.5,400,300'), null)
  assert.equal(parsePlacement('3', '0.5,0.5,400'), null)
  assert.equal(parsePlacement('3', '0.5,x,400,300'), null)
  assert.equal(parsePlacement('3', '0.5,0.5,0,300'), null)
})
