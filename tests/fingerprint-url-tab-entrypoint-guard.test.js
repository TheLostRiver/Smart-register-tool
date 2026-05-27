const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const TARGET_FILES = [
  'background/contribution-oauth.js',
  'background/steps/create-plus-checkout.js',
  'background/steps/gopay-manual-confirm.js',
];

test('fingerprint entrypoint modules do not keep bare url tab create/update fallbacks', () => {
  const disallowedPatterns = [
    /chrome\.tabs\.create\(\{\s*url:/,
    /chrome\.tabs\.update\([^)]*,\s*\{\s*url:/,
  ];

  for (const relativePath of TARGET_FILES) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    for (const pattern of disallowedPatterns) {
      assert.equal(
        pattern.test(source),
        false,
        `${relativePath} still contains bare URL tab fallback: ${pattern}`
      );
    }
  }
});
