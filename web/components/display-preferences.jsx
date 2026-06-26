'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { routePath } from '@/lib/paths';
import {
  DISPLAY_PREFERENCE_DEFAULTS,
  DISPLAY_PREFERENCE_OPTIONS,
  DISPLAY_PREFERENCE_STORAGE_KEY,
  describeDisplayPreferences,
  normalizeDisplayPreferences,
} from '@/lib/display-preferences';

function readStoredPreferences() {
  if (typeof window === 'undefined') return DISPLAY_PREFERENCE_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(DISPLAY_PREFERENCE_STORAGE_KEY);
    if (!raw) return DISPLAY_PREFERENCE_DEFAULTS;
    return normalizeDisplayPreferences(JSON.parse(raw));
  } catch {
    return DISPLAY_PREFERENCE_DEFAULTS;
  }
}

function applyPreferences(preferences) {
  const root = document.documentElement;
  root.dataset.density = preferences.density;
  root.dataset.contrast = preferences.contrast;
  root.dataset.effects = preferences.effects;
}

function PreferenceGroup({ name, title, description, options, value, onChange }) {
  return (
    <fieldset className="preference-group">
      <legend>
        <b>{title}</b>
        <small>{description}</small>
      </legend>
      <div className="preference-choice-list">
        {options.map((option) => (
          <label key={option.value} className={`choice-card preference-choice${value === option.value ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>
              <b>{option.label}</b>
              <small>{option.summary}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DisplayPreferencesPanel() {
  const [preferences, setPreferences] = useState(DISPLAY_PREFERENCE_DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = readStoredPreferences();
    setPreferences(initial);
    applyPreferences(initial);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyPreferences(preferences);
    window.localStorage.setItem(DISPLAY_PREFERENCE_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences, ready]);

  const summary = useMemo(() => describeDisplayPreferences(preferences), [preferences]);

  function updatePreference(key, value) {
    setPreferences((current) => normalizeDisplayPreferences({ ...current, [key]: value }));
  }

  function resetPreferences() {
    setPreferences(DISPLAY_PREFERENCE_DEFAULTS);
  }

  return (
    <section className="panel display-preferences-panel" data-testid="display-preferences-panel" aria-labelledby="display-preferences-title">
      <header>
        <div>
          <h2 id="display-preferences-title">Display preferences</h2>
          <p>Tune density, contrast, and visual effects for this browser. The controls apply across the whole control plane.</p>
        </div>
        <span className="pill" data-testid="display-preferences-summary">{summary}</span>
      </header>

      <div className="display-preferences-grid">
        <PreferenceGroup
          name="density"
          title="Density"
          description="Choose how much space each screen uses by default."
          options={DISPLAY_PREFERENCE_OPTIONS.density}
          value={preferences.density}
          onChange={(value) => updatePreference('density', value)}
        />

        <PreferenceGroup
          name="contrast"
          title="Contrast"
          description="Adjust how strongly panels, borders, and text separate from the background."
          options={DISPLAY_PREFERENCE_OPTIONS.contrast}
          value={preferences.contrast}
          onChange={(value) => updatePreference('contrast', value)}
        />

        <PreferenceGroup
          name="effects"
          title="Effects"
          description="Control blur, glow, and shadow intensity."
          options={DISPLAY_PREFERENCE_OPTIONS.effects}
          value={preferences.effects}
          onChange={(value) => updatePreference('effects', value)}
        />
      </div>

      <div className="display-preferences-actions">
        <button type="button" className="btn alt" onClick={resetPreferences}>Reset to defaults</button>
        <p className="display-preferences-note">Saved only in this browser. Use reduced effects if you want a flatter interface with less visual motion.</p>
        <Link className="btn" href={routePath('/dashboard')}>Back to dashboard</Link>
      </div>
    </section>
  );
}
