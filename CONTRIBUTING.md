# Contributing to Glyphix

Thank you for helping improve Glyphix. This guide covers how to set up each part of the project, what a good change looks like, and how to submit it.

## Before you start

- Search the [issue tracker](https://github.com/oliver-lebaigue-bright-bench/glyph-syncronator/issues) for an existing report or request.
- For larger changes, open an issue or ask on [Discord](https://discord.gg/cQ4hxNE8fX) first so the direction is agreed before you invest time.
- By contributing you agree that your work is released under the repository's [MIT licence](LICENSE).

## Development setup

| Area | Setup | Verify |
| :--- | :--- | :--- |
| Android app | JDK 17 and the Android SDK (compile 36, min 34) | `./gradlew assembleDebug` |
| Website | Node 22 and pnpm. `cd website && pnpm install` | `pnpm run check && pnpm run build` |
| Python scripts | Python 3.8+. `pip install -r requirements.txt` in the script's folder | `python -I -m py_compile <file>` and `python -m pyflakes <file>` |
| WPF companion | .NET 8 SDK on Windows | `dotnet build desktop-companion-wpf` |
| `zones.config` | Any editor | The file must stay valid JSON with a top-level `version` |

Nothing Phone (1) needs the Glyph debug interface enabled for development:

```bash
adb shell settings put global nt_glyph_interface_debug_enable 1
```

## Common tasks

**Adding a phone model.** Define its zones and frequency ranges in `zones.config` (see the [guide](Docs/ZONES_CONFIG.md)), then update `DeviceProfile.java` with the LED count and zone mapping, and test the visualization across the whole spectrum.

**Tuning a preset.** Edit the ranges in `zones.config`, adjust gain and smoothing in `AudioProcessor.java` if needed, and test with several genres. Every push that touches `zones.config` bumps its `version` automatically through a workflow, add `[skip-version]` to the commit message to prevent that.

**Working on the website.** `pnpm run dev` starts a hot-reloading server. Shared links and product facts live in `website/client/src/lib/site.ts`, so change them there rather than in individual pages.

## Pull requests

1. Branch from `main` and keep each pull request focused on one change.
2. Make sure the relevant checks above pass. CI runs the website build, Python lint and `zones.config` validation.
3. Describe what changed and why, and add screenshots for any UI change. Say which device and Android version you tested on.
4. Never commit secrets, signing keys, personal data or large binaries. Release APKs belong in GitHub Releases, not in the repository.
5. Update documentation and [CHANGELOG.md](CHANGELOG.md) when behaviour changes.

## Code style

- Kotlin and Java follow the conventions already used in the module you are editing.
- Python: no bare `except:`, close sockets and files with context managers, and avoid blocking the UI thread.
- TypeScript is `strict`. Keep animation-loop work out of React state, as `Home.tsx` does with refs and CSS variables.

## Reporting security issues

Do not open a public issue for a vulnerability. Follow the [security policy](SECURITY.md).
