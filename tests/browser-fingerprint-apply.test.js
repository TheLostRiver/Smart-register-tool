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
  const expectedPayload = moduleApi.buildPageFingerprintPayload(fingerprintSession.sessionFingerprint);
  await moduleApi.applyFingerprintToTab(123, fingerprintSession.sessionFingerprint, {
    fingerprintSessionId: fingerprintSession.browserFingerprintSessionId,
    source: 'signup-page',
  });

  assert.deepEqual(debuggerCalls, [
    {
      method: 'Emulation.setUserAgentOverride',
      params: {
        userAgent: fingerprintSession.sessionFingerprint.identity.userAgent,
        platform: fingerprintSession.sessionFingerprint.identity.platform,
        acceptLanguage: fingerprintSession.sessionFingerprint.identity.languages.join(','),
      },
    },
    {
      method: 'Emulation.setTimezoneOverride',
      params: {
        timezoneId: fingerprintSession.sessionFingerprint.identity.timezone,
      },
    },
    {
      method: 'Emulation.setLocaleOverride',
      params: {
        locale: fingerprintSession.sessionFingerprint.identity.language,
      },
    },
  ]);
  assert.deepEqual(scriptCalls, [
    {
      target: { tabId: 123 },
      world: 'MAIN',
      args: [expectedPayload],
      func: scriptCalls[0].func,
    },
  ]);
  assert.equal(typeof scriptCalls[0].func, 'function');
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

test('buildPageFingerprintPayload fills safe defaults for missing optional fields', () => {
  const moduleApi = createBrowserFingerprintModule();
  const payload = moduleApi.buildPageFingerprintPayload({});

  assert.deepEqual(payload.navigator, {
    userAgent: '',
    platform: 'Win32',
    language: 'en-US',
    languages: ['en-US', 'en'],
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    doNotTrack: '0',
  });
  assert.deepEqual(payload.screen, {
    width: 1366,
    height: 768,
    availWidth: 1366,
    availHeight: 728,
    colorDepth: 24,
    pixelDepth: 24,
  });
  assert.deepEqual(payload.window, {
    devicePixelRatio: 1,
  });
  assert.deepEqual(payload.privacy, {
    doNotTrack: '0',
    webrtcMode: 'real',
  });
  assert.deepEqual(payload.profiles, {
    fontProfile: 'windows-latin',
    mediaDevicesProfile: 'desktop-dual',
    speechVoicesProfile: 'windows-en-us',
  });
  assert.deepEqual(payload.meta, {
    osFamily: 'windows',
    browserFamily: 'chrome',
    region: 'US',
    seed: '',
  });
});

test('applyFingerprintToTab fails fast when required identity fields are missing', async () => {
  const debuggerCalls = [];
  const scriptCalls = [];
  const moduleApi = createBrowserFingerprintModule({
    chrome: {
      debugger: {
        attach: async () => {
          debuggerCalls.push('attach');
        },
        detach: async () => {
          debuggerCalls.push('detach');
        },
        sendCommand: async () => {
          debuggerCalls.push('sendCommand');
        },
      },
      scripting: {
        executeScript: async () => {
          scriptCalls.push('executeScript');
          return [{ result: true }];
        },
      },
    },
  });

  await assert.rejects(
    () => moduleApi.applyFingerprintToTab(123, {
      identity: {
        userAgent: 'Mozilla/5.0',
        platform: 'Win32',
        languages: ['en-US'],
      },
    }),
    /Missing required fingerprint field: identity\.language/
  );

  assert.deepEqual(debuggerCalls, []);
  assert.deepEqual(scriptCalls, []);
});

test('applyFingerprintToTab reuses normalized languages for debugger and injected payload', async () => {
  const debuggerCalls = [];
  const scriptCalls = [];
  const moduleApi = createBrowserFingerprintModule({
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
  });

  await moduleApi.applyFingerprintToTab(321, {
    identity: {
      userAgent: 'Mozilla/5.0',
      platform: 'Win32',
      language: 'en-US',
      languages: [' en-US ', '', 42, 'en'],
      timezone: 'America/New_York',
    },
    device: {
      screen: {
        width: 1366,
        height: 768,
        availWidth: 1366,
        availHeight: 728,
        colorDepth: 24,
        pixelDepth: 24,
      },
      devicePixelRatio: 1,
      hardwareConcurrency: 8,
      deviceMemory: 8,
      maxTouchPoints: 0,
    },
    privacy: {
      doNotTrack: '0',
      webrtcMode: 'real',
    },
  });

  assert.equal(debuggerCalls[0].params.acceptLanguage, 'en-US,en');
  assert.deepEqual(scriptCalls[0].args[0].navigator.languages, ['en-US', 'en']);
});
