"""CLI entry point for just-transcribe backend."""

from __future__ import annotations

import argparse
import logging
import os
import signal
import sys
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path

from just_transcribe.config import AUDIOTEE_BIN, LOG_DIR, ensure_directories


def setup_logging() -> None:
    """Configure logging to file with rotation and stderr."""
    ensure_directories()
    log_file = LOG_DIR / "backend.log"

    handlers = [
        RotatingFileHandler(
            log_file, maxBytes=10 * 1024 * 1024, backupCount=3  # 10MB
        ),
        logging.StreamHandler(sys.stderr),
    ]

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=handlers,
    )


def watch_stdin() -> None:
    """Watch for stdin EOF (parent process death) and trigger shutdown."""
    try:
        sys.stdin.read()
    except Exception:
        pass
    logging.info("stdin closed (parent exited), shutting down")
    os.kill(os.getpid(), signal.SIGTERM)


def main() -> None:
    parser = argparse.ArgumentParser(description="just-transcribe backend")
    parser.add_argument("--port", type=int, default=9876, help="Server port")
    parser.add_argument(
        "--audiotee",
        type=str,
        default=str(AUDIOTEE_BIN),
        help="Path to audiotee binary",
    )
    args = parser.parse_args()

    setup_logging()
    ensure_directories()

    # Start stdin watcher for parent death detection
    stdin_thread = threading.Thread(target=watch_stdin, daemon=True)
    stdin_thread.start()

    # Register SIGTERM for graceful shutdown
    def handle_sigterm(sig, frame):
        logging.info("SIGTERM received, shutting down")
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_sigterm)

    # Import and create app
    from just_transcribe.server import create_app

    audiotee_path = Path(args.audiotee)
    app = create_app(audiotee_path=audiotee_path)

    # Run server
    import uvicorn

    logging.info("Starting server on port %d", args.port)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
