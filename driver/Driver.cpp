// "Just Transcribe Microphone": a loopback Audio Server Plug-in.
//
// Audio that a process (the Just Transcribe backend) writes to the device's output side
// comes out of its input side, so a meeting app that selects the device as its microphone
// hears it. Built with libASPL (MIT).
//
// The ring buffer is indexed by sample time. Each slot also stores the sample time it was
// written for, so a reader gets silence for frames nobody wrote (no stale loop when the
// writer stops), and several clients can read the same frames.

#include <aspl/Driver.hpp>

#include <CoreAudio/AudioServerPlugIn.h>

#include <array>
#include <atomic>
#include <cstring>

namespace {

constexpr UInt32 SampleRate = 48000;
constexpr UInt32 ChannelCount = 2;
constexpr UInt64 RingFrames = 1 << 16; // ~1.4 s at 48 kHz

class LoopbackHandler : public aspl::ControlRequestHandler, public aspl::IORequestHandler
{
public:
    LoopbackHandler()
    {
        for (auto& s : stamps_) {
            s.store(-1, std::memory_order_relaxed);
        }
    }

    // Realtime thread: mixed audio that clients wrote to the output side.
    void OnWriteMixedOutput(const std::shared_ptr<aspl::Stream>& stream,
        Float64 zeroTimestamp,
        Float64 timestamp,
        const void* bytes,
        UInt32 bytesCount) override
    {
        const auto* in = static_cast<const Float32*>(bytes);
        const UInt32 frames = bytesCount / (sizeof(Float32) * ChannelCount);
        const SInt64 t0 = SInt64(timestamp);
        for (UInt32 n = 0; n < frames; n++) {
            const SInt64 t = t0 + n;
            const UInt64 slot = UInt64(t) % RingFrames;
            std::memcpy(&ring_[slot * ChannelCount], &in[n * ChannelCount], sizeof(Float32) * ChannelCount);
            stamps_[slot].store(t, std::memory_order_release);
        }
    }

    // Realtime thread: input for one client.
    void OnReadClientInput(const std::shared_ptr<aspl::Client>& client,
        const std::shared_ptr<aspl::Stream>& stream,
        Float64 zeroTimestamp,
        Float64 timestamp,
        void* bytes,
        UInt32 bytesCount) override
    {
        auto* out = static_cast<Float32*>(bytes);
        const UInt32 frames = bytesCount / (sizeof(Float32) * ChannelCount);
        const SInt64 t0 = SInt64(timestamp);
        for (UInt32 n = 0; n < frames; n++) {
            const SInt64 t = t0 + n;
            const UInt64 slot = UInt64(t) % RingFrames;
            if (stamps_[slot].load(std::memory_order_acquire) == t) {
                std::memcpy(&out[n * ChannelCount], &ring_[slot * ChannelCount], sizeof(Float32) * ChannelCount);
            } else {
                std::memset(&out[n * ChannelCount], 0, sizeof(Float32) * ChannelCount);
            }
        }
    }

private:
    std::array<Float32, RingFrames * ChannelCount> ring_ {};
    std::array<std::atomic<SInt64>, RingFrames> stamps_;
};

aspl::StreamParameters StreamParams(aspl::Direction dir)
{
    aspl::StreamParameters p;
    p.Direction = dir;
    p.Format = {
        .mSampleRate = SampleRate,
        .mFormatID = kAudioFormatLinearPCM,
        .mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagsNativeEndian | kAudioFormatFlagIsPacked,
        .mBytesPerPacket = sizeof(Float32) * ChannelCount,
        .mFramesPerPacket = 1,
        .mBytesPerFrame = sizeof(Float32) * ChannelCount,
        .mChannelsPerFrame = ChannelCount,
        .mBitsPerChannel = 32,
    };
    return p;
}

std::shared_ptr<aspl::Driver> CreateDriver()
{
    auto context = std::make_shared<aspl::Context>();

    aspl::DeviceParameters params;
    params.Name = "Just Transcribe Microphone";
    params.Manufacturer = "Just Transcribe";
    params.DeviceUID = "JustTranscribeMic_UID";
    params.ModelUID = "JustTranscribeMic_Model";
    params.SampleRate = SampleRate;
    params.ChannelCount = ChannelCount;
    params.CanBeDefault = true; // can be the default input (apps that follow the system mic)
    params.CanBeDefaultForSystemSounds = false;

    auto device = std::make_shared<aspl::Device>(context, params);
    device->AddStreamWithControlsAsync(StreamParams(aspl::Direction::Input));
    device->AddStreamWithControlsAsync(StreamParams(aspl::Direction::Output));

    auto handler = std::make_shared<LoopbackHandler>();
    device->SetControlHandler(handler);
    device->SetIOHandler(handler);

    auto plugin = std::make_shared<aspl::Plugin>(context);
    plugin->AddDevice(device);

    return std::make_shared<aspl::Driver>(context, plugin);
}

} // namespace

extern "C" void* JustTranscribeMicEntryPoint(CFAllocatorRef allocator, CFUUIDRef typeUUID)
{
    if (!CFEqual(typeUUID, kAudioServerPlugInTypeUUID)) {
        return nullptr;
    }
    static std::shared_ptr<aspl::Driver> driver = CreateDriver();
    return driver->GetReference();
}
