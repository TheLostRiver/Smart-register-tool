const test = require('node:test');
const assert = require('node:assert/strict');

const { createBrowserFingerprintModule } = require('../background/browser-fingerprint.js');

function buildSampleFingerprint() {
  const moduleApi = createBrowserFingerprintModule({
    now: () => 1716700000000,
    cryptoRandomUuid: () => 'apply-seed',
  });
  return moduleApi.generateFingerprintSession({
    strategy: {
      browserFingerprintLocaleMode: 'random',
      browserFingerprintTimezoneMode: 'random',
      browserFingerprintColorSchemeMode: 'light',
      browserFingerprintWebRtcMode: 'masked',
      browserFingerprintDoNotTrackEnabled: true,
      browserFingerprintFontsMode: 'random_profile',
      browserFingerprintMediaDevicesMode: 'random_profile',
      browserFingerprintSpeechVoicesMode: 'random_profile',
    },
    regionHint: 'US',
    seed: 'apply-seed',
  });
}

test('applyFingerprintToTab maps debugger commands for ua, locale, and timezone', async () => {
  const debuggerCalls = [];
  const scriptCalls = [];
  const moduleApi = createBrowserFingerprintModule({
    now: () => 1716700000000,
    chrome: {
      debugger: {
        attach: async () => {},
        detach: async () => {},
        sendCommand: async (_target, method, params) => {
          debuggerCalls.push({ method, params });
        },
      },
      scripting: {
        executeScript: async (payload) => {
          scriptCalls.push(payload);
          return [{ result: true }];
        },
      },
    },
    setState: async () => {},
    getState: async () => ({ runtimeState: {} }),
  });

  const fingerprintSession = buildSampleFingerprint();
  await moduleApi.applyFingerprintToTab(123, fingerprintSession.sessionFingerprint, {
    fingerprintSessionId: fingerprintSession.browserFingerprintSessionId,
    source: 'signup-page',
  });

  assert.ok(debuggerCalls.some((entry) => entry.method === 'Emulation.setUserAgentOverride'));
  assert.ok(debuggerCalls.some((entry) => entry.method === 'Emulation.setTimezoneOverride'));
  assert.ok(debuggerCalls.some((entry) => entry.method === 'Emulation.setLocaleOverride'));
  assert.equal(scriptCalls.length, 1);
});

test('buildPageFingerprintPayload exposes navigator and screen overrides for injection', () => {
  const moduleApi = createBrowserFingerprintModule();
  const fingerprintSession = buildSampleFingerprint();
  const payload = moduleApi.buildPageFingerprintPayload(fingerprintSession.sessionFingerprint);

  assert.equal(payload.navigator.platform, 'Win32');
  assert.equal(payload.navigator.language, 'en-US');
  assert.deepEqual(payload.navigator.languages, ['en-US', 'en']);
  assert.equal(payload.screen.width, fingerprintSession.sessionFingerprint.device.screen.width);
  assert.equal(payload.screen.height, fingerprintSession.sessionFingerprint.device.screen.height);
  assert.equal(payload.privacy.webrtcMode, 'masked');
});
