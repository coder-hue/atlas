# Atlas Browser

Atlas is an experimental, stripped Chromium browser for Apple silicon. It keeps
the Chromium security boundary and extension platform, removes visible browser
clutter and several heavyweight optional services, disables password/autofill
defaults, loads OpenAI's unmodified ChatGPT Web Store extension, and includes a
Pi-hole-style request blocker called Atlas Shield.

## Product boundary

Atlas keeps tabs, history, downloads, bookmarks, privacy/security controls,
appearance, search, settings, and Manifest V3 extensions. The source patch removes
or disables Widevine, remoting, SwiftShader, on-device model serving, media
remoting, Lens/Glic extras, PDF extras, and out-of-process printing. Password
saving, automatic sign-in, address autofill, and card autofill default to off.

The ChatGPT integration is **not an Atlas reimplementation**. Atlas uses OpenAI's
extension with the exact ID `hehggadaopoacecdllhhajmbjkdcmajg` and does not modify
or redistribute its CRX.

Atlas Shield uses Chromium's `declarativeNetRequest` engine for low-overhead ad and
tracker blocking. The generated ruleset contains up to 25,000 blocked domains and
explicit allow rules for OpenAI services. The older localhost DNS service remains
in this repository as an integration prototype, but the test browser does not use
its HTTP proxy.

## Build

The current patch is pinned to Chromium commit
`887c7b69d51a64063abccd31022ae072ccea3f78`.

1. Follow Chromium's macOS prerequisites and install `depot_tools`.
2. Fetch and sync Chromium at the pinned revision.
3. Generate Atlas Shield's rules:

   ```sh
   ./scripts/prepare-shield.sh
   ```

4. Apply the Atlas patch and compile:

   ```sh
   ./scripts/apply-and-build.sh /absolute/path/to/chromium/src
   ```

5. If OpenAI's ChatGPT extension is already installed in Chrome, launch Atlas:

   ```sh
   ./scripts/launch-atlas.sh /absolute/path/to/chromium/src
   ```

The first optimized Chromium build is large and slow. Later incremental builds are
substantially faster.

## Validate

```sh
node browser-profile/scripts/validate-profile.js
npm --prefix atlas-shield test
```

This is an early development build, not a signed or notarized release.
