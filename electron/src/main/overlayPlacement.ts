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

/** Bounds for the overlay window from the saved placement and the current displays. */
export function resolveOverlayBounds(input: ResolveInput): Rect {
  return calculateOverlayBounds(input.position, primaryOf(input.displays, input.primaryId).workArea)
}

/** Bounds for a grid pick in Settings, given where the overlay is now. */
export function gridBoundsForOverlay(
  position: string,
  _current: Rect,
  displays: DisplayInfo[],
  primaryId: number
): Rect {
  return calculateOverlayBounds(position, primaryOf(displays, primaryId).workArea)
}
