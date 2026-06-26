import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'acme-theme';

/** Read the saved theme, falling back to the OS preference. */
function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Apply the theme to <html> so every CSS rule can read it via [data-theme]. */
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * useTheme — single source of truth for the page theme.
 * Persists to localStorage and follows the OS preference until the user
 * makes an explicit choice. After that, the saved choice wins even when the
 * OS preference changes (otherwise toggling dark mode on a Mac with auto
 * theme would be a fight you can't win).
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage can be unavailable (private mode, quota); safe to ignore.
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggle };
}