const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule(relativePath, exportName) {
  const filePath = path.join(__dirname, '..', ...relativePath.split('/'));
  const source = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(source, sandbox, { filename: filePath });
  return sandbox[exportName];
}

test('gopay manual confirm reopens checkout through createTabWithFingerprint when no live tab is available', async () => {
  const moduleApi = loadModule('background/steps/gopay-manual-confirm.js', 'MultiPageBackgroundGoPayManualConfirm');
  const helperCalls = [];
  const registerCalls = [];
  const setStateCalls = [];
  const broadcasts = [];
  const logs = [];

  const executor = moduleApi.createGoPayManualConfirmExecutor({
    addLog: async (...args) => {
      logs.push(args);
    },
    broadcastDataUpdate: (payload) => {
      broadcasts.push(payload);
    },
    chrome: {
      tabs: {
        create: async () => {
          throw new Error('chrome.tabs.create should not be used when createTabWithFingerprint is provided');
        },
        get: async () => null,
        update: async () => {},
      },
    },
    createTabWithFingerprint: async (source, createProperties) => {
      helperCalls.push({ source, createProperties });
      return { id: 555, ...createProperties };
    },
    getTabId: async () => null,
    isTabAlive: async () => false,
    registerTab: async (...args) => {
      registerCalls.push(args);
    },
    setState: async (payload) => {
      setStateCalls.push(payload);
    },
  });

  await executor.executeGoPayManualConfirm({
    plusCheckoutUrl: 'https://example.com/gopay-checkout',
  });

  assert.equal(helperCalls.length, 1);
  assert.equal(helperCalls[0].source, 'plus-checkout');
  assert.equal(helperCalls[0].createProperties.url, 'https://example.com/gopay-checkout');
  assert.equal(helperCalls[0].createProperties.active, true);
  assert.deepEqual(registerCalls, [['plus-checkout', 555]]);
  assert.equal(setStateCalls.length, 1);
  assert.equal(setStateCalls[0].plusCheckoutTabId, 555);
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0].plusCheckoutTabId, 555);
  assert.equal(logs.length, 1);
});

test('plus checkout create opens the initial chatgpt tab through createTabWithFingerprint before proceeding', async () => {
  const moduleApi = loadModule('background/steps/create-plus-checkout.js', 'MultiPageBackgroundPlusCheckoutCreate');
  const helperCalls = [];
  const registerCalls = [];
  const ensureReadyCalls = [];
  const sendCalls = [];
  const setStateCalls = [];
  const completeCalls = [];
  const chromeUpdateCalls = [];
  const navigateCalls = [];

  const executor = moduleApi.createPlusCheckoutCreateExecutor({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    chrome: {
      tabs: {
        create: async () => {
          throw new Error('chrome.tabs.create should not be used when createTabWithFingerprint is provided');
        },
        get: async (tabId) => ({
          id: tabId,
          url: 'https://chatgpt.com/checkout',
          status: 'complete',
        }),
        update: async (tabId, updateProperties) => {
          chromeUpdateCalls.push({ tabId, updateProperties });
          return { id: tabId, ...updateProperties };
        },
      },
    },
    completeNodeFromBackground: async (...args) => {
      completeCalls.push(args);
    },
    createTabWithFingerprint: async (source, createProperties) => {
      helperCalls.push({ source, createProperties });
      return { id: 777, ...createProperties };
    },
    enableHostedCheckoutAutomation: false,
    ensureContentScriptReadyOnTabUntilStopped: async (...args) => {
      ensureReadyCalls.push(args);
    },
    fetch: async () => ({
      ok: true,
      text: async () => '',
      json: async () => ({}),
    }),
    getState: async () => ({}),
    navigateTabWithFingerprint: async (...args) => {
      navigateCalls.push(args);
      return {
        id: args[1],
        url: args[2],
        status: 'complete',
      };
    },
    registerTab: async (...args) => {
      registerCalls.push(args);
    },
    sendTabMessageUntilStopped: async (_tabId, _source, message) => {
      sendCalls.push(message);
      return {
        checkoutUrl: 'https://example.com/checkout',
        country: 'US',
        currency: 'USD',
      };
    },
    setNodeStatus: async () => {},
    setState: async (payload) => {
      setStateCalls.push(payload);
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
    waitForTabCompleteUntilStopped: async () => {},
  });

  await executor.executePlusCheckoutCreate({
    plusPaymentMethod: 'gopay',
    plusHostedCheckoutIsFinalStep: false,
  });

  assert.equal(helperCalls.length, 1);
  assert.equal(helperCalls[0].source, 'plus-checkout');
  assert.equal(helperCalls[0].createProperties.url, 'https://chatgpt.com/');
  assert.equal(helperCalls[0].createProperties.active, true);
  assert.deepEqual(registerCalls, [['plus-checkout', 777]]);
  assert.equal(ensureReadyCalls.length >= 1, true);
  assert.equal(sendCalls.some((message) => message.type === 'CREATE_PLUS_CHECKOUT'), true);
  assert.equal(navigateCalls.length, 1);
  assert.equal(navigateCalls[0][0], 'plus-checkout');
  assert.equal(navigateCalls[0][1], 777);
  assert.equal(navigateCalls[0][2], 'https://example.com/checkout');
  assert.equal(navigateCalls[0][3].active, true);
  assert.equal(chromeUpdateCalls.length, 0);
  assert.equal(setStateCalls.some((payload) => payload.plusCheckoutTabId === 777), true);
  assert.equal(completeCalls.length, 1);
});
