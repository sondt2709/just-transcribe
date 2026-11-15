"""One PortAudio reload for the whole backend.

PortAudio reads the device list once, at initialization; after a device change a
stream opened with the old list fails (-9986). Reloading (Pa_Terminate +
Pa_Initialize) closes every open stream, so holders of long-lived streams (the
call mic bridge) register here: they close their streams before the reload and
reopen them after.
"""

from __future__ import annotations

import logging
import threading
from typing import Protocol

import sounddevice as sd

logger = logging.getLogger(__name__)


class StreamHolder(Protocol):
    def suspend(self) -> bool:
        """Close streams; return True if they must be reopened after the reload."""

    def resume(self) -> None: ...


_holders: list[StreamHolder] = []
lock = threading.RLock()  # also held by stream holders (call_mic) for their own state


def register(holder: StreamHolder) -> None:
    with lock:
        if holder not in _holders:
            _holders.append(holder)


def unregister(holder: StreamHolder) -> None:
    with lock:
        if holder in _holders:
            _holders.remove(holder)


def reload(sd_module=sd) -> None:
    try:
        terminate, initialize = sd_module._terminate, sd_module._initialize
    except AttributeError:
        logger.warning("Cannot reload PortAudio: sounddevice has no _terminate/_initialize")
        return
    with lock:
        suspended = [h for h in list(_holders) if h.suspend()]
        try:
            try:
                terminate()
            except sd_module.PortAudioError as e:
                logger.warning("PortAudio terminate failed: %s", e)
            initialize()
        finally:
            for h in suspended:
                try:
                    h.resume()
                except Exception as e:  # a holder must not break the caller's reload
                    logger.warning("Stream holder failed to resume: %s", e)
