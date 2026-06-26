import { useState } from 'react';
import type { Subject } from '../types';
import { useTheme } from '../hooks/useTheme';

interface Props {
  existing: Subject[];
  onCreate: (name: string, color: string) => Promise<Subject | null>;
  onCancel: () => void;
}

// Six curated swatches, sourced from the dashboard's --subject-palette-*
// tokens. The first one doubles as the default for new subjects so the
// picker always lands on a color that fits the rest of the palette. We
// read the computed values once per component lifetime so the picker
// can pass real hex strings up to the onCreate callback (which still
// stores them in the subjects table as plain text).
//
// The "Custom…" tile is the last item and reveals a native <input
// type="color"> for users who want a value outside the curated set.
const PALETTE_VARS = [
  '--subject-palette-1',
  '--subject-palette-2',
  '--subject-palette-3',
  '--subject-palette-4',
  '--subject-palette-5',
  '--subject-palette-6',
] as const;

const CUSTOM = '__custom__';

// Read the palette tokens fresh on every render. We can't cache at
// module scope — the values change when the theme toggles (light vs
// dark tokens are defined on :root[data-theme]). `getComputedStyle`
// on the documentElement is cheap, and SubjectManager only mounts
// inside the open task-modal flow, so the read happens at most a few
// times per session.
function readPalette(): string[] {
  if (typeof window === 'undefined') {
    // SSR / pre-mount fallback — dark-theme defaults.
    return ['#1ba39c', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#34d399'];
  }
  const style = getComputedStyle(document.documentElement);
  return PALETTE_VARS.map((v) => style.getPropertyValue(v).trim() || '#000000');
}

export function SubjectManager({ existing, onCreate, onCancel }: Props) {
  // `theme` is subscribed so a theme toggle while the modal is open
  // re-reads the palette and the swatches repaint in the new theme.
  // SubjectManager doesn't render any chrome of its own — the only
  // theme-sensitive thing here is the swatch fill colors.
  useTheme();
  const palette = readPalette();
  // The first swatch is the default selection — matches the pre-picker
  // behaviour where users got teal on first run.
  const [color, setColor] = useState<string>(palette[0]);
  const [showCustom, setShowCustom] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    if (existing.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('A subject with this name already exists');
      return;
    }
    setBusy(true);
    const result = await onCreate(trimmed, color);
    setBusy(false);
    if (!result) {
      setError('Could not create subject');
    }
  }

  return (
    <form className="subject-manager" onSubmit={submit}>
      <div className="field">
        <label htmlFor="new-subject-name">Subject name</label>
        <input
          id="new-subject-name"
          className="input"
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Math"
          disabled={busy}
        />
      </div>

      <div className="field">
        <label>Color</label>
        <div className="subject-palette" role="radiogroup" aria-label="Subject color">
          {palette.map((hex, i) => {
            const isSelected = !showCustom && color === hex;
            return (
              <button
                key={PALETTE_VARS[i]}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Color ${i + 1}`}
                className={`subject-swatch${isSelected ? ' is-selected' : ''}`}
                style={{ backgroundColor: hex }}
                onClick={() => {
                  setColor(hex);
                  setShowCustom(false);
                }}
                disabled={busy}
              />
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={showCustom}
            aria-label="Custom color"
            className={`subject-swatch is-custom${showCustom ? ' is-selected' : ''}`}
            onClick={() => setShowCustom(true)}
            disabled={busy}
            title="Custom color"
          >
            <span aria-hidden="true">⋯</span>
          </button>
        </div>

        {showCustom && (
          <input
            type="color"
            className="input color-input"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={busy}
            aria-label="Custom color value"
          />
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="subject-manager-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Add subject'}
        </button>
      </div>
    </form>
  );
}

// Re-export so test code (or future consumers) can poke at the constant
// without having to re-derive it.
export { PALETTE_VARS, CUSTOM };
