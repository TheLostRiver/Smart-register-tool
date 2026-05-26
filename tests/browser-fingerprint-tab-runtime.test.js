const test = require('node:test');
const assert = require('node:assert/strict');

require('../background/tab-runtime.js');

const { createTabRuntime } = globalThis.MultiPageBackgroundTabRuntime;

function createRuntime(overrides = {}) {
  const addLogCalls = [];
  const setStateCalls = [];
  const applyCalls = [];
  let state = {
    browserFingerprintEnabled: false,
    browserFingerprintSessionId: '',
    browserFingerprintGeneratedAt: 0,
    browserFingerprintAppliedTabs: {},
    sessionFingerprint: null,
    ...overrides.state,
  };

  const runtime = createTabRuntime({
    addLog: async (...args) => {
      addLogCalls.push(args);
    },
    chrome: overrides.chrome || {},
    getSourceLabel: (source = '') => source || 'unknown',
    getState: async () => state,
    isLocalhostOAuthCallbackUrl: () => false,
    isRetryableContentScriptTransportError: () => false,
    LOG_PREFIX: '[test:tab-runtime]',
    matchesSourceUrlFamily: () => false,
    setState: async (updates = {}) => {
      setStateCalls.push(updates);
      state = { ...state, ...updates };
      return state;
    },
    sleepWithStop: async () => {},
    STOP_ERROR_MESSAGE: 'stopped',
    throwIfStopped: () => {},
    getOrCreateSessionFingerprintForState: overrides.getOrCreateSessionFingerprintForState,
    applyFingerprintToTab: async (...args) => {
      applyCalls.push(args);
      if (typeof overrides.applyFingerprintToTab === 'function') {
        return overrides.applyFingerprintToTab(...args);
      }
      return {
        tabId: args[0],
        source: args[2]?.source || 'unknown',
        fingerprintSessionId: args[2]?.fingerprintSessionId || '',
        appliedAt: 1716700000000,
      };
    },
  });

  return {
    runtime,
    addLogCalls,
    setStateCalls,
    applyCalls,
    getState: () => state,
  };
}

function buildFingerprintSession(overrides = {}) {
  return {
    browserFingerprintSessionId: 'seed-runtime',
    browserFingerprintGeneratedAt: 1716700000000,
    browserFingerprintAppliedTabs: {},
    sessionFingerprint: {
      identity: {
        userAgent: 'Mozilla/5.0',
        platform: 'Win32',
        language: 'en-US',
        languages: ['en-US', 'en'],
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
        webrtcMode: 'masked',
      },
      profiles: {
        fontProfile: 'windows-latin',
        mediaDevicesProfile: 'desktop-dual',
        speechVoicesProfile: 'windows-en-us',
      },
      meta: {
        osFamily: 'windows',
        browserFamily: 'chrome',
        region: 'US',
        seed: 'seed-runtime',
      },
    },
    ...overrides,
  };
}

test('ensureFingerprintAppliedForTab lazily creates and records the current run fingerprint', async () => {
  let getOrCreateCalls = 0;
  const session = buildFingerprintSession();
  const { runtime, applyCalls, setStateCalls, addLogCalls, getState } = createRuntime({
    state: {
      browserFingerprintEnabled: true,
    },
    getOrCreateSessionFingerprintForState: async (state) => {
      getOrCreateCalls += 1;
      assert.equal(state.browserFingerprintEnabled, true);
      return session;
    },
  });

  const result = await runtime.ensureFingerprintAppliedForTab(123, {
    source: 'signup-page',
  });

  assert.equal(getOrCreateCalls, 1);
  assert.deepEqual(applyCalls, [[
    123,
    session.sessionFingerprint,
    {
      fingerprintSessionId: 'seed-runtime',
      source: 'signup-page',
    },
  ]]);
  assert.equal(result.fingerprintSessionId, 'seed-runtime');
  assert.equal(getState().browserFingerprintAppliedTabs['123'].fingerprintSessionId, 'seed-runtime');
  assert.equal(getState().browserFingerprintAppliedTabs['123'].source, 'signup-page');
  assert.ok(setStateCalls.some((entry) => Object.prototype.hasOwnProperty.call(entry, 'browserFingerprintAppliedTabs')));
  assert.deepEqual(addLogCalls.slice(-2), [
    ['[fingerprint] applied debugger overrides to tab 123', 'info'],
    ['[fingerprint] injected page fingerprint overrides to tab 123', 'info'],
  ]);
});

test('ensureFingerprintAppliedForTab skips reapplying the same session to the same tab', async () => {
  let getOrCreateCalls = 0;
  const session = buildFingerprintSession();
  const { runtime, applyCalls, setStateCalls } = createRuntime({
    state: {
      browserFingerprintEnabled: true,
      browserFingerprintSessionId: 'seed-runtime',
      browserFingerprintGeneratedAt: 1716700000000,
      browserFingerprintAppliedTabs: {
        '321': {
          fingerprintSessionId: 'seed-runtime',
          appliedAt: 1716700000000,
          source: 'signup-page',
        },
      },
      sessionFingerprint: session.sessionFingerprint,
    },
    getOrCreateSessionFingerprintForState: async () => {
      getOrCreateCalls += 1;
      return session;
    },
  });

  const result = await runtime.ensureFingerprintAppliedForTab(321, {
    source: 'signup-page',
  });

  assert.equal(getOrCreateCalls, 1);
  assert.deepEqual(applyCalls, []);
  assert.deepEqual(setStateCalls, []);
  assert.equal(result.alreadyApplied, true);
  assert.equal(result.fingerprintSessionId, 'seed-runtime');
  assert.equal(result.appliedAt, 1716700000000);
});

test('ensureFingerprintAppliedForTab logs and rethrows when fingerprint application fails', async () => {
  const session = buildFingerprintSession();
  const { runtime, setStateCalls, addLogCalls } = createRuntime({
    state: {
      browserFingerprintEnabled: true,
    },
    getOrCreateSessionFingerprintForState: async () => session,
    applyFingerprintToTab: async () => {
      throw new Error('cdp attach failed');
    },
  });

  await assert.rejects(
    () => runtime.ensureFingerprintAppliedForTab(456, { source: 'plus-checkout' }),
    /cdp attach failed/
  );

  assert.deepEqual(setStateCalls, []);
  assert.deepEqual(addLogCalls, [
    ['[fingerprint] fingerprint apply failed on tab 456: cdp attach failed', 'error'],
  ]);
});
