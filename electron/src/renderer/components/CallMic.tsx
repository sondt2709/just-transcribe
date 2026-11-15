import { useCallback, useEffect, useState } from 'react'

type DriverStatus = Awaited<ReturnType<typeof window.api.getDriverStatus>>

export const CALL_MIC_NAME = 'Just Transcribe Microphone'

export type CallMicMode = 'voice_and_translation' | 'translation_only'

export const MODE_LABELS: Record<CallMicMode, string> = {
  voice_and_translation: 'My voice + translation',
  translation_only: 'Translation only'
}

export interface CallMicStatus {
  state: 'off' | 'running' | 'no_device' | 'error'
  mode: CallMicMode
  device: string
  error: string
}

export async function fetchCallMicStatus(port: number): Promise<CallMicStatus | null> {
  try {
    return await (await fetch(`http://127.0.0.1:${port}/api/callmic/status`)).json()
  } catch {
    return null
  }
}

/** Bridge status, polled while mounted. */
export function useCallMicStatus(port: number | null, everyMs = 2000): [CallMicStatus | null, () => void] {
  const [status, setStatus] = useState<CallMicStatus | null>(null)
  const refresh = useCallback(() => {
    if (port) fetchCallMicStatus(port).then(setStatus)
  }, [port])
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, everyMs)
    return () => clearInterval(t)
  }, [refresh, everyMs])
  return [status, refresh]
}

type Action = 'install' | 'update' | 'remove'

const ACTION_LABELS: Record<Action, string> = { install: 'Install', update: 'Update', remove: 'Remove' }

/** Driver status with Install / Update / Remove. Each action asks first: Core Audio restarts. */
export function DriverControl({
  port,
  onChanged
}: {
  port: number | null
  onChanged?: (status: DriverStatus) => void
}): JSX.Element {
  const [driver, setDriver] = useState<DriverStatus | null>(null)
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    window.api.getDriverStatus().then(setDriver).catch(() => {})
  }, [])

  const run = async (action: Action): Promise<void> => {
    setConfirm(null)
    setBusy(true)
    setMessage(null)
    try {
      const res = action === 'remove' ? await window.api.removeDriver() : await window.api.installDriver()
      setDriver(res.status)
      if (res.cancelled) setMessage('Cancelled. Nothing changed.')
      else if (!res.ok) setMessage(res.error || 'Failed')
      // The backend's device list is stale after Core Audio restarts: let the bridge try again
      if (res.ok && port) await fetch(`http://127.0.0.1:${port}/api/callmic/restart`, { method: 'POST' }).catch(() => {})
      onChanged?.(res.status)
    } finally {
      setBusy(false)
    }
  }

  const state = driver?.state
  const label =
    state === 'installed'
      ? `Installed (${driver?.installed})`
      : state === 'update_available'
        ? `Update available (${driver?.installed} → ${driver?.bundled})`
        : state === 'not_installed'
          ? 'Not installed'
          : state === 'unavailable'
            ? 'Not in this build'
            : '…'

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className={`text-xs ${state === 'installed' ? 'text-green-400' : state === 'update_available' ? 'text-amber-300' : 'text-neutral-400'}`}
        >
          {label}
        </span>
        <span className="flex-1" />
        {busy ? (
          <span className="text-xs text-teal-400">Working… enter your password in the macOS prompt</span>
        ) : (
          <>
            {state === 'not_installed' && <DriverButton onClick={() => setConfirm('install')}>Install</DriverButton>}
            {state === 'update_available' && <DriverButton onClick={() => setConfirm('update')}>Update</DriverButton>}
            {(state === 'installed' || state === 'update_available') && (
              <DriverButton onClick={() => setConfirm('remove')} danger>
                Remove
              </DriverButton>
            )}
          </>
        )}
      </div>
      {confirm && (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-200 leading-relaxed">
            {ACTION_LABELS[confirm]} “{CALL_MIC_NAME}”? macOS asks for your administrator password, then restarts its audio
            system: <strong>all sound on this Mac stops for about 2 seconds, including a call in progress.</strong>
          </p>
          <div className="flex gap-2 mt-2">
            <DriverButton onClick={() => run(confirm)}>{ACTION_LABELS[confirm]}</DriverButton>
            <button onClick={() => setConfirm(null)} className="px-3 py-1 text-xs text-neutral-400 hover:text-neutral-200">
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && <p className="text-xs text-neutral-400 mt-1">{message}</p>}
    </div>
  )
}

function DriverButton({
  onClick,
  danger,
  children
}: {
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded border transition-colors ${
        danger
          ? 'bg-neutral-800 text-red-300 border-neutral-700 hover:bg-red-500/20'
          : 'bg-teal-500/20 text-teal-300 border-teal-500/30 hover:bg-teal-500/30'
      }`}
    >
      {children}
    </button>
  )
}

/** One line for the bridge state, or null when off. */
export function bridgeLine(status: CallMicStatus | null): { text: string; tone: 'ok' | 'warn' } | null {
  if (!status || status.state === 'off') return null
  if (status.state === 'running') return { text: `Sending to call: ${MODE_LABELS[status.mode]}`, tone: 'ok' }
  if (status.state === 'no_device') return { text: `Send to call is on, but “${CALL_MIC_NAME}” is not installed`, tone: 'warn' }
  return { text: `Send to call failed: ${status.error}`, tone: 'warn' }
}

/** Settings → Voice: the call microphone block. "Send to call" and the mode are saved with Save. */
export function CallMicSettings({
  port,
  enabled,
  mode,
  speakMic,
  onChange
}: {
  port: number | null
  enabled: boolean
  mode: CallMicMode
  speakMic: boolean
  onChange: (patch: { call_mic_enabled?: boolean; call_mic_mode?: CallMicMode }) => void
}): JSX.Element {
  const [status, refresh] = useCallMicStatus(port)
  const [driverState, setDriverState] = useState<DriverStatus['state'] | null>(null)

  useEffect(() => {
    window.api.getDriverStatus().then((d) => setDriverState(d.state)).catch(() => {})
  }, [])

  const installed = driverState === 'installed' || driverState === 'update_available'
  const line = bridgeLine(status)

  return (
    <div className="space-y-3">
      <DriverControl
        port={port}
        onChanged={(d) => {
          setDriverState(d.state)
          refresh()
        }}
      />
      <label className={`flex items-start gap-2 text-sm ${installed ? 'text-neutral-300' : 'text-neutral-600'}`}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!installed && !enabled}
          onChange={(e) => onChange({ call_mic_enabled: e.target.checked })}
          className="rounded mt-0.5"
        />
        <span>
          Send to call
          <span className="block text-xs text-neutral-500">
            While this app is open, write to “{CALL_MIC_NAME}”. In Meet, Zoom or Teams, select it as the microphone. The call
            hears silence while this app is closed.
          </span>
        </span>
      </label>
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500 shrink-0">Others hear</span>
        <select
          value={mode}
          onChange={(e) => onChange({ call_mic_mode: e.target.value as CallMicMode })}
          className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-teal-500"
        >
          {(Object.keys(MODE_LABELS) as CallMicMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      {speakMic && mode === 'voice_and_translation' && (
        <p className="text-xs text-amber-400/80 leading-snug">
          Speak my speech is on: others hear your voice and then its translation. Choose “Translation only” to send only
          the translation.
        </p>
      )}
      {line && <p className={`text-xs ${line.tone === 'ok' ? 'text-teal-400' : 'text-amber-400'}`}>{line.text}</p>}
    </div>
  )
}
