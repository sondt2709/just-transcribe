## ADDED Requirements

### Requirement: Optional Qwen3-TTS model step
The setup screen SHALL show an optional step for the Qwen3-TTS voice model, with the command `hf download mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit` and the size (about 1.8 GB). The step SHALL say that the macOS voice works without it. The step SHALL NOT block "Run Setup" or the ready state, for local and remote providers.

#### Scenario: Model not downloaded
- **WHEN** the Qwen3-TTS model is not in the HuggingFace cache
- **THEN** the setup screen shows the optional step with the download command, and "Run Setup" stays enabled when the required steps are complete

#### Scenario: Model already downloaded
- **WHEN** the model is in the HuggingFace cache
- **THEN** the optional step shows as complete
