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

function createChromeForReuse(overrides = {}) {
  const tabs = new Map();
  const listeners = new Set();
  const createCalls = [];
  const updateCalls = [];
  const queryCalls = [];
  const removeCalls = [];
  const reloadCalls = [];
  let nextTabId = Number.isInteger(overrides.nextTabId) ? overrides.nextTabId : 700;

  for (const tab of overrides.tabs || []) {
    tabs.set(tab.id, {
      windowId: 1,
      status: 'complete',
      active: false,
      ...tab,
    });
  }

  function fireComplete(tabId) {
    const tab = tabs.get(tabId);
    if (!tab) {
      return;
    }
    tab.status = 'complete';
    for (const listener of listeners) {
      listener(tabId, { status: 'complete' }, { ...tab });
    }
  }

  return {
    chrome: {
      tabs: {
        query: async (queryInfo = {}) => {
          queryCalls.push(queryInfo);
          return Array.from(tabs.values(), (tab) => ({ ...tab }));
        },
        remove: async (tabIds) => {
          removeCalls.push(tabIds);
          for (const tabId of Array.isArray(tabIds) ? tabIds : [tabIds]) {
            tabs.delete(tabId);
          }
        },
        create: async (createProperties = {}) => {
          createCalls.push(createProperties);
          const tab = {
            id: nextTabId,
            windowId: 1,
            status: 'loading',
            active: false,
            ...createProperties,
          };
          nextTabId += 1;
          tabs.set(tab.id, tab);
          return { ...tab };
        },
        get: async (tabId) => {
          const tab = tabs.get(tabId);
          if (!tab) {
            throw new Error(`Unknown tab: ${tabId}`);
          }
          return { ...tab };
        },
        update: async (tabId, updateProperties = {}) => {
          updateCalls.push({ tabId, updateProperties });
          const existingTab = tabs.get(tabId);
          if (!existingTab) {
            throw new Error(`Unknown tab: ${tabId}`);
          }
          const nextTab = {
            ...existingTab,
            ...updateProperties,
          };
          if (Object.prototype.hasOwnProperty.call(updateProperties, 'url')) {
            nextTab.status = 'loading';
            setTimeout(() => fireComplete(tabId), 0);
          }
          tabs.set(tabId, nextTab);
          return { ...nextTab };
        },
        reload: async (tabId) => {
          reloadCalls.push(tabId);
          const existingTab = tabs.get(tabId);
          if (!existingTab) {
            throw new Error(`Unknown tab: ${tabId}`);
          }
          tabs.set(tabId, {
            ...existingTab,
            status: 'loading',
          });
          setTimeout(() => fireComplete(tabId), 0);
        },
        onUpdated: {
          addListener: (listener) => {
            listeners.add(listener);
          },
          removeListener: (listener) => {
            listeners.delete(listener);
          },
        },
      },
    },
    createCalls,
    updateCalls,
    queryCalls,
    removeCalls,
    reloadCalls,
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

test('reuseOrCreateTab applies the current fingerprint when force-creating a new tab', async () => {
  const session = buildFingerprintSession();
  const chromeHarness = createChromeForReuse({ nextTabId: 701 });
  const { runtime, applyCalls, getState } = createRuntime({
    chrome: chromeHarness.chrome,
    state: {
      browserFingerprintEnabled: true,
    },
    getOrCreateSessionFingerprintForState: async () => session,
  });

  const tabId = await runtime.reuseOrCreateTab('signup-page', 'https://example.com/signup', {
    forceNew: true,
  });

  assert.equal(tabId, 701);
  assert.deepEqual(chromeHarness.createCalls, [
    { url: 'https://example.com/signup', active: true },
  ]);
  assert.deepEqual(applyCalls, [[
    701,
    session.sessionFingerprint,
    {
      fingerprintSessionId: 'seed-runtime',
      source: 'signup-page',
    },
  ]]);
  assert.equal(getState().browserFingerprintAppliedTabs['701'].fingerprintSessionId, 'seed-runtime');
});

test('reuseOrCreateTab applies the current fingerprint when reusing a tab for a new url', async () => {
  const session = buildFingerprintSession();
  const chromeHarness = createChromeForReuse({
    tabs: [{
      id: 42,
      url: 'https://example.com/old',
      active: false,
    }],
  });
  const { runtime, applyCalls, getState } = createRuntime({
    chrome: chromeHarness.chrome,
    state: {
      browserFingerprintEnabled: true,
      tabRegistry: {
        'signup-page': {
          tabId: 42,
          ready: true,
        },
      },
    },
    getOrCreateSessionFingerprintForState: async () => session,
  });

  const tabId = await runtime.reuseOrCreateTab('signup-page', 'https://example.com/new');

  assert.equal(tabId, 42);
  assert.deepEqual(chromeHarness.updateCalls, [{
    tabId: 42,
    updateProperties: {
      url: 'https://example.com/new',
      active: true,
    },
  }]);
  assert.deepEqual(applyCalls, [[
    42,
    session.sessionFingerprint,
    {
      fingerprintSessionId: 'seed-runtime',
      source: 'signup-page',
    },
  ]]);
  assert.equal(getState().browserFingerprintAppliedTabs['42'].fingerprintSessionId, 'seed-runtime');
});

test('reuseOrCreateTab applies the current fingerprint when creating a fresh tab without forceNew', async () => {
  const session = buildFingerprintSession();
  const chromeHarness = createChromeForReuse({ nextTabId: 805 });
  const { runtime, applyCalls, getState } = createRuntime({
    chrome: chromeHarness.chrome,
    state: {
      browserFingerprintEnabled: true,
    },
    getOrCreateSessionFingerprintForState: async () => session,
  });

  const tabId = await runtime.reuseOrCreateTab('plus-checkout', 'https://example.com/checkout');

  assert.equal(tabId, 805);
  assert.deepEqual(chromeHarness.createCalls, [
    { url: 'https://example.com/checkout', active: true },
  ]);
  assert.deepEqual(applyCalls, [[
    805,
    session.sessionFingerprint,
    {
      fingerprintSessionId: 'seed-runtime',
      source: 'plus-checkout',
    },
  ]]);
  assert.equal(getState().browserFingerprintAppliedTabs['805'].fingerprintSessionId, 'seed-runtime');
});
