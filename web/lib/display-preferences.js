export const DISPLAY_PREFERENCE_STORAGE_KEY = 'shore-sentinel-display-preferences';

export const DISPLAY_PREFERENCE_DEFAULTS = Object.freeze({
  density: 'comfortable',
  contrast: 'standard',
  effects: 'full',
});

export const DISPLAY_PREFERENCE_OPTIONS = Object.freeze({
  density: [
    {
      value: 'comfortable',
      label: 'Comfortable',
      summary: 'Balanced spacing and panel padding for the default control-plane rhythm.',
    },
    {
      value: 'compact',
      label: 'Compact',
      summary: 'Tighter spacing for denser screens, longer lists, and more information per viewport.',
    },
  ],
  contrast: [
    {
      value: 'standard',
      label: 'Standard contrast',
      summary: 'Keeps the current dark palette with softer surfaces and calmer contrast.',
    },
    {
      value: 'high',
      label: 'High contrast',
      summary: 'Strengthens borders, text, and surfaces for clearer separation and visibility.',
    },
  ],
  effects: [
    {
      value: 'full',
      label: 'Full effects',
      summary: 'Retains the glow, blur, and layered glass treatment used across the app.',
    },
    {
      value: 'reduced',
      label: 'Reduced effects',
      summary: 'Flattens blur, glow, and shadows to keep the interface calmer and lighter.',
    },
  ],
});

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function normalizeDisplayPreferences(input = {}) {
  const density = normalizeChoice(input.density, DISPLAY_PREFERENCE_OPTIONS.density.map((option) => option.value), DISPLAY_PREFERENCE_DEFAULTS.density);
  const contrast = normalizeChoice(input.contrast, DISPLAY_PREFERENCE_OPTIONS.contrast.map((option) => option.value), DISPLAY_PREFERENCE_DEFAULTS.contrast);
  const effects = normalizeChoice(input.effects, DISPLAY_PREFERENCE_OPTIONS.effects.map((option) => option.value), DISPLAY_PREFERENCE_DEFAULTS.effects);
  return { density, contrast, effects };
}

export function describeDisplayPreferences(preferences) {
  const current = normalizeDisplayPreferences(preferences);
  return `${current.density} · ${current.contrast} · ${current.effects} effects`;
}

export function displayPreferencesBootstrapScript() {
  const defaults = JSON.stringify(DISPLAY_PREFERENCE_DEFAULTS);
  const storageKey = JSON.stringify(DISPLAY_PREFERENCE_STORAGE_KEY);
  const densityValues = JSON.stringify(DISPLAY_PREFERENCE_OPTIONS.density.map((option) => option.value));
  const contrastValues = JSON.stringify(DISPLAY_PREFERENCE_OPTIONS.contrast.map((option) => option.value));
  const effectsValues = JSON.stringify(DISPLAY_PREFERENCE_OPTIONS.effects.map((option) => option.value));
  return `(() => {
    const storageKey = ${storageKey};
    const defaults = ${defaults};
    const allowed = {
      density: new Set(${densityValues}),
      contrast: new Set(${contrastValues}),
      effects: new Set(${effectsValues}),
    };
    const normalize = (value, key) => (value && allowed[key].has(value) ? value : defaults[key]);
    const apply = (prefs) => {
      const root = document.documentElement;
      root.dataset.density = prefs.density;
      root.dataset.contrast = prefs.contrast;
      root.dataset.effects = prefs.effects;
    };
    let prefs = defaults;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        prefs = {
          density: normalize(parsed?.density, 'density'),
          contrast: normalize(parsed?.contrast, 'contrast'),
          effects: normalize(parsed?.effects, 'effects'),
        };
      } else {
        prefs = {
          density: defaults.density,
          contrast: window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches ? 'high' : defaults.contrast,
          effects: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : defaults.effects,
        };
      }
    } catch {
      prefs = defaults;
    }
    apply(prefs);
  })();`;
}
