"""FastAPI server with HTTP control API and WebSocket transcript streaming."""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import sounddevice as sd
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from just_transcribe.audio.stream import AudioStreamManager
from just_transcribe.config import AppConfig, load_config, save_config
from just_transcribe.pipeline.asr import ASREngine, TranscriptSegment
from just_transcribe.pipeline.orchestrator import PipelineOrchestrator
from just_transcribe.pipeline.translate import TranslationResult, TranslationService
from just_transcribe.pipeline.vad import VoiceActivityDetector

logger = logging.getLogger(__name__)


class AppState:
    """Shared application state."""

    def __init__(self, config: AppConfig, audiotee_path: Optional[Path] = None):
        self.config = config
        self.audiotee_path = audiotee_path
        self.recording = False
        self.model_loaded = False

        # Components (initialized lazily)
        self.vad: Optional[VoiceActivityDetector] = None
        self.asr: Optional[ASREngine] = None
        self.translator: Optional[TranslationService] = None
        self.stream_manager: Optional[AudioStreamManager] = None
        self.orchestrator: Optional[PipelineOrchestrator] = None

        # WebSocket clients
        self.ws_clients: set[WebSocket] = set()

    def broadcast(self, event: dict) -> None:
        """Queue a broadcast to all connected WebSocket clients."""
        message = json.dumps(event)
        disconnected = set()
        for ws in self.ws_clients:
            try:
                asyncio.create_task(ws.send_text(message))
            except Exception:
                disconnected.add(ws)
        self.ws_clients -= disconnected


def create_app(
    config: Optional[AppConfig] = None,
    audiotee_path: Optional[Path] = None,
) -> FastAPI:
    """Create and configure the FastAPI application."""

    if config is None:
        config = load_config()

    state = AppState(config=config, audiotee_path=audiotee_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Load models on startup
        logger.info("Loading AI models...")
        state.vad = VoiceActivityDetector()
        state.vad.load_model()

        state.asr = ASREngine(model_name=config.asr_model, language=config.asr_language)
        state.asr.load_model()
        state.model_loaded = True

        state.translator = TranslationService(
            api_base=config.llm_api_base,
            model=config.llm_model,
            api_key=config.llm_api_key,
            preferred_language=config.preferred_language,
        )

        logger.info("Models loaded, server ready")
        print("READY", flush=True)  # Signal to Electron

        yield

        # Cleanup
        if state.recording and state.orchestrator:
            await state.orchestrator.stop()
        if state.translator:
            await state.translator.close()

    app = FastAPI(title="just-transcribe", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- HTTP Control API ---

    @app.post("/api/start")
    async def start_recording(body: dict = {}):
        if state.recording:
            return {"status": "already_recording"}

        mic = body.get("mic", state.config.mic_enabled)
        speaker = body.get("speaker", state.config.speaker_enabled)

        state.stream_manager = AudioStreamManager(audiotee_path=state.audiotee_path)
        state.orchestrator = PipelineOrchestrator(
            stream_manager=state.stream_manager,
            vad=state.vad,
            asr=state.asr,
            translator=state.translator,
        )

        # Wire callbacks
        state.orchestrator.on_segment = lambda seg: _on_segment(state, seg)
        state.orchestrator.on_interim = lambda data: _on_interim(state, data)
        state.orchestrator.on_translation = lambda tr: _on_translation(state, tr)
        state.orchestrator.on_error = lambda msg: _on_error(state, msg)

        try:
            await state.orchestrator.start(mic=mic, speaker=speaker)
            state.recording = True
            state.broadcast({"type": "status", "state": "recording"})
            return {"status": "recording"}
        except Exception as e:
            logger.error("Failed to start recording: %s", e)
            return {"status": "error", "message": str(e)}

    @app.post("/api/stop")
    async def stop_recording():
        if not state.recording or not state.orchestrator:
            return {"status": "already_stopped"}

        await state.orchestrator.stop()
        state.recording = False
        state.broadcast({"type": "status", "state": "stopped"})
        return {"status": "stopped"}

    @app.get("/api/status")
    async def get_status():
        return {
            "recording": state.recording,
            "model_loaded": state.model_loaded,
            "mic_active": (
                state.stream_manager.mic_active if state.stream_manager else False
            ),
            "speaker_active": (
                state.stream_manager.speaker_active
                if state.stream_manager
                else False
            ),
        }

    @app.get("/api/devices")
    async def get_devices():
        devices = sd.query_devices()
        mics = [
            {"id": i, "name": d["name"], "channels": d["max_input_channels"]}
            for i, d in enumerate(devices)
            if d["max_input_channels"] > 0
        ]
        return {"microphones": mics}

    @app.get("/api/config")
    async def get_config():
        return state.config.to_dict()

    @app.put("/api/config")
    async def update_config(body: dict):
        state.config = AppConfig.from_dict(body)
        save_config(state.config)

        # Update ASR language hint live
        if state.asr:
            state.asr.set_language(state.config.asr_language)

        # Update translator config live
        if state.translator:
            state.translator.update_config(
                api_base=state.config.llm_api_base,
                model=state.config.llm_model,
                api_key=state.config.llm_api_key,
                preferred_language=state.config.preferred_language,
            )

        return {"status": "ok"}

    # --- WebSocket ---

    @app.websocket("/ws/transcript")
    async def websocket_transcript(ws: WebSocket):
        await ws.accept()
        state.ws_clients.add(ws)
        logger.info("WebSocket client connected (%d total)", len(state.ws_clients))
        try:
            while True:
                # Keep connection alive, handle client messages if needed
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            state.ws_clients.discard(ws)
            logger.info(
                "WebSocket client disconnected (%d remaining)", len(state.ws_clients)
            )

    return app


def _on_interim(state: AppState, data: dict) -> None:
    state.broadcast(
        {
            "type": "interim",
            "source": data["source"],
            "speaker": data["speaker"],
            "text": data["text"],
            "lang": data.get("lang", ""),
        }
    )


def _on_segment(state: AppState, segment: TranscriptSegment) -> None:
    state.broadcast(
        {
            "type": "segment",
            "id": segment.id,
            "text": segment.text,
            "source": segment.source,
            "speaker": segment.speaker,
            "lang": segment.lang,
            "start": round(segment.start, 2),
            "end": round(segment.end, 2),
        }
    )


def _on_translation(state: AppState, result: TranslationResult) -> None:
    state.broadcast(
        {
            "type": "translate",
            "id": result.segment_id,
            "text": result.translated_text,
            "target_lang": result.target_lang,
        }
    )


def _on_error(state: AppState, message: str) -> None:
    state.broadcast({"type": "error", "message": message})
