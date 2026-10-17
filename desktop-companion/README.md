# Glyphix Desktop Companion

The companion captures your computer's audio and streams it to the Glyphix Android app over UDP, so the Glyphs, haptics and visualizers react to what your PC is playing. The Python variants can also drive PC RGB lighting through [OpenRGB](https://openrgb.org/).

## Variants

| File | Platform | Interface |
| :--- | :--- | :--- |
| `desktop_companion.py` | Windows 10/11 | CustomTkinter GUI (WASAPI loopback capture) |
| `desktop_companion_kivymd.py` | Windows | KivyMD Material UI, launched with `--material` |
| `desktop_companion_macos.py` | macOS | CustomTkinter GUI, needs [BlackHole 2ch](https://existential.audio/blackhole/) to capture system audio |
| `../desktop-companion-wpf/` | Windows, .NET 8 | Native WPF app with NAudio and OpenRGB.NET |

## Prerequisites

- Python 3.8 or newer for the Python variants.
- The Glyphix Android app on a phone connected to the **same network** as the computer.
- Optional: OpenRGB running with its SDK server enabled, for PC RGB sync.

## Installation

```bash
pip install -r requirements.txt
```

Platform-specific packages (`PyAudioWPatch` on Windows, `pyaudio` on macOS) are selected automatically through environment markers in `requirements.txt`.

## Usage

1. Open **Glyphix** on the phone and go to the **Audio** tab.
2. Select **Desktop Companion (UDP)** as the capture source.
3. On the computer, start a companion:

   ```bash
   python desktop_companion.py              # Windows, default GUI
   python desktop_companion.py --material   # Windows, KivyMD UI
   python desktop_companion_macos.py        # macOS
   ```

The companion broadcasts on the local network to find the phone, then starts streaming.

## Network details

| Purpose | Protocol and port |
| :--- | :--- |
| Phone discovery | UDP `12348` |
| Audio stream | UDP `12347` |

If discovery fails, check that both devices are on the same subnet, that Wi-Fi client isolation is off, and that your firewall allows both ports. Packets that are shorter than one sample or malformed are ignored.

## Troubleshooting

- **No audio detected**: confirm something is actually playing on the default output device, since loopback capture follows it.
- **Phone not found**: restart the companion after the phone's app is on the Audio tab, and verify the ports above are open.
- **RGB flicker while typing** (WPF variant): enable the **Typing Suppression** option, which is on by default.
- **No system audio on macOS**: install BlackHole 2ch and select it as the output device, as the app's log reminds you.
