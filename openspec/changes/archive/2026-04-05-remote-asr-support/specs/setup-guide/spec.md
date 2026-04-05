## MODIFIED Requirements

### Requirement: Stepped setup flow
The setup screen SHALL present a provider choice as the first step, then adapt subsequent steps based on the selection. For local: (1) choose provider, (2) install external tools (uv, optionally hf), (3) download model, (4) run setup. For remote: (1) choose provider, (2) install uv, (3) configure and test remote server, (4) run setup. Each step SHALL only become actionable when prior steps are complete.

#### Scenario: Provider choice step
- **WHEN** the app launches for the first time
- **THEN** the setup screen presents two options: "Local (on-device)" and "Remote Server" with brief descriptions of each

#### Scenario: Remote path — tools step
- **WHEN** the user selects "Remote Server" as the provider
- **THEN** the setup screen shows only uv as a required tool (hf CLI is NOT required) and skips the model download step

#### Scenario: Remote path — server configuration
- **WHEN** the user has uv installed and selected remote provider
- **THEN** the setup screen shows server URL input with a Test button, and on successful test shows a model dropdown populated from the server

#### Scenario: Local path — all prerequisites missing
- **WHEN** the user selects "Local" and has no uv, no hf, no model
- **THEN** the setup screen shows step 2 (install uv and hf) with copy-pasteable commands and a Refresh button

#### Scenario: Local path — tools installed but model missing
- **WHEN** uv and hf are installed but the ASR model is not cached
- **THEN** the setup screen shows step 3 (download model) with the command `hf download Qwen/Qwen3-ASR-1.7B`

#### Scenario: Local path — all prerequisites met
- **WHEN** uv is installed and the model is cached
- **THEN** the setup screen shows prior steps as complete and enables the "Run Setup" button

### Requirement: Model download instructions
The setup screen SHALL instruct the user to download the ASR model using `hf download Qwen/Qwen3-ASR-1.7B` as the preferred method when the model is not found in `~/.cache/huggingface/hub/`. The system SHALL accept models placed in the cache directory by any means, not only via hf CLI.

#### Scenario: Model not cached
- **WHEN** `~/.cache/huggingface/hub/models--Qwen--Qwen3-ASR-1.7B` does not exist
- **THEN** the setup screen displays the hf download command as the recommended method, with a note that any method placing the model in the correct cache folder is accepted

#### Scenario: Model already cached
- **WHEN** the model directory exists in huggingface cache
- **THEN** the setup screen marks model download as complete regardless of how it was installed

### Requirement: Prerequisite install links
The setup screen SHALL provide official install instructions for each prerequisite tool, adapted to the selected provider.

#### Scenario: uv install instruction
- **WHEN** uv is not found in PATH
- **THEN** the setup screen shows: `curl -LsSf https://astral.sh/uv/install.sh | sh`

#### Scenario: hf install instruction (local provider only)
- **WHEN** huggingface-cli is not found in PATH and provider is local
- **THEN** the setup screen shows: `brew install huggingface-cli` or `uv tool install huggingface-cli`

#### Scenario: hf not required for remote
- **WHEN** the provider is remote
- **THEN** the setup screen SHALL NOT show hf CLI as a prerequisite
