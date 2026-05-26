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

  function stringOrFallback(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
  }

  function finiteNumberOrFallback(value, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  function requireFingerprintString(value, fieldPath) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error('Missing required fingerprint field: ' + fieldPath);
    }
    return value;
  }

  function requireFingerprintLanguages(value, fieldPath) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error('Missing required fingerprint field: ' + fieldPath);
    }

    const normalizedLanguages = value
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (normalizedLanguages.length === 0) {
      throw new Error('Missing required fingerprint field: ' + fieldPath);
    }

    return normalizedLanguages;
  }

  function createBrowserFingerprintModule(deps = {}) {
    const {
      now = () => Date.now(),
      chrome = globalThis.chrome,
      cryptoRandomUuid = () => (
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'fp-' + Date.now()
      ),
    } = deps;

    function buildPageFingerprintPayload(sessionFingerprint = {}) {
      const identity = sessionFingerprint.identity || {};
      const device = sessionFingerprint.device || {};
      const screen = device.screen || {};
      const privacy = sessionFingerprint.privacy || {};
      const profiles = sessionFingerprint.profiles || {};
      const meta = sessionFingerprint.meta || {};

      return {
        navigator: {
          userAgent: stringOrFallback(identity.userAgent),
          platform: stringOrFallback(identity.platform, 'Win32'),
          language: stringOrFallback(identity.language, 'en-US'),
          languages: Array.isArray(identity.languages) && identity.languages.length
            ? identity.languages.slice()
            : ['en-US', 'en'],
          hardwareConcurrency: finiteNumberOrFallback(device.hardwareConcurrency, 8),
          deviceMemory: finiteNumberOrFallback(device.deviceMemory, 8),
          maxTouchPoints: finiteNumberOrFallback(device.maxTouchPoints),
          doNotTrack: privacy.doNotTrack === '1' ? '1' : '0',
        },
        screen: {
          width: finiteNumberOrFallback(screen.width, 1366),
          height: finiteNumberOrFallback(screen.height, 768),
          availWidth: finiteNumberOrFallback(screen.availWidth, 1366),
          availHeight: finiteNumberOrFallback(screen.availHeight, 728),
          colorDepth: finiteNumberOrFallback(screen.colorDepth, 24),
          pixelDepth: finiteNumberOrFallback(screen.pixelDepth, 24),
        },
        window: {
          devicePixelRatio: finiteNumberOrFallback(device.devicePixelRatio, 1),
        },
        privacy: {
          doNotTrack: privacy.doNotTrack === '1' ? '1' : '0',
          webrtcMode: normalizeWebRtcMode(privacy.webrtcMode),
        },
        profiles: {
          fontProfile: stringOrFallback(profiles.fontProfile, 'windows-latin'),
          mediaDevicesProfile: stringOrFallback(profiles.mediaDevicesProfile, 'desktop-dual'),
          speechVoicesProfile: stringOrFallback(profiles.speechVoicesProfile, 'windows-en-us'),
        },
        meta: {
          osFamily: stringOrFallback(meta.osFamily, 'windows'),
          browserFamily: stringOrFallback(meta.browserFamily, 'chrome'),
          region: stringOrFallback(meta.region, 'US'),
          seed: stringOrFallback(meta.seed),
        },
      };
    }

    async function applyFingerprintToTab(tabId, sessionFingerprint, options = {}) {
      if (!chrome || !chrome.debugger || !chrome.scripting) {
        throw new Error('Chrome debugger and scripting APIs are required to apply a fingerprint.');
      }

      const target = { tabId };
      const identity = sessionFingerprint && sessionFingerprint.identity ? sessionFingerprint.identity : {};
      const userAgent = requireFingerprintString(identity.userAgent, 'identity.userAgent');
      const platform = requireFingerprintString(identity.platform, 'identity.platform');
      const language = requireFingerprintString(identity.language, 'identity.language');
      const languages = requireFingerprintLanguages(identity.languages, 'identity.languages');
      const timezone = requireFingerprintString(identity.timezone, 'identity.timezone');
      const payload = buildPageFingerprintPayload(sessionFingerprint);

      await chrome.debugger.attach(target, '1.3');

      try {
        await chrome.debugger.sendCommand(target, 'Emulation.setUserAgentOverride', {
          userAgent,
          platform,
          acceptLanguage: languages.join(','),
        });

        await chrome.debugger.sendCommand(target, 'Emulation.setTimezoneOverride', {
          timezoneId: timezone,
        });

        await chrome.debugger.sendCommand(target, 'Emulation.setLocaleOverride', {
          locale: language,
        });

        await chrome.scripting.executeScript({
          target,
          world: 'MAIN',
          args: [payload],
          func: (pageFingerprintPayload) => {
            function overrideValue(targetObject, propertyName, value) {
              if (!targetObject || typeof propertyName !== 'string') {
                return;
              }

              if (typeof value === 'undefined') {
                return;
              }

              Object.defineProperty(targetObject, propertyName, {
                configurable: true,
                enumerable: true,
                get: () => value,
              });
            }

            function overrideNestedValues(targetObject, values) {
              if (!targetObject || !values || typeof values !== 'object') {
                return;
              }

              for (const [propertyName, value] of Object.entries(values)) {
                overrideValue(targetObject, propertyName, value);
              }
            }

            overrideNestedValues(Navigator.prototype, pageFingerprintPayload.navigator);
            overrideNestedValues(screen, pageFingerprintPayload.screen);
            overrideValue(window, 'devicePixelRatio', pageFingerprintPayload.window.devicePixelRatio);

            window.__MULTIPAGE_BROWSER_FINGERPRINT__ = pageFingerprintPayload;
          },
        });
      } finally {
        await chrome.debugger.detach(target);
      }

      return {
        tabId,
        source: options.source || 'unknown',
        fingerprintSessionId: options.fingerprintSessionId || null,
        appliedAt: now(),
        payload,
      };
    }

    function generateFingerprintSession(options = {}) {
      const strategy = options && typeof options === 'object' ? (options.strategy || {}) : {};
      const providedSeed = String(options.seed || '').trim();
      const generatedSeed = providedSeed ? '' : String(cryptoRandomUuid()).trim();
      const effectiveSeed = providedSeed || generatedSeed || 'fp-' + now();
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
      buildPageFingerprintPayload,
      applyFingerprintToTab,
      generateFingerprintSession,
    };
  }

  return {
    createBrowserFingerprintModule,
  };
});
