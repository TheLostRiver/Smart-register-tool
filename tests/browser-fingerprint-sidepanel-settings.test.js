const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBrowserFingerprintSettingsModule,
} = require('../sidepanel/browser-fingerprint-settings.js');

const settingsModule = createBrowserFingerprintSettingsModule();

test('buildSettingsPayload normalizes browser fingerprint sidepanel settings', () => {
  const payload = settingsModule.buildSettingsPayload({
    enabled: 1,
    mode: 'anything-else',
    localeMode: 'ip_based',
    timezoneMode: 'bad-value',
    webRtcMode: 'disabled',
    fontsMode: 'REAL',
    mediaDevicesMode: 'else',
    speechVoicesMode: 'random_profile',
    doNotTrackEnabled: 'yes',
    colorSchemeMode: 'dark',
  });

  assert.deepEqual(payload, {
    browserFingerprintEnabled: true,
    browserFingerprintMode: 'per_run',
    browserFingerprintLocaleMode: 'ip_based',
    browserFingerprintTimezoneMode: 'random',
    browserFingerprintWebRtcMode: 'disabled',
    browserFingerprintFontsMode: 'real',
    browserFingerprintMediaDevicesMode: 'random_profile',
    browserFingerprintSpeechVoicesMode: 'random_profile',
    browserFingerprintDoNotTrackEnabled: true,
    browserFingerprintColorSchemeMode: 'dark',
  });
});

test('buildRuntimeInfo summarizes current fingerprint session and region source', () => {
  const runtimeInfo = settingsModule.buildRuntimeInfo({
    browserFingerprintSessionId: 'seed-123',
    browserFingerprintGeneratedAt: 1716700000000,
    browserFingerprintAppliedTabs: {
      12: { fingerprintSessionId: 'seed-123', source: 'signup-page' },
      13: { fingerprintSessionId: 'seed-123', source: 'oauth-login' },
    },
    ipProxyAppliedExitRegion: 'JP',
    sessionFingerprint: {
      identity: {
        language: 'ja-JP',
        timezone: 'Asia/Tokyo',
      },
      meta: {
        region: 'JP',
      },
    },
  });

  assert.deepEqual(runtimeInfo, {
    hasSession: true,
    sessionId: 'seed-123',
    generatedAt: 1716700000000,
    region: 'JP',
    locale: 'ja-JP',
    timezone: 'Asia/Tokyo',
    appliedTabsCount: 2,
    regionSource: 'exit_region',
  });
});

test('buildRuntimeInfo falls back to default source when no session is active', () => {
  const runtimeInfo = settingsModule.buildRuntimeInfo({
    ipProxyRegion: '',
  });

  assert.deepEqual(runtimeInfo, {
    hasSession: false,
    sessionId: '',
    generatedAt: 0,
    region: '',
    locale: '',
    timezone: '',
    appliedTabsCount: 0,
    regionSource: 'default',
  });
});
