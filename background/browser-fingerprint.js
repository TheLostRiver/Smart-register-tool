(function attachBackgroundBrowserFingerprint(root, factory) {
  const moduleApi = factory();
  root.MultiPageBackgroundBrowserFingerprint = moduleApi;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = moduleApi;
  }
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundBrowserFingerprintModule() {
  const REGION_PRESETS = Object.freeze({
    US: Object.freeze({
      language: 'en-US',
      languages: ['en-US', 'en'],
      timezone: 'America/New_York',
      voices: 'windows-en-us',
      fonts: 'windows-latin',
      mediaDevices: 'desktop-dual',
    }),
    JP: Object.freeze({
      language: 'ja-JP',
      languages: ['ja-JP', 'ja', 'en-US'],
      timezone: 'Asia/Tokyo',
      voices: 'windows-ja-jp',
      fonts: 'windows-cjk',
      mediaDevices: 'desktop-dual',
    }),
  });

  const SCREEN_PRESETS = Object.freeze([
    Object.freeze({ width: 1366, height: 768, dpr: 1, maxTouchPoints: 0 }),
    Object.freeze({ width: 1440, height: 900, dpr: 1, maxTouchPoints: 0 }),
    Object.freeze({ width: 1536, height: 864, dpr: 1.25, maxTouchPoints: 0 }),
    Object.freeze({ width: 1920, height: 1080, dpr: 1, maxTouchPoints: 0 }),
  ]);

  const CPU_PRESETS = Object.freeze([4, 8, 12, 16]);
  const MEMORY_PRESETS = Object.freeze([4, 8, 16, 32]);

  function createSeededNumber(seed = '') {
    let hash = 0;
    for (const char of String(seed)) {
      hash = ((hash << 5) - hash) + char.charCodeAt(0);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function pickFrom(list, seedValue, offset = 0) {
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error('Fingerprint preset list is empty.');
    }
    return list[(seedValue + offset) % list.length];
  }

  function normalizeRegion(regionHint = '') {
    const normalized = String(regionHint || '').trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(REGION_PRESETS, normalized)) {
      return normalized;
    }
    return 'US';
  }

  function normalizeColorScheme(value = '') {
    return String(value || '').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
  }

  function normalizeWebRtcMode(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return ['real', 'disabled', 'masked'].includes(normalized) ? normalized : 'real';
  }

  function createBrowserFingerprintModule(deps = {}) {
    const {
      now = () => Date.now(),
      cryptoRandomUuid = () => (
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'fp-' + Date.now()
      ),
    } = deps;

    function generateFingerprintSession(options = {}) {
      const strategy = options && typeof options === 'object' ? (options.strategy || {}) : {};
      const generatedSeed = String(cryptoRandomUuid()).trim();
      const effectiveSeed = String(options.seed || generatedSeed).trim() || generatedSeed || 'fp-' + now();
      const seedValue = createSeededNumber(effectiveSeed);
      const region = normalizeRegion(options.regionHint);
      const regionPreset = REGION_PRESETS[region];
      const screenPreset = pickFrom(SCREEN_PRESETS, seedValue, 1);
      const hardwareConcurrency = pickFrom(CPU_PRESETS, seedValue, 2);
      const deviceMemory = pickFrom(MEMORY_PRESETS, seedValue, 3);
      const chromeMajor = 136 + (seedValue % 4);
      const chromeBuild = 7300 + (seedValue % 60);
      const chromePatch = 10 + (seedValue % 40);

      return {
        browserFingerprintSessionId: effectiveSeed,
        browserFingerprintGeneratedAt: now(),
        browserFingerprintAppliedTabs: {},
        sessionFingerprint: {
          identity: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/'
              + chromeMajor
              + '.0.'
              + chromeBuild
              + '.'
              + chromePatch
              + ' Safari/537.36',
            platform: 'Win32',
            language: regionPreset.language,
            languages: regionPreset.languages.slice(),
            timezone: regionPreset.timezone,
            colorScheme: normalizeColorScheme(strategy.browserFingerprintColorSchemeMode),
          },
          device: {
            screen: {
              width: screenPreset.width,
              height: screenPreset.height,
              availWidth: screenPreset.width,
              availHeight: screenPreset.height - 40,
              colorDepth: 24,
              pixelDepth: 24,
            },
            devicePixelRatio: screenPreset.dpr,
            hardwareConcurrency,
            deviceMemory,
            maxTouchPoints: screenPreset.maxTouchPoints,
          },
          privacy: {
            doNotTrack: strategy.browserFingerprintDoNotTrackEnabled ? '1' : '0',
            webrtcMode: normalizeWebRtcMode(strategy.browserFingerprintWebRtcMode),
          },
          profiles: {
            fontProfile: regionPreset.fonts,
            mediaDevicesProfile: regionPreset.mediaDevices,
            speechVoicesProfile: regionPreset.voices,
          },
          meta: {
            osFamily: 'windows',
            browserFamily: 'chrome',
            region,
            seed: effectiveSeed,
          },
        },
      };
    }

    return {
      generateFingerprintSession,
    };
  }

  return {
    createBrowserFingerprintModule,
  };
});
