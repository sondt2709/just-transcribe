// Pure overlay geometry. No Electron import, so `node --test` can run it.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayInfo {
  id: number
  workArea: Rect
}

export interface SavedPlacement {
  displayId: number
  fx: number
  fy: number
  width: number
  height: number
}

export interface ResolveInput {
  saved: SavedPlacement | null
  displays: DisplayInfo[]
  primaryId: number
  position: string
}

const OVERLAY_WIDTH_RATIO = 0.3
const OVERLAY_HEIGHT_RATIO = 0.5

export function calculateOverlayBounds(position: string, workArea: Rect): Rect {
  const { x: ox, y: oy, width: sw, height: sh } = workArea
  const w = Math.round(sw * OVERLAY_WIDTH_RATIO)
  const h = Math.round(sh * OVERLAY_HEIGHT_RATIO)

  const col = position.includes('left') ? 0 : position.includes('right') ? 2 : 1
  const row = position.includes('top') ? 0 : position.includes('bottom') || position.startsWith('bot') ? 2 : 1

  const margin = 20
  const xPositions = [ox + margin, ox + Math.round((sw - w) / 2), ox + sw - w - margin]
  const yPositions = [oy + margin, oy + Math.round((sh - h) / 2), oy + sh - h - margin]

  return { x: xPositions[col], y: yPositions[row], width: w, height: h }
}

function primaryOf(displays: DisplayInfo[], primaryId: number): DisplayInfo {
  return displays.find((d) => d.id === primaryId) ?? displays[0]
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi)
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** The display that holds most of `bounds`; the nearest display when none overlaps. */
export function displayForBounds(bounds: Rect, displays: DisplayInfo[], primaryId: number): DisplayInfo {
  let best: DisplayInfo | null = null
  let bestArea = 0
  for (const d of displays) {
    const area = overlapArea(bounds, d.workArea)
    if (area > bestArea) {
      best = d
      bestArea = area
    }
  }
  if (best) return best

  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  let nearest = primaryOf(displays, primaryId)
  let nearestDist = Infinity
  for (const d of displays) {
    const wa = d.workArea
    const dx = cx - clamp(cx, wa.x, wa.x + wa.width)
    const dy = cy - clamp(cy, wa.y, wa.y + wa.height)
    const dist = dx * dx + dy * dy
    if (dist < nearestDist) {
      nearest = d
      nearestDist = dist
    }
  }
  return nearest
}

/** Placement as fractions of the free space in the display work area. */
export function placementFromBounds(bounds: Rect, display: DisplayInfo): SavedPlacement {
  const wa = display.workArea
  const width = clamp(Math.round(bounds.width), 1, wa.width)
  const height = clamp(Math.round(bounds.height), 1, wa.height)
  const freeX = wa.width - width
  const freeY = wa.height - height
  return {
    displayId: display.id,
    fx: freeX > 0 ? clamp((bounds.x - wa.x) / freeX, 0, 1) : 0,
    fy: freeY > 0 ? clamp((bounds.y - wa.y) / freeY, 0, 1) : 0,
    width,
    height
  }
}

/** Bounds for a placement inside a work area. The result always fits the work area. */
export function boundsFromPlacement(p: SavedPlacement, wa: Rect): Rect {
  const width = clamp(Math.round(p.width), 1, wa.width)
  const height = clamp(Math.round(p.height), 1, wa.height)
  return {
    x: wa.x + Math.round(clamp(p.fx, 0, 1) * (wa.width - width)),
    y: wa.y + Math.round(clamp(p.fy, 0, 1) * (wa.height - height)),
    width,
    height
  }
}

/**
 * Bounds for the overlay window from the saved placement and the current displays.
 * The saved display wins when it is connected; otherwise the primary display is used.
 * Without a saved placement, the grid position on the primary display is used.
 */
export function resolveOverlayBounds(input: ResolveInput): Rect {
  const primary = primaryOf(input.displays, input.primaryId)
  if (!input.saved) return calculateOverlayBounds(input.position, primary.workArea)
  const target = input.displays.find((d) => d.id === input.saved!.displayId) ?? primary
  return boundsFromPlacement(input.saved, target.workArea)
}

/** Bounds for a grid pick in Settings, on the display that holds the overlay now. */
export function gridBoundsForOverlay(
  position: string,
  current: Rect,
  displays: DisplayInfo[],
  primaryId: number
): Rect {
  return calculateOverlayBounds(position, displayForBounds(current, displays, primaryId).workArea)
}

/** Parse the `overlay_display_id` and `overlay_bounds` config strings. */
export function parsePlacement(displayId: string | undefined, bounds: string | undefined): SavedPlacement | null {
  if (!displayId || !bounds) return null
  const id = Number(displayId)
  const parts = bounds.split(',').map((v) => Number(v.trim()))
  if (!Number.isInteger(id) || parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return null
  const [fx, fy, width, height] = parts
  if (width <= 0 || height <= 0) return null
  return { displayId: id, fx: clamp(fx, 0, 1), fy: clamp(fy, 0, 1), width, height }
}

export function serializePlacement(p: SavedPlacement): { overlay_display_id: string; overlay_bounds: string } {
  const f = (v: number): string => String(Math.round(v * 1e6) / 1e6)
  return {
    overlay_display_id: String(p.displayId),
    overlay_bounds: `${f(p.fx)},${f(p.fy)},${Math.round(p.width)},${Math.round(p.height)}`
  }
}
