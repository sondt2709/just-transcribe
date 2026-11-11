// Translate-and-speak helpers shared by the Speak tab, transcript lines and summary answers.

export const SPEAK_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'yue', label: 'Cantonese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ru', label: 'Russian' }
]

export function languageLabel(code: string): string {
  return SPEAK_LANGUAGES.find((l) => l.code === code)?.label ?? code
}

export async function speakText(
  port: number,
  text: string,
  opts: { translate?: boolean; targetLang?: string; sourceLang?: string } = {}
): Promise<{ status: string; id?: number; message?: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/api/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      translate: opts.translate ?? true,
      target_lang: opts.targetLang ?? '',
      source_lang: opts.sourceLang ?? ''
    })
  })
  return res.json()
}

export async function stopSpeaking(port: number): Promise<void> {
  await fetch(`http://127.0.0.1:${port}/api/speak/stop`, { method: 'POST' })
}

export async function replayUtterance(port: number, id: number): Promise<void> {
  await fetch(`http://127.0.0.1:${port}/api/speak/replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  })
}

/** Read config, apply a partial update, write it back (same pattern as the ASR language picker). */
export async function patchConfig(port: number, patch: Record<string, unknown>): Promise<void> {
  const cfg = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json()
  await fetch(`http://127.0.0.1:${port}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...cfg, ...patch })
  })
}

export const ENGINE_LABELS: Record<string, string> = {
  system: 'macOS voice',
  qwen_local: 'Qwen3-TTS (local)',
  qwen_remote: 'Qwen3-TTS (remote)'
}
