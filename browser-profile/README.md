# Atlas minimal Chromium profile

This directory defines the product boundary for a stripped Chromium browser. It
preserves extension support and the security mechanisms that make arbitrary web
content safe, while removing account, password, payment, promotion, shopping, and
background convenience features.

## Why removal happens in two stages

The managed defaults in `policies/managed-policies.json` disable unwanted features
immediately and provide a behavior test for the first runnable browser. The source
code should only be removed after the project is attached to a pinned Chromium
revision and its browser tests pass. Chromium features share dependencies, and
deleting a component directory before tracing those dependencies can quietly break
settings pages, WebAuthn, form handling, or extensions.

The final source-level pass should:

1. Register the managed defaults in Atlas's policy/pref provider so users do not
   need enterprise enrollment.
2. Remove the corresponding settings routes, menus, commands, WebUI resources, and
   service factories.
3. Stop linking each disabled component from `chrome/browser/BUILD.gn` and related
   platform build files.
4. Keep `enable_extensions`, `enable_extensions_core`, and `enable_guest_view` true.
5. Keep `//extensions`, `//chrome/browser/extensions`, CRX verification, extension
   updating, permissions, Safe Browsing, sandboxing, and site isolation.
6. Run Chromium browser tests for extension loading, service workers, side panels,
   content scripts, native messaging, downloads, permissions, and browser restart.

## Extension compatibility boundary

Manifest V3 extensions, unpacked development extensions, CRX verification, content
scripts, extension service workers, side panels, and `declarativeNetRequest` remain
in scope. The extension identity API stays compiled for compatibility, although
Google-account-backed token flows may require product API credentials. Browser
account sign-in and sync remain disabled.

Atlas Shield's interface should be a component extension. ChatGPT must instead use
OpenAI's unmodified, Web Store-signed extension with ID
`hehggadaopoacecdllhhajmbjkdcmajg`; Atlas must not ship a replacement ChatGPT
client. The managed product defaults force-install that exact extension ID from the
Chrome Web Store update service. Updates continue to come from the same service.

Do not download and redistribute the CRX as an Atlas application resource. External
installation preserves OpenAI's publisher signature and avoids maintaining a stale
copy of the extension.

The listing currently describes other Chromium forks as unsupported. Atlas still
installs the extension as requested and leaves it unmodified.

## Validate the profile

```sh
node scripts/validate-profile.js
```

This catches accidental removal of extension/security requirements and accidental
re-enabling of the first privacy defaults.

## Chromium source patch

The reproducible source patch lives at `patches/atlas-chromium.patch` and targets
the pinned commit in `chromium/REVISION`. The GN configuration used for the Apple
silicon release build lives at `chromium/args.gn`.
