## ADDED Requirements

### Requirement: Stepped setup flow
The setup screen SHALL present prerequisites in a clear stepped order: (1) install external tools, (2) download model, (3) run setup. Each step SHALL only become actionable when prior steps are complete.

#### Scenario: All prerequisites missing
- **WHEN** the app launches for the first time with no uv, no hf, no model
- **THEN** the setup screen shows step 1 (install uv and hf) with copy-pasteable commands and a Refresh button

#### Scenario: Tools installed but model missing
- **WHEN** uv and hf are installed but the ASR model is not cached
- **THEN** the setup screen shows step 1 as complete, and step 2 (download model) with the command `hf download Qwen/Qwen3-ASR-1.7B`

#### Scenario: All prerequisites met
- **WHEN** uv, hf are installed and the model is cached
- **THEN** the setup screen shows steps 1-2 as complete and enables the "Run Setup" button for step 3

### Requirement: Model download instructions
The setup screen SHALL instruct the user to download the ASR model using `hf download Qwen/Qwen3-ASR-1.7B` when the model is not found in `~/.cache/huggingface/hub/`.

#### Scenario: Model not cached
- **WHEN** `~/.cache/huggingface/hub/models--Qwen--Qwen3-ASR-1.7B` does not exist
- **THEN** the setup screen displays the download command with a note about expected size (~3.5GB)

#### Scenario: Model already cached
- **WHEN** the model directory exists in huggingface cache
- **THEN** the setup screen marks model download as complete

### Requirement: Prerequisite install links
The setup screen SHALL provide official install instructions for each prerequisite tool.

#### Scenario: uv install instruction
- **WHEN** uv is not found in PATH
- **THEN** the setup screen shows: `curl -LsSf https://astral.sh/uv/install.sh | sh`

#### Scenario: hf install instruction
- **WHEN** huggingface-cli is not found in PATH
- **THEN** the setup screen shows: `brew install huggingface-cli` or `uv tool install huggingface-cli`
