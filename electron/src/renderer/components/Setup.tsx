import { useState, useEffect } from 'react'

interface SetupProps {
  onComplete: () => void
}

interface SetupStatus {
  uvInstalled: boolean
  hfInstalled: boolean
  appDirExists: boolean
  pythonEnvReady: boolean
  audioteeReady: boolean
  modelsDownloaded: boolean
  ready: boolean
}

export function Setup({ onComplete }: SetupProps): JSX.Element {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    const s = await window.api.getSetupStatus()
    setStatus(s)
    if (s.ready) onComplete()
  }

  useEffect(() => {
    refresh()
  }, [])

  const runSetup = async (): Promise<void> => {
    setRunning(true)
    setError(null)
    const result = await window.api.runSetup()
    if (result.success) {
      const backendResult = await window.api.startBackend()
      if (backendResult.success) {
        onComplete()
      } else {
        setError(backendResult.error || 'Failed to start backend')
      }
    } else {
      setError(result.error || 'Setup failed')
    }
    setRunning(false)
    refresh()
  }

  if (!status) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-neutral-400 text-sm">Checking setup...</div>
      </div>
    )
  }

  const toolsReady = status.uvInstalled && status.hfInstalled
  const modelReady = status.modelsDownloaded
  const canRunSetup = toolsReady && modelReady

  // Determine current step
  const currentStep = !toolsReady ? 1 : !modelReady ? 2 : 3

  return (
    <div className="h-screen flex items-center justify-center no-drag">
      <div className="w-[520px] p-8">
        <h1 className="text-2xl font-bold text-neutral-100 mb-2">Just Transcribe</h1>
        <p className="text-sm text-neutral-400 mb-8">
          First-time setup — let's get everything ready.
        </p>

        {/* Step 1: Prerequisites */}
        <StepSection
          step={1}
          title="Install prerequisites"
          active={currentStep === 1}
          done={toolsReady}
        >
          <div className="space-y-3">
            <CheckItem label="uv (Python package manager)" ok={status.uvInstalled} />
            {!status.uvInstalled && (
              <CommandBlock command="curl -LsSf https://astral.sh/uv/install.sh | sh" />
            )}
            <CheckItem label="huggingface-cli (model downloader)" ok={status.hfInstalled} />
            {!status.hfInstalled && (
              <div className="space-y-1">
                <CommandBlock command="brew install huggingface-cli" />
                <p className="text-xs text-neutral-500 pl-2">or: <code className="text-neutral-400">uv tool install huggingface-cli</code></p>
              </div>
            )}
          </div>
        </StepSection>

        {/* Step 2: Model download */}
        <StepSection
          step={2}
          title="Download ASR model"
          active={currentStep === 2}
          done={modelReady}
        >
          <CheckItem label="Qwen3-ASR 1.7B (~3.5 GB)" ok={status.modelsDownloaded} />
          {!status.modelsDownloaded && (
            <CommandBlock command="hf download Qwen/Qwen3-ASR-1.7B" />
          )}
        </StepSection>

        {/* Step 3: Environment setup */}
        <StepSection
          step={3}
          title="Set up environment"
          active={currentStep === 3}
          done={status.ready}
        >
          <div className="space-y-2">
            <CheckItem label="Python environment" ok={status.pythonEnvReady} />
            <CheckItem label="audiotee binary" ok={status.audioteeReady} />
          </div>
        </StepSection>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={refresh}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 border border-neutral-700 rounded-lg transition-colors"
          >
            Refresh
          </button>
          {canRunSetup && !status.ready && (
            <button
              onClick={runSetup}
              disabled={running}
              className="flex-1 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {running ? 'Setting up...' : 'Run Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepSection({
  step,
  title,
  active,
  done,
  children
}: {
  step: number
  title: string
  active: boolean
  done: boolean
  children: React.ReactNode
}): JSX.Element {
  const dimmed = !active && !done

  return (
    <div className={`mb-5 ${dimmed ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
            done
              ? 'bg-green-500/20 text-green-400'
              : active
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-neutral-800 text-neutral-600'
          }`}
        >
          {done ? '✓' : step}
        </div>
        <span className={`text-sm font-medium ${done ? 'text-neutral-300' : active ? 'text-neutral-200' : 'text-neutral-500'}`}>
          {title}
        </span>
      </div>
      {(active || done) && <div className="pl-8">{children}</div>}
    </div>
  )
}

function CheckItem({ label, ok }: { label: string; ok: boolean }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
          ok ? 'bg-green-500/20 text-green-400' : 'bg-neutral-800 text-neutral-600'
        }`}
      >
        {ok ? '✓' : '·'}
      </div>
      <span className={`text-sm ${ok ? 'text-neutral-300' : 'text-neutral-500'}`}>{label}</span>
    </div>
  )
}

function CommandBlock({ command }: { command: string }): JSX.Element {
  return (
    <code className="block text-xs text-amber-200 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 ml-7 select-all">
      {command}
    </code>
  )
}
