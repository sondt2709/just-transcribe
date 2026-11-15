cask "just-transcribe" do
  version "0.4.0"
  sha256 "da6041ddd0e430ad84b661407507208caf20ab25adbde97292edaca5431a8a42"

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

  # Not `uninstall`: `brew upgrade` runs the old version's uninstall stanza, which
  # would remove the driver and restart Core Audio on every upgrade.
  zap script: {
        executable: "/bin/sh",
        args:       [
          "-c",
          "if [ -e /Library/Audio/Plug-Ins/HAL/JustTranscribeMic.driver ]; then " \
          "rm -rf /Library/Audio/Plug-Ins/HAL/JustTranscribeMic.driver && killall coreaudiod; fi",
        ],
        sudo:       true,
      },
      trash:  [
        "~/.just-transcribe",
        "~/Library/Application Support/just-transcribe",
      ]

  caveats <<~EOS
    App is unsigned; quarantine is cleared automatically on install.
    If macOS still blocks the app, run:
      xattr -cr "/Applications/Just Transcribe.app"

    If you installed the call microphone ("Just Transcribe Microphone"),
    remove it with: brew uninstall --zap just-transcribe
  EOS
end
