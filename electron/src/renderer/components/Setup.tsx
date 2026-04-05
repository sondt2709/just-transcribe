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
  asrProvider: string
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

  const chooseProvider = async (provider: string): Promise<void> => {
    await window.api.saveAsrProvider(provider)
    refresh()
  }

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

  const isRemote = status.asrProvider === 'remote'
  const isLocal = status.asrProvider === 'local'
  const providerChosen = isRemote || isLocal

  // Step readiness depends on provider
  const toolsReady = isRemote
    ? status.uvInstalled
    : status.uvInstalled && status.hfInstalled
  const modelReady = isRemote ? true : status.modelsDownloaded
  const canRunSetup = providerChosen && toolsReady && modelReady

  // Determine current step
  const currentStep = !providerChosen ? 1 : !toolsReady ? 2 : !modelReady ? 3 : 4

  return (
    <div className="h-screen flex items-center justify-center no-drag">
      <div className="w-[520px] p-8">
        <h1 className="text-2xl font-bold text-neutral-100 mb-2">Just Transcribe</h1>
        <p className="text-sm text-neutral-400 mb-8">
          First-time setup — let's get everything ready.
        </p>

        {/* Step 1: Choose provider */}
        <StepSection
          step={1}
          title="Choose speech recognition mode"
          active={currentStep === 1}
          done={providerChosen}
        >
          <div className="space-y-2">
            <button
              onClick={() => chooseProvider('local')}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                isLocal
                  ? 'bg-blue-500/10 border-blue-500/30 text-neutral-200'
                  : 'bg-neutral-800/50 border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'
              }`}
            >
              <div className="text-sm font-medium">Local (on-device)</div>
              <div className="text-xs text-neutral-500 mt-0.5">
                Uses Apple Silicon GPU. Downloads ~3.5 GB model.
              </div>
            </button>
            <button
              onClick={() => chooseProvider('remote')}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                isRemote
                  ? 'bg-blue-500/10 border-blue-500/30 text-neutral-200'
                  : 'bg-neutral-800/50 border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'
              }`}
            >
              <div className="text-sm font-medium">Remote Server</div>
              <div className="text-xs text-neutral-500 mt-0.5">
                Point to an ASR server on your network. No model download needed.
              </div>
            </button>
          </div>
        </StepSection>

        {/* Step 2: Prerequisites */}
        <StepSection
          step={2}
          title="Install prerequisites"
          active={currentStep === 2}
          done={toolsReady}
        >
          <div className="space-y-3">
            <CheckItem label="uv (Python package manager)" ok={status.uvInstalled} />
            {!status.uvInstalled && (
              <CommandBlock command="curl -LsSf https://astral.sh/uv/install.sh | sh" />
            )}
            {isLocal && (
              <>
                <CheckItem label="huggingface-cli (model downloader)" ok={status.hfInstalled} />
                {!status.hfInstalled && (
                  <div className="space-y-1">
                    <CommandBlock command="brew install huggingface-cli" />
                    <p className="text-xs text-neutral-500 pl-2">or: <code className="text-neutral-400">uv tool install huggingface-cli</code></p>
                  </div>
                )}
              </>
            )}
          </div>
        </StepSection>

        {/* Step 3: Model download (local only) */}
        {isLocal && (
          <StepSection
            step={3}
            title="Download ASR model"
            active={currentStep === 3}
            done={modelReady}
          >
            <CheckItem label="Qwen3-ASR 1.7B (~3.5 GB)" ok={status.modelsDownloaded} />
            {!status.modelsDownloaded && (
              <div>
                <CommandBlock command="hf download Qwen/Qwen3-ASR-1.7B" />
                <p className="text-xs text-neutral-500 mt-1 pl-7">
                  Or place the model in ~/.cache/huggingface/hub/ by any method.
                </p>
              </div>
            )}
          </StepSection>
        )}

        {/* Step 3 for remote / Step 4 for local: Environment setup */}
        <StepSection
          step={isRemote ? 3 : 4}
          title="Set up environment"
          active={currentStep === (isRemote ? 3 : 4)}
          done={status.ready}
        >
          <div className="space-y-2">
            <CheckItem label="Python environment" ok={status.pythonEnvReady} />
            <CheckItem label="audiotee binary" ok={status.audioteeReady} />
          </div>
          {isRemote && (
            <p className="text-xs text-neutral-500 mt-2">
              Configure your remote server in Settings after setup.
            </p>
          )}
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
