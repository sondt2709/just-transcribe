import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  adminScript,
  bundleVersion,
  driverStatus,
  installCommand,
  isUserCancel,
  removeCommand
} from './driverCommands.ts'

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleShortVersionString</key>
  <string>9.9.9</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
</dict></plist>`

test('reads CFBundleVersion, not the short version', () => {
  assert.equal(bundleVersion(PLIST), '1.0.0')
  assert.equal(bundleVersion('<plist></plist>'), null)
  assert.equal(bundleVersion(null), null)
})

test('status compares installed and bundled versions', () => {
  assert.equal(driverStatus(null, '1.0.0').state, 'not_installed')
  assert.equal(driverStatus('1.0.0', '1.0.0').state, 'installed')
  assert.equal(driverStatus('1.0.0', '1.1.0').state, 'update_available')
  assert.equal(driverStatus('1.0.0', null).state, 'unavailable')
})

test('install command quotes a bundle path with spaces and quotes', () => {
  const cmd = installCommand("/Applications/Just Transcribe.app/Contents/Resources/driver/JustTranscribeMic.driver")
  assert.match(cmd, /cp -R '\/Applications\/Just Transcribe\.app\/Contents\/Resources\/driver\/JustTranscribeMic\.driver' '\/Library\/Audio\/Plug-Ins\/HAL\/'/)
  assert.match(cmd, /^mkdir -p .* && rm -rf '\/Library\/Audio\/Plug-Ins\/HAL\/JustTranscribeMic\.driver' && cp -R/)
  assert.match(cmd, /chown -R root:wheel '\/Library\/Audio\/Plug-Ins\/HAL\/JustTranscribeMic\.driver'/)
  assert.ok(cmd.endsWith('&& killall coreaudiod'))
  assert.match(installCommand("/tmp/it's/x.driver"), /'\/tmp\/it'\\''s\/x\.driver'/)
})

test('remove command deletes only the driver bundle', () => {
  assert.equal(removeCommand(), "rm -rf '/Library/Audio/Plug-Ins/HAL/JustTranscribeMic.driver' && killall coreaudiod")
})

test('the AppleScript string round-trips the shell command', () => {
  // Compile the script with osascript (no admin rights asked): the command it would run
  // must equal the input. Replace the admin call with a plain return of the string.
  const cmd = installCommand('/tmp/a "b" \\ c/x.driver')
  const script = adminScript(cmd).replace(/^do shell script /, 'return ').replace(/ with administrator privileges$/, '')
  assert.equal(execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trimEnd(), cmd)
})

test('detects a cancelled password prompt', () => {
  assert.ok(isUserCancel('execution error: User canceled. (-128)'))
  assert.ok(!isUserCancel('execution error: cp: No such file (1)'))
})
