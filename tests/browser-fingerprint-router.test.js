const test = require('node:test');
const assert = require('node:assert/strict');

require('../background/message-router.js');

const { createMessageRouter } = globalThis.MultiPageBackgroundMessageRouter;

function createRouter(overrides = {}) {
  const setStateCalls = [];
  const startAutoRunLoopCalls = [];
  const addLogCalls = [];
  let state = {
    browserFingerprintEnabled: false,
    browserFingerprintSessionId: '',
    browserFingerprintGeneratedAt: 0,
    browserFingerprintAppliedTabs: {},
    sessionFingerprint: null,
    ipProxyAppliedExitRegion: '',
    ipProxyRegion: '',
    ...overrides.state,
  };

  const deps = {
    addLog: async (...args) => {
      addLogCalls.push(args);
    },
    appendAccountRunRecord: async () => {},
    batchUpdateLuckmailPurchases: async () => {},
    buildLocalhostCleanupPrefix: () => '',
    buildLuckmailSessionSettingsPayload: () => ({}),
    buildPersistentSettingsPayload: (payload) => payload || {},
    broadcastDataUpdate: () => {},
    applyIpProxySettingsFromState: async () => {},
    cancelScheduledAutoRun: async () => false,
    checkIcloudSession: async () => ({ ok: true }),
    clearAccountRunHistory: async () => {},
    deleteAccountRunHistoryRecords: async () => {},
    clearAutoRunTimerAlarm: async () => {},
    clearFreeReusablePhoneActivation: async () => ({ ok: true }),
    clearLuckmailRuntimeState: async () => {},
    clearStopRequest: () => {},
    closeLocalhostCallbackTabs: async () => {},
    closeTabsByUrlPrefix: async () => {},
    completeNodeFromBackground: async () => {},
    deleteHotmailAccount: async () => {},
    deleteHotmailAccounts: async () => {},
    deleteIcloudAlias: async () => ({ ok: true }),
    deleteUsedIcloudAliases: async () => ({ ok: true }),
    disableUsedLuckmailPurchases: async () => ({ ok: true }),
    doesNodeUseCompletionSignal: () => false,
    ensureMail2925MailboxSession: async () => {},
    ensureManualInteractionAllowed: async () => state,
    executeNode: async () => {},
    executeNodeViaCompletionSignal: async () => {},
    exportCurrentSessionJson: async () => ({}),
    exportSettingsBundle: async () => ({}),
    fetchGeneratedEmail: async () => '',
    refreshGpcCardBalance: async () => ({}),
    finalizePhoneActivationAfterSuccessfulFlow: async () => {},
    finalizeStep3Completion: async () => {},
    finalizeIcloudAliasAfterSuccessfulFlow: async () => {},
    findHotmailAccount: async () => null,
    findPayPalAccount: async () => null,
    flushCommand: () => {},
    getCurrentLuckmailPurchase: () => null,
    getCurrentPayPalAccount: () => null,
    getCurrentMail2925Account: () => null,
    getPendingAutoRunTimerPlan: () => null,
    getSourceLabel: (source = '') => source || 'unknown',
    getState: async () => state,
    getNodeDefinitionForState: () => null,
    getNodeIdsForState: () => [],
    getStepIdByNodeIdForState: () => null,
    getStepDefinitionForState: () => null,
    getStepIdsForState: () => [],
    getLastStepIdForState: () => null,
    getTabId: async () => null,
    getStopRequested: () => false,
    handleAutoRunLoopUnhandledError: async () => {},
    importSettingsBundle: async () => {},
    invalidateDownstreamAfterStepRestart: async () => {},
    isCloudflareSecurityBlockedError: () => false,
    isAutoRunLockedState: () => false,
    isHotmailProvider: () => false,
    isLocalhostOAuthCallbackUrl: () => false,
    isLuckmailProvider: () => false,
    isStopError: () => false,
    isTabAlive: async () => true,
    launchAutoRunTimerPlan: async () => false,
    ensureIpProxyAutoSyncAlarm: async () => {},
    clearIpProxyAutoSyncAlarm: async () => {},
    runIpProxyAutoSync: async () => {},
    listIcloudAliases: async () => [],
    listLuckmailPurchasesForManagement: async () => [],
    markCurrentCustomEmailPoolEntryUsed: async () => {},
    markCurrentRegistrationAccountUsed: async () => {},
    normalizeHotmailAccounts: (value) => value,
    normalizeMail2925Accounts: (value) => value,
    normalizePayPalAccounts: (value) => value,
    normalizeRunCount: (value) => Number(value) || 1,
    AUTO_RUN_TIMER_KIND_SCHEDULED_START: 'scheduled_start',
    notifyNodeComplete: () => {},
    notifyNodeError: () => {},
    patchMail2925Account: async () => {},
    patchHotmailAccount: async () => {},
    pollContributionStatus: async () => ({}),
    registerTab: async () => {},
    requestStop: async () => {},
    probeIpProxyExit: async () => null,
    handleCloudflareSecurityBlocked: async () => '',
    resetState: async () => {},
    resumeAutoRun: async () => true,
    scheduleAutoRun: async () => ({ ok: true }),
    selectLuckmailPurchase: async () => null,
    sleepWithStop: async () => {},
    switchIpProxy: async () => ({}),
    changeIpProxyExit: async () => ({}),
    setCurrentPayPalAccount: async () => {},
    setCurrentMail2925Account: async () => {},
    setCurrentHotmailAccount: async () => {},
    setContributionMode: async () => state,
    setEmailState: async () => {},
    setEmailStateSilently: async () => {},
    persistRegistrationEmailState: async () => {},
    setFreeReusablePhoneActivation: async () => ({ ok: true }),
    setSignupPhoneState: async () => {},
    setSignupPhoneStateSilently: async () => {},
    setIcloudAliasPreservedState: async () => ({ ok: true }),
    setIcloudAliasUsedState: async () => ({ ok: true }),
    setLuckmailPurchaseDisabledState: async () => ({ ok: true }),
    setLuckmailPurchasePreservedState: async () => ({ ok: true }),
    setLuckmailPurchaseUsedState: async () => ({ ok: true }),
    setPersistentSettings: async () => {},
    setState: async (updates = {}) => {
      setStateCalls.push(updates);
      state = { ...state, ...updates };
      return state;
    },
    setNodeStatus: async () => {},
    skipAutoRunCountdown: async () => false,
    skipNode: async () => ({ ok: true }),
    startContributionFlow: async () => state,
    startAutoRunLoop: (...args) => {
      startAutoRunLoopCalls.push(args);
    },
    deleteMail2925Account: async () => {},
    deleteMail2925Accounts: async () => {},
    syncHotmailAccounts: async () => [],
    syncPayPalAccounts: async () => [],
    testHotmailAccountMailAccess: async () => ({ ok: true }),
    upsertPayPalAccount: async () => {},
    upsertMail2925Account: async () => {},
    upsertHotmailAccount: async () => {},
    verifyHotmailAccount: async () => ({ ok: true }),
    validateAutoRunStart: () => ({ ok: true, errors: [] }),
    getOrCreateSessionFingerprintForState: overrides.getOrCreateSessionFingerprintForState,
    rerandomizeSessionFingerprintForState: overrides.rerandomizeSessionFingerprintForState,
    ...overrides.deps,
  };

  const router = createMessageRouter(deps);
  return {
    router,
    getState: () => state,
    setStateCalls,
    startAutoRunLoopCalls,
    addLogCalls,
  };
}

