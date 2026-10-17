# Security Policy

## Reporting a vulnerability

Please report security problems privately rather than in a public issue.

1. Use GitHub's **Report a vulnerability** option under the repository's **Security** tab (private vulnerability reporting), or
2. Contact the maintainer, Colm Lenehan, through the contact details on his [GitHub profile](https://github.com/colmlenehan-gh).

Include the affected component, the version or commit, clear reproduction steps, and the impact you expect. You can expect an acknowledgement within a few days. Please allow time for a fix before any public disclosure.

## Scope

In scope: the Android app, the desktop companions, the offline script, the website and the build workflows in this repository.

Areas that deserve particular care:

- **Desktop companion network listeners.** The companions listen on UDP ports `12347` and `12348` on all interfaces with no authentication, which is how LAN discovery works. Run them only on networks you trust.
- **`musicViz.py` downloads.** On first run it fetches `GlyphModder.py` and `zones.config` from GitHub without pinning a commit or verifying a checksum. Review what it downloads, or place your own copies beside the script.
- **Firebase configuration.** `app/google-services.json` is a client configuration file and is not a secret by itself, but restrict the associated API keys by package name and signature in the Firebase and Google Cloud consoles.

## Supported versions

Only the latest release and the current `main` branch receive fixes.

## Safe harbour

Good-faith research that follows this policy, avoids privacy violations and service disruption, and gives us reasonable time to respond will not be pursued.
