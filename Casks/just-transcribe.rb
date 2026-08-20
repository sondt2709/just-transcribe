cask "just-transcribe" do
  version "0.3.0"
  sha256 "bd9f19a8bb72d9f8c99bfed234195137b4c5cc8fb76ec9049a81d49fc56f0bcc"

  url "https://github.com/sondt2709/just-transcribe/releases/download/v#{version}/Just.Transcribe-#{version}-arm64.dmg"
  name "Just Transcribe"
  desc "Real-time transcription app for macOS"
  homepage "https://github.com/sondt2709/just-transcribe"

  depends_on arch: :arm64

  app "Just Transcribe.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/Just Transcribe.app"],
                   sudo: false
  end

  zap trash: [
    "~/.just-transcribe",
    "~/Library/Application Support/just-transcribe",
  ]

  caveats <<~EOS
    App is unsigned; quarantine is cleared automatically on install.
    If macOS still blocks the app, run:
      xattr -cr "/Applications/Just Transcribe.app"
  EOS
end