test('AUTO_RUN ensures per-run fingerprint session before starting loop', async () => {
  let getOrCreateCalls = 0;
  const { router, startAutoRunLoopCalls } = createRouter({
    state: {
      browserFingerprintEnabled: true,
      browserFingerprintLocaleMode: 'ip_based',
      browserFingerprintTimezoneMode: 'ip_based',
      ipProxyAppliedExitRegion: 'JP',
    },
    getOrCreateSessionFingerprintForState: async (state) => {
      getOrCreateCalls += 1;
      assert.equal(state.browserFingerprintEnabled, true);
      assert.equal(state.ipProxyAppliedExitRegion, 'JP');
      return {
        browserFingerprintSessionId: 'seed-router-auto-run',
        browserFingerprintGeneratedAt: 1716700000000,
        browserFingerprintAppliedTabs: {},
        sessionFingerprint: {
          identity: {
            userAgent: 'Mozilla/5.0',
            platform: 'Win32',
            language: 'ja-JP',
            languages: ['ja-JP', 'ja', 'en-US'],
            timezone: 'Asia/Tokyo',
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
            fontProfile: 'windows-cjk',
            mediaDevicesProfile: 'desktop-dual',
            speechVoicesProfile: 'windows-ja-jp',
          },
          meta: {
            osFamily: 'windows',
            browserFamily: 'chrome',
            region: 'JP',
            seed: 'seed-router-auto-run',
          },
        },
      };
    },
  });

  const result = await router.handleMessage({
    type: 'AUTO_RUN',
    payload: {
      totalRuns: 3,
      autoRunSkipFailures: true,
      autoRunRetryNonFreeTrial: false,
      autoRunRetryPaypalCallback: true,
      mode: 'continue',
    },
    source: 'sidepanel',
  }, {});

  assert.deepEqual(result, { ok: true });
  assert.equal(getOrCreateCalls, 1);
  assert.deepEqual(startAutoRunLoopCalls, [[
    3,
    {
      autoRunSkipFailures: true,
      autoRunRetryNonFreeTrial: false,
      autoRunRetryPaypalCallback: true,
      mode: 'continue',
    },
  ]]);
});

test('RERANDOMIZE_BROWSER_FINGERPRINT regenerates current run fingerprint session', async () => {
  let rerandomizeCalls = 0;
  const { router } = createRouter({
    state: {
      browserFingerprintEnabled: true,
      browserFingerprintSessionId: 'seed-old',
      browserFingerprintGeneratedAt: 1716600000000,
      sessionFingerprint: {
        meta: { seed: 'seed-old' },
      },
    },
    rerandomizeSessionFingerprintForState: async (state) => {
      rerandomizeCalls += 1;
      assert.equal(state.browserFingerprintSessionId, 'seed-old');
      return {
        browserFingerprintSessionId: 'seed-new',
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
            seed: 'seed-new',
          },
        },
      };
    },
  });

  const result = await router.handleMessage({
    type: 'RERANDOMIZE_BROWSER_FINGERPRINT',
    payload: {},
    source: 'sidepanel',
  }, {});

  assert.equal(rerandomizeCalls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.browserFingerprintSessionId, 'seed-new');
  assert.equal(result.browserFingerprintGeneratedAt, 1716700000000);
  assert.equal(result.sessionFingerprint.meta.seed, 'seed-new');
});
