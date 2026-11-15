#!/usr/bin/env bash
# Build the "Just Transcribe Microphone" driver and sign it ad-hoc.
# Output: electron/resources/driver/JustTranscribeMic.driver (bundled by electron-builder).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/driver/build"
OUT="$ROOT/electron/resources/driver"

cmake -S "$ROOT/driver" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD" --config Release -j

rm -rf "$OUT/JustTranscribeMic.driver"
mkdir -p "$OUT"
cp -R "$BUILD/JustTranscribeMic.driver" "$OUT/"
codesign --force --sign - "$OUT/JustTranscribeMic.driver"
codesign --verify --verbose "$OUT/JustTranscribeMic.driver"
echo "Built $OUT/JustTranscribeMic.driver"
