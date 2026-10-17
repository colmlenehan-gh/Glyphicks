# Changelog

All notable changes to this repository are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- GitHub Actions `CI` workflow: website type-check and build, Python byte-compile and pyflakes, and `zones.config` validation.
- Dependabot configuration for Actions, npm, pip and Gradle.
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` and a pull request template.
- Route-level code splitting and separate animation and React chunks for the website, shrinking the entry bundle from about 501 kB to about 324 kB.
- Open Graph and Twitter card metadata for the website.

### Changed
- Rebranded the README as Glyphicks, a fork of Glyphix by Oliver Lebaigue, with a credits section. Download, badge, issue and documentation links now point to this repository.
- Rerouted the website links, the app's zones.config download, update check and About-screen repository button, plus the script docs, to this repository. Licence text and credit entries are unchanged.
- Rewrote the README: accurate links, architecture diagram, component table, build instructions and repository map.
- Rewrote the desktop companion README to match the real scripts, ports and flags.
- Pages deployment now builds the site and publishes `website/dist/public`, instead of uploading the unbuilt `website/` directory.
- Desktop companions and `musicViz.py`: narrowed bare `except:` handlers, closed sockets and files deterministically, ignore malformed UDP packets, use `os.replace` for cross-platform renames, and declared missing dependencies (`pynput`, `pyaudio`, `soundfile`).
- Website device list now numbers entries instead of repeating "01".

### Fixed
- Website source did not compile: `Home.tsx` and `index.css` were truncated. Both were reconstructed from the compiled production bundle, and the music player is mounted in the hero again.
- A TypeScript error in `audioAnalyzer.ts` under the current `Uint8Array` typings.
- Broken documentation links (zones guide, missing translations) and stray tool markup at the end of `.github/copilot-instructions.md`.

### Removed
- Renamed `FuckingThemes.kt` to `Themes.kt` (no code referenced the old file name).
- `README_ALT.md`, a near-duplicate of `README.md`.
