const test = require('node:test');
const assert = require('node:assert/strict');

const { createBrowserFingerprintModule } = require('../background/browser-fingerprint.js');

test('fingerprint generator produces stable output for the same seed', () => {
  const moduleApi = createBrowserFingerprintModule({
    now: () => 1716700000000,
    cryptoRandomUuid: () => 'seed-stable',
  });

  const a = moduleApi.generateFingerprintSession({
    strategy: {
      browserFingerprintLocaleMode: 'random',
      browserFingerprintTimezoneMode: 'random',
      browserFingerprintColorSchemeMode: 'random',
      browserFingerprintWebRtcMode: 'masked',
      browserFingerprintDoNotTrackEnabled: true,
      browserFingerprintFontsMode: 'random_profile',
      browserFingerprintMediaDevicesMode: 'random_profile',
      browserFingerprintSpeechVoicesMode: 'random_profile',
    },
    regionHint: 'US',
    seed: 'seed-stable',
  });

  const b = moduleApi.generateFingerprintSession({
    strategy: {
      browserFingerprintLocaleMode: 'random',
      browserFingerprintTimezoneMode: 'random',
      browserFingerprintColorSchemeMode: 'random',
      browserFingerprintWebRtcMode: 'masked',
      browserFingerprintDoNotTrackEnabled: true,
      browserFingerprintFontsMode: 'random_profile',
      browserFingerprintMediaDevicesMode: 'random_profile',
      browserFingerprintSpeechVoicesMode: 'random_profile',
    },
    regionHint: 'US',
    seed: 'seed-stable',
  });

  assert.deepEqual(a, b);
  assert.equal(a.browserFingerprintSessionId, 'seed-stable');
  assert.equal(a.browserFingerprintGeneratedAt, 1716700000000);
  assert.deepEqual(a.browserFingerprintAppliedTabs, {});
});

test('fingerprint generator keeps windows chrome fields internally consistent', () => {
  const moduleApi = createBrowserFingerprintModule({
    now: () => 1716700000000,
    cryptoRandomUuid: () => 'seed-consistency',
  });

  const result = moduleApi.generateFingerprintSession({
    strategy: {
      browserFingerprintLocaleMode: 'random',
      browserFingerprintTimezoneMode: 'random',
      browserFingerprintColorSchemeMode: 'light',
      browserFingerprintWebRtcMode: 'real',
      browserFingerprintDoNotTrackEnabled: false,
      browserFingerprintFontsMode: 'random_profile',
      browserFingerprintMediaDevicesMode: 'random_profile',
      browserFingerprintSpeechVoicesMode: 'random_profile',
    },
    regionHint: 'US',
    seed: 'seed-consistency',
  });

  const fp = result.sessionFingerprint;
  assert.equal(fp.meta.osFamily, 'windows');
  assert.equal(fp.meta.browserFamily, 'chrome');
  assert.match(fp.identity.userAgent, /Windows NT 10\.0/);
  assert.match(fp.identity.userAgent, /Chrome\//);
  assert.equal(fp.identity.platform, 'Win32');
  assert.ok(Array.isArray(fp.identity.languages));
  assert.ok(fp.identity.languages.length >= 1);
  assert.ok(fp.device.screen.width >= 1280);
  assert.ok(fp.device.screen.height >= 720);
  assert.ok([4, 8, 12, 16].includes(fp.device.hardwareConcurrency));
  assert.ok([4, 8, 16, 32].includes(fp.device.deviceMemory));
  assert.ok(fp.device.maxTouchPoints >= 0);
});

test('fingerprint generator honors ip-based locale and timezone hint when region is available', () => {
  const moduleApi = createBrowserFingerprintModule({
    now: () => 1716700000000,
    cryptoRandomUuid: () => 'seed-region',
  });

  const result = moduleApi.generateFingerprintSession({
    strategy: {
      browserFingerprintLocaleMode: 'ip_based',
      browserFingerprintTimezoneMode: 'ip_based',
      browserFingerprintColorSchemeMode: 'dark',
      browserFingerprintWebRtcMode: 'disabled',
      browserFingerprintDoNotTrackEnabled: true,
      browserFingerprintFontsMode: 'random_profile',
      browserFingerprintMediaDevicesMode: 'random_profile',
      browserFingerprintSpeechVoicesMode: 'random_profile',
    },
    regionHint: 'JP',
    seed: 'seed-region',
  });

  assert.equal(result.sessionFingerprint.meta.region, 'JP');
  assert.equal(result.sessionFingerprint.identity.language, 'ja-JP');
  assert.equal(result.sessionFingerprint.identity.timezone, 'Asia/Tokyo');
  assert.equal(result.sessionFingerprint.privacy.webrtcMode, 'disabled');
  assert.equal(result.sessionFingerprint.privacy.doNotTrack, '1');
});
