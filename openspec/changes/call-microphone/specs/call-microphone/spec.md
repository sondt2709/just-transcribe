## ADDED Requirements

### Requirement: Virtual input device
The app SHALL ship an Audio Server Plug-in `JustTranscribeMic.driver` that, once installed, adds one audio device named "Just Transcribe Microphone" with 2 input channels and 2 output channels at 48 kHz. Audio written to the output side SHALL appear on the input side in the same order, with no added processing. When nothing is written, the input SHALL be silence. The device SHALL NOT be usable as the system sound-effects output.

#### Scenario: Device appears after install
- **WHEN** the driver is installed and Core Audio has restarted
- **THEN** "Just Transcribe Microphone" is listed as an input device by `system_profiler SPAudioDataType` and by meeting apps

#### Scenario: Loopback
- **WHEN** a process plays a 1 kHz tone to the output side of "Just Transcribe Microphone" and another process records its input
- **THEN** the recording contains the 1 kHz tone

#### Scenario: Silence when no writer
- **WHEN** a process records the input and no process writes to the output side
- **THEN** the recording is silence (every sample is 0)

### Requirement: Send to call
When `call_mic_enabled` is true and the device is installed, the backend SHALL run a call mic bridge that writes to "Just Transcribe Microphone" while the backend runs, whether or not recording is on. In mode `voice_and_translation` the bridge SHALL write the default input device (real mic) mixed with the spoken translation. In mode `translation_only` it SHALL write only the spoken translation and SHALL NOT open the real mic. Each spoken utterance SHALL also play on the user's output device as before. The mix SHALL be clipped to [-1, 1].

#### Scenario: Translation reaches the call
- **WHEN** `call_mic_enabled = true`, mode `translation_only`, and the user speaks "Xin chào" with target English
- **THEN** a process recording "Just Transcribe Microphone" records the spoken English translation, and the user's output device plays it too

#### Scenario: Voice passes through
- **WHEN** mode `voice_and_translation` and the user talks with no utterance playing
- **THEN** the recording of "Just Transcribe Microphone" contains the user's voice

#### Scenario: Translation only keeps the mic closed
- **WHEN** mode `translation_only`
- **THEN** the bridge opens no input stream

#### Scenario: Turned off
- **WHEN** the user turns "Send to call" off
- **THEN** the bridge closes its streams within 1 second and the device input is silence

#### Scenario: Device not installed
- **WHEN** `call_mic_enabled = true` and the device is not installed
- **THEN** the bridge does not start, `GET /api/callmic/status` returns `state: "no_device"`, and the UI offers the install

### Requirement: Clock drift handling
The bridge SHALL keep the mic audio waiting for the virtual device between 20 ms and 60 ms. Above 60 ms it SHALL drop the oldest frames down to 40 ms; below 0 it SHALL write zeros for the missing frames.

#### Scenario: Mic clock faster than the device
- **WHEN** the mic delivers 1% more frames than the device consumes for 60 seconds
- **THEN** the waiting audio never exceeds 60 ms

### Requirement: Call mic API
The backend SHALL provide `GET /api/callmic/status` returning `{state, mode, device}`, where `state` is `off`, `running`, `no_device` or `error` (with `error` text). The setting SHALL be changed through `PUT /api/config` (`call_mic_enabled`, `call_mic_mode`), and the backend SHALL start or stop the bridge on that change. `POST /api/callmic/restart` SHALL try again to start the bridge (after the driver is installed or updated) and return the new status. When the bridge streams stop (for example, Core Audio restarts), the backend SHALL reopen them.

#### Scenario: Enable through config
- **WHEN** the device is installed and the client sends `PUT /api/config` with `call_mic_enabled: true`
- **THEN** `GET /api/callmic/status` returns `state: "running"`

### Requirement: Driver install, update and remove
The app SHALL install, update and remove the driver only after the user confirms a dialog that says all sound stops for about 2 seconds. Each action SHALL use one macOS administrator prompt that copies `JustTranscribeMic.driver` to `/Library/Audio/Plug-Ins/HAL/` (or deletes it), sets owner `root:wheel`, and restarts Core Audio. The app SHALL report `not_installed`, `installed` or `update_available` by comparing `CFBundleVersion` of the installed and the bundled driver. The app SHALL NOT install or update the driver without a user action.

#### Scenario: Install from Settings
- **WHEN** the driver is not installed and the user clicks Install, confirms, and enters the admin password
- **THEN** the driver is in `/Library/Audio/Plug-Ins/HAL/`, Core Audio restarts, and the status shows `installed`

#### Scenario: Admin prompt cancelled
- **WHEN** the user cancels the administrator prompt
- **THEN** nothing is copied, Core Audio is not restarted, and the status stays `not_installed`

#### Scenario: Update available
- **WHEN** the installed driver version is `1.0.0` and the bundled one is `1.1.0`
- **THEN** Settings shows "Update", and nothing changes until the user clicks it

### Requirement: Call mic controls
Settings → Voice SHALL show the driver status with Install, Update or Remove, the "Send to call" switch, and "Others hear: my voice + translation | translation only". The Speak section SHALL show one status line while the bridge runs ("Sending to call: Just Transcribe Microphone"). When Speak my speech is on and the mode is `voice_and_translation`, the UI SHALL suggest `translation_only`. The UI SHALL say to select "Just Transcribe Microphone" as the microphone in the meeting app, and that the call hears silence while the app is closed.

#### Scenario: Status line
- **WHEN** the bridge runs
- **THEN** the Speak section shows "Sending to call" with the mode
