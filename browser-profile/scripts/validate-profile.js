#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = JSON.parse(await readFile(path.join(root, "minimal-features.json"), "utf8"));
const policies = JSON.parse(await readFile(path.join(root, "policies/managed-policies.json"), "utf8"));
const chatgpt = JSON.parse(await readFile(path.join(root, "extensions/chatgpt-official.json"), "utf8"));

const failures = [];
const keep = new Set(profile.keep);
const remove = new Set(profile.disableAndRemove);

for (const feature of keep) {
  if (remove.has(feature)) failures.push(`${feature} is both kept and removed`);
}

for (const flag of ["enable_extensions", "enable_extensions_core", "enable_guest_view"]) {
  if (profile.requiredBuildFlags[flag] !== true) failures.push(`${flag} must remain true`);
}

for (const feature of [
  "extension_installation",
  "extension_debugger_api",
  "extension_native_messaging",
  "extension_runtime",
  "extension_side_panel",
  "extension_updates",
  "safe_browsing",
  "process_sandbox",
  "site_isolation",
  "certificate_validation"
]) {
  if (!keep.has(feature)) failures.push(`Required browser capability is missing: ${feature}`);
}

const officialChatGptId = "hehggadaopoacecdllhhajmbjkdcmajg";
if (chatgpt.extensionId !== officialChatGptId) failures.push("The official ChatGPT extension ID changed");
if (chatgpt.publisher !== "OpenAI") failures.push("The ChatGPT extension publisher must be OpenAI");
if (chatgpt.distribution.bundleCrx !== false || chatgpt.distribution.modifyExtension !== false) {
  failures.push("The OpenAI extension must remain store-signed and unmodified");
}
if (!profile.integration.requiredExternalExtensions.includes(officialChatGptId)) {
  failures.push("The official ChatGPT extension is not required by the product profile");
}
if (profile.integration.builtInComponentExtensions.some((name) => name.includes("chatgpt"))) {
  failures.push("Do not replace the official ChatGPT extension with an Atlas component extension");
}
for (const capability of chatgpt.requiredBrowserCapabilities) {
  if (!keep.has(capability)) failures.push(`ChatGPT extension capability is missing: ${capability}`);
}

const requiredPolicyValues = {
  PasswordManagerEnabled: false,
  AutofillAddressEnabled: false,
  AutofillCreditCardEnabled: false,
  SyncDisabled: true,
  BrowserSignin: 0,
  BackgroundModeEnabled: false,
  MetricsReportingEnabled: false
};
for (const [name, expected] of Object.entries(requiredPolicyValues)) {
  if (policies[name] !== expected) failures.push(`${name} must equal ${JSON.stringify(expected)}`);
}

const expectedForceInstall = `${officialChatGptId};https://clients2.google.com/service/update2/crx`;
if (!policies.ExtensionInstallForcelist?.includes(expectedForceInstall)) {
  failures.push("The official ChatGPT extension is not configured for automatic Web Store installation");
}
if (Object.keys(policies).some((name) =>
  name.startsWith("ExtensionInstall") && name !== "ExtensionInstallForcelist"
)) {
  failures.push("Do not globally restrict user-installed extensions in the minimal profile");
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`ERROR: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({
    event: "valid",
    kept: keep.size,
    removed: remove.size,
    policies: Object.keys(policies).length,
    chatgptExtensionId: chatgpt.extensionId
  })}\n`);
}
