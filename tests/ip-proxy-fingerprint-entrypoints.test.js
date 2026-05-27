const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadIpProxyCoreSandbox(overrides = {}) {
  const filePath = path.join(__dirname, '..', 'background', 'ip-proxy-core.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ ip: '198.51.100.10', region: 'US' }),
    }),
    getState: async () => ({}),
    ...overrides,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(source, sandbox, { filename: filePath });
  return sandbox;
}

test('ip proxy page-context probe creates tabs through createTabWithFingerprint', async () => {
  const helperCalls = [];
  const sandbox = loadIpProxyCoreSandbox({
    chrome: {
      scripting: {
        executeScript: async () => ([{
          result: {
            text: JSON.stringify({ ip: '203.0.113.10', region: 'US' }),
            url: 'https://chatgpt.com/cdn-cgi/trace',
          },
        }]),
      },
      tabs: {
        create: async () => {
          throw new Error('chrome.tabs.create should not be used when createTabWithFingerprint is provided');
        },
        get: async () => ({
          id: 7001,
          url: 'https://chatgpt.com/cdn-cgi/trace',
          status: 'complete',
        }),
        remove: async () => {},
        update: async () => {
          return { id: 7001 };
        },
      },
      webNavigation: {
        onErrorOccurred: {
          addListener: () => {},
          removeListener: () => {},
        },
      },
    },
    createTabWithFingerprint: async (source, createProperties, options) => {
      helperCalls.push({ source, createProperties, options });
      return { id: 7001, ...createProperties };
    },
    navigateTabWithFingerprint: async () => ({ id: 7001 }),
    waitForTabComplete: async (tabId) => ({ id: tabId }),
  });

  const errors = [];
  const result = await sandbox.detectProxyExitInfoByPageContext({
    errors,
    timeoutMs: 3000,
    state: { automationWindowId: 99 },
  });

  assert.equal(result.ip, '203.0.113.10');
  assert.equal(result.region, 'US');
  assert.equal(helperCalls.length, 1);
  assert.equal(helperCalls[0].source, 'ip-proxy-probe');
  assert.equal(helperCalls[0].createProperties.active, false);
  assert.match(helperCalls[0].createProperties.url, /^https:\/\/example\.com\/\?_multipage_proxy_probe=/);
  assert.equal(helperCalls[0].options.state.automationWindowId, 99);
});

test('ip proxy navigation probe reuses navigateTabWithFingerprint for probe urls', async () => {
  const navigateCalls = [];
  const sandbox = loadIpProxyCoreSandbox({
    chrome: {
      scripting: {
        executeScript: async () => ([{
          result: {
            text: JSON.stringify({ ip: '198.51.100.23', region: 'JP' }),
            url: 'https://ifconfig.me/all.json',
          },
        }]),
      },
      tabs: {
        get: async () => ({
          id: 8123,
          status: 'complete',
        }),
        update: async () => {
          throw new Error('chrome.tabs.update should not be used when navigateTabWithFingerprint is provided');
        },
      },
    },
    navigateTabWithFingerprint: async (source, tabId, url, options) => {
      navigateCalls.push({ source, tabId, url, options });
      return { id: tabId, url, ...options };
    },
    waitForTabComplete: async (tabId) => ({ id: tabId }),
  });

  const result = await sandbox.probeExitInfoByTabNavigationWithEndpoints(
    8123,
    2500,
    [],
    ['https://ifconfig.me/all.json']
  );

  assert.equal(result.ip, '198.51.100.23');
  assert.equal(result.region, 'JP');
  assert.equal(navigateCalls.length, 1);
  assert.equal(navigateCalls[0].source, 'ip-proxy-probe');
  assert.equal(navigateCalls[0].tabId, 8123);
  assert.equal(navigateCalls[0].options.active, false);
  assert.match(navigateCalls[0].url, /^https:\/\/ifconfig\.me\/all\.json\?_multipage_proxy_probe=/);
});

test('ip proxy baseline navigation reuses navigateTabWithFingerprint', async () => {
  const navigateCalls = [];
  let readCount = 0;
  const sandbox = loadIpProxyCoreSandbox({
    chrome: {
      scripting: {
        executeScript: async () => {
          readCount += 1;
          return [{
            result: readCount === 1
              ? {
                text: JSON.stringify({ ip: '198.51.100.40', region: 'DE' }),
                url: 'https://example.com/?_multipage_proxy_probe=1',
              }
              : {
                text: JSON.stringify({ ip: '203.0.113.77', country: 'DE' }),
                url: 'https://ifconfig.co/json?_multipage_proxy_baseline=1',
              },
          }];
        },
      },
      tabs: {
        create: async () => {
          throw new Error('chrome.tabs.create should not be used when createTabWithFingerprint is provided');
        },
        get: async () => ({
          id: 9001,
          url: 'https://example.com/?_multipage_proxy_probe=1',
          status: 'complete',
        }),
        remove: async () => {},
        update: async () => {
          throw new Error('chrome.tabs.update should not be used when navigateTabWithFingerprint is provided');
        },
      },
      webNavigation: {
        onErrorOccurred: {
          addListener: () => {},
          removeListener: () => {},
        },
      },
    },
    createTabWithFingerprint: async () => ({
      id: 9001,
      url: 'https://example.com/?_multipage_proxy_probe=1',
      active: false,
    }),
    navigateTabWithFingerprint: async (source, tabId, url, options) => {
      navigateCalls.push({ source, tabId, url, options });
      return { id: tabId, url, ...options };
    },
    waitForTabComplete: async (tabId) => ({ id: tabId }),
  });

  const result = await sandbox.detectProxyExitInfoByPageContext({
    errors: [],
    timeoutMs: 3000,
  });

  assert.equal(result.ip, '198.51.100.40');
  assert.equal(result.baselineIp, '203.0.113.77');
  assert.equal(navigateCalls.length, 1);
  assert.equal(navigateCalls[0].source, 'ip-proxy-probe');
  assert.equal(navigateCalls[0].tabId, 9001);
  assert.equal(navigateCalls[0].options.active, false);
  assert.match(navigateCalls[0].url, /^https:\/\/ifconfig\.co\/json\?_multipage_proxy_baseline=/);
});
