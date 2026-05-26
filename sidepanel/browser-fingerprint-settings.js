(function attachSidepanelBrowserFingerprintSettings(root, factory) {
  const moduleApi = factory();
  root.SidepanelBrowserFingerprintSettings = moduleApi;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = moduleApi;
  }
})(typeof self !== 'undefined' ? self : globalThis, function createSidepanelBrowserFingerprintSettingsModule() {
  function normalizeBoolean(value) {
    return Boolean(value);
  }

  function normalizeMode() {
    return 'per_run';
  }

  function normalizeRandomOrIpBased(value = '') {
    return String(value || '').trim().toLowerCase() === 'ip_based' ? 'ip_based' : 'random';
  }

  function normalizeWebRtcMode(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return ['real', 'disabled', 'masked'].includes(normalized) ? normalized : 'masked';
  }

  function normalizeProfileMode(value = '') {
    return String(value || '').trim().toLowerCase() === 'real' ? 'real' : 'random_profile';
  }

  function normalizeColorSchemeMode(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return ['light', 'dark', 'random'].includes(normalized) ? normalized : 'random';
  }

  function countAppliedTabsForSession(appliedTabs, sessionId) {
    if (!appliedTabs || typeof appliedTabs !== 'object' || Array.isArray(appliedTabs) || !sessionId) {
      return 0;
    }
    return Object.values(appliedTabs).filter((entry) => (
      entry
      && typeof entry === 'object'
      && String(entry.fingerprintSessionId || '').trim() === sessionId
    )).length;
  }

  function resolveRuntimeRegionSource(state = {}) {
    const exitRegion = String(state?.ipProxyAppliedExitRegion || '').trim().toUpperCase();
    if (exitRegion === 'US' || exitRegion === 'JP') {
      return 'exit_region';
    }
    const proxyRegion = String(state?.ipProxyRegion || '').trim().toUpperCase();
    if (proxyRegion === 'US' || proxyRegion === 'JP') {
      return 'proxy_region';
    }
    return 'default';
  }

  function createBrowserFingerprintSettingsModule() {
    function buildSettingsPayload(input = {}) {
      return {
        browserFingerprintEnabled: normalizeBoolean(input.enabled),
        browserFingerprintMode: normalizeMode(input.mode),
        browserFingerprintLocaleMode: normalizeRandomOrIpBased(input.localeMode),
        browserFingerprintTimezoneMode: normalizeRandomOrIpBased(input.timezoneMode),
        browserFingerprintWebRtcMode: normalizeWebRtcMode(input.webRtcMode),
        browserFingerprintFontsMode: normalizeProfileMode(input.fontsMode),
        browserFingerprintMediaDevicesMode: normalizeProfileMode(input.mediaDevicesMode),
        browserFingerprintSpeechVoicesMode: normalizeProfileMode(input.speechVoicesMode),
        browserFingerprintDoNotTrackEnabled: normalizeBoolean(input.doNotTrackEnabled),
        browserFingerprintColorSchemeMode: normalizeColorSchemeMode(input.colorSchemeMode),
      };
    }

    function buildRuntimeInfo(state = {}) {
      const sessionId = String(state?.browserFingerprintSessionId || '').trim();
      const generatedAt = Math.max(0, Number(state?.browserFingerprintGeneratedAt) || 0);
      const sessionFingerprint = state?.sessionFingerprint && typeof state.sessionFingerprint === 'object'
        ? state.sessionFingerprint
        : {};
      const identity = sessionFingerprint.identity && typeof sessionFingerprint.identity === 'object'
        ? sessionFingerprint.identity
        : {};
      const meta = sessionFingerprint.meta && typeof sessionFingerprint.meta === 'object'
        ? sessionFingerprint.meta
        : {};

      return {
        hasSession: Boolean(sessionId),
        sessionId,
        generatedAt,
        region: String(meta.region || '').trim().toUpperCase(),
        locale: String(identity.language || '').trim(),
        timezone: String(identity.timezone || '').trim(),
        appliedTabsCount: countAppliedTabsForSession(state?.browserFingerprintAppliedTabs, sessionId),
        regionSource: resolveRuntimeRegionSource(state),
      };
    }

    return {
      buildRuntimeInfo,
      buildSettingsPayload,
      normalizeColorSchemeMode,
      normalizeMode,
      normalizeProfileMode,
      normalizeRandomOrIpBased,
      normalizeWebRtcMode,
      resolveRuntimeRegionSource,
    };
  }

  return {
    createBrowserFingerprintSettingsModule,
  };
});
