## MODIFIED Requirements

### Requirement: First-launch prerequisite checking
On first launch, the Electron app SHALL verify that required prerequisites are installed: `uv` and `huggingface-cli` (hf). If missing, it SHALL display instructions for installation. The setup screen SHALL also verify that the ASR model is downloaded before allowing the user to proceed to environment setup.

#### Scenario: All prerequisites present
- **WHEN** the app launches and detects `uv` and `hf` CLI in PATH
- **THEN** it proceeds to check model download status and Python environment status

#### Scenario: uv not installed
- **WHEN** the app cannot find `uv` in PATH
- **THEN** it displays a setup screen with the instruction: `curl -LsSf https://astral.sh/uv/install.sh | sh`

#### Scenario: huggingface-cli not installed
- **WHEN** the app cannot find `hf` in PATH
- **THEN** it displays a setup screen with the instruction: `brew install huggingface-cli` or `uv tool install huggingface-cli`

#### Scenario: Model not downloaded
- **WHEN** uv and hf are installed but `~/.cache/huggingface/hub/models--Qwen--Qwen3-ASR-1.7B` does not exist
- **THEN** it displays the model download step with instruction: `hf download Qwen/Qwen3-ASR-1.7B`

### Requirement: Model download management
The Electron app SHALL check if required models are downloaded. If not, it SHALL display download instructions. The model download is a user-initiated terminal action, not an automated in-app process.

#### Scenario: Models not downloaded
- **WHEN** the Qwen3-ASR 1.7B model is not found in `~/.cache/huggingface/`
- **THEN** the app displays the download command `hf download Qwen/Qwen3-ASR-1.7B` with expected size info

#### Scenario: Models already present
- **WHEN** required models exist in cache
- **THEN** the app marks model download as complete and enables environment setup
