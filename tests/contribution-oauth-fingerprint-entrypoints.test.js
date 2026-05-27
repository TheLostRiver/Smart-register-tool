const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadContributionOAuthModule() {
  const filePath = path.join(__dirname, '..', 'background', 'contribution-oauth.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
    fetch: async () => ({
      ok: true,
      json: async () => ({}),
    }),
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(source, sandbox, { filename: filePath });
  return {
    moduleApi: sandbox.MultiPageBackgroundContributionOAuth,
    sandbox,
  };
}

test('contribution oauth opens a fresh auth tab through createTabWithFingerprint', async () => {
  const { moduleApi, sandbox } = loadContributionOAuthModule();
  const createCalls = [];
  const setStateCalls = [];
  let currentState = {
    contributionMode: true,
    contributionAuthTabId: 0,
    contributionSessionId: '',
    contributionStatus: '',
    contributionNickname: 'tester',
    contributionQq: '123456',
    contributionSource: 'sub2api',
    contributionTargetGroupName: 'codex-pool',
    email: 'tester@example.com',
  };
  let fetchCallCount = 0;

  const manager = moduleApi.createContributionOAuthManager({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    chrome: {
      tabs: {
        create: async () => {
          throw new Error('chrome.tabs.create should not be used when createTabWithFingerprint is provided');
        },
        update: async () => {
          throw new Error('chrome.tabs.update should not be used for a fresh contribution auth tab');
        },
      },
      webNavigation: {
        onCommitted: { addListener: () => {} },
        onHistoryStateUpdated: { addListener: () => {} },
      },
    },
    closeLocalhostCallbackTabs: async () => 0,
    apiBaseUrl: 'https://example.com',
    createTabWithFingerprint: async (source, createProperties) => {
      createCalls.push({ source, createProperties });
      return {
        id: 321,
        url: createProperties.url,
        active: createProperties.active,
      };
    },
    fetchImpl: (...args) => sandbox.fetch(...args),
    getState: async () => currentState,
    queryTabsInAutomationWindow: async () => [],
    setState: async (updates = {}) => {
      setStateCalls.push(updates);
      currentState = { ...currentState, ...updates };
      return currentState;
    },
  });

  sandbox.fetch = async () => {
    fetchCallCount += 1;
    if (fetchCallCount === 1) {
      return {
        ok: true,
        json: async () => ({
          session_id: 'session-1',
          auth_url: 'https://example.com/contribution/auth?state=abc',
          state: 'abc',
          status: 'started',
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        status: 'started',
      }),
    };
  };

  await manager.startContributionFlow();

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].source, 'contribution-auth');
  assert.equal(createCalls[0].createProperties.url, 'https://example.com/contribution/auth?state=abc');
  assert.equal(createCalls[0].createProperties.active, true);
  assert.equal(setStateCalls.some((updates) => updates.contributionAuthTabId === 321), true);
});

test('contribution oauth reuses an existing auth tab through navigateTabWithFingerprint', async () => {
  const { moduleApi, sandbox } = loadContributionOAuthModule();
  const navigateCalls = [];
  const setStateCalls = [];
  let currentState = {
    contributionMode: true,
    contributionAuthTabId: 777,
    contributionSessionId: 'session-2',
    contributionAuthUrl: 'https://example.com/contribution/auth?state=reuse',
    contributionAuthState: 'reuse',
    contributionStatus: 'started',
    contributionNickname: 'tester',
    contributionQq: '123456',
    contributionSource: 'sub2api',
    contributionTargetGroupName: 'codex-pool',
    email: 'tester@example.com',
  };

  const manager = moduleApi.createContributionOAuthManager({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    chrome: {
      tabs: {
        create: async () => {
          throw new Error('chrome.tabs.create should not be used when reusing an existing auth tab');
        },
        update: async () => {
          throw new Error('chrome.tabs.update should not be used when navigateTabWithFingerprint is provided');
        },
      },
      webNavigation: {
        onCommitted: { addListener: () => {} },
        onHistoryStateUpdated: { addListener: () => {} },
      },
    },
    closeLocalhostCallbackTabs: async () => 0,
    apiBaseUrl: 'https://example.com',
    createTabWithFingerprint: async () => {
      throw new Error('createTabWithFingerprint should not be used when a preferred auth tab id exists');
    },
    fetchImpl: (...args) => sandbox.fetch(...args),
    getState: async () => currentState,
    navigateTabWithFingerprint: async (source, tabId, url, options) => {
      navigateCalls.push({ source, tabId, url, options });
      return {
        id: tabId,
        url,
        active: options?.active,
      };
    },
    queryTabsInAutomationWindow: async () => [],
    setState: async (updates = {}) => {
      setStateCalls.push(updates);
      currentState = { ...currentState, ...updates };
      return currentState;
    },
  });

  sandbox.fetch = async () => {
    return {
      ok: true,
      json: async () => ({
        status: 'started',
      }),
    };
  };

  await manager.startContributionFlow();

  assert.equal(navigateCalls.length, 1);
  assert.equal(navigateCalls[0].source, 'contribution-auth');
  assert.equal(navigateCalls[0].tabId, 777);
  assert.equal(navigateCalls[0].url, 'https://example.com/contribution/auth?state=reuse');
  assert.equal(navigateCalls[0].options.active, true);
  assert.equal(setStateCalls.some((updates) => updates.contributionAuthTabId === 777), true);
});
