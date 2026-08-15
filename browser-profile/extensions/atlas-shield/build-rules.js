#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const extensionDirectory = __dirname;
const projectDirectory = path.resolve(extensionDirectory, '../../..');
const blocklistPath = path.join(
  projectDirectory,
  'atlas-shield/config/blocklist.txt',
);
const outputPath = path.join(extensionDirectory, 'rules.json');

const resourceTypes = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'media',
  'websocket',
  'other',
];

const protectedDomains = [
  'chatgpt.com',
  'openai.com',
  'oaistatic.com',
  'oaiusercontent.com',
];

function normalizeDomain(line) {
  const content = line.replace(/#.*/, '').trim().toLowerCase();
  if (!content) return null;

  const fields = content.split(/\s+/);
  const candidate = fields.length > 1 ? fields[fields.length - 1] : fields[0];
  if (candidate === 'localhost' || candidate.endsWith('.localhost')) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]+$/.test(candidate)) {
    return null;
  }
  return candidate;
}

const domains = [
  ...new Set(
    fs.readFileSync(blocklistPath, 'utf8')
      .split(/\r?\n/)
      .map(normalizeDomain)
      .filter(Boolean),
  ),
]
  .filter(domain => !protectedDomains.some(
    protectedDomain => domain === protectedDomain || domain.endsWith(`.${protectedDomain}`),
  ))
  .sort()
  .slice(0, 25000);

const rules = protectedDomains.map((domain, index) => ({
  id: index + 1,
  priority: 2,
  action: {type: 'allow'},
  condition: {
    urlFilter: `||${domain}^`,
    resourceTypes,
  },
}));

domains.forEach((domain, index) => {
  rules.push({
    id: protectedDomains.length + index + 1,
    priority: 1,
    action: {type: 'block'},
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes,
    },
  });
});

fs.writeFileSync(outputPath, `${JSON.stringify(rules, null, 2)}\n`);
console.log(JSON.stringify({rules: rules.length, blockedDomains: domains.length}));
