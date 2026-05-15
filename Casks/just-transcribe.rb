cask "just-transcribe" do
  version "0.1.4"
  sha256 :no_check

  url "https://github.com/sondt2709/just-transcribe/releases/download/v#{version}/Just.Transcribe-#{version}-arm64.dmg"
  name "Just Transcribe"
  desc "Real-time transcription app for macOS"
  homepage "https://github.com/sondt2709/just-transcribe"

  depends_on arch: :arm64

  app "Just Transcribe.app"

  zap trash: [
    "~/.just-transcribe",
    "~/Library/Application Support/just-transcribe",
  ]
end
