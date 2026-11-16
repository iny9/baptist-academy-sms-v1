'use client';
import { useEffect, useState } from 'react';
import Icon from './Icon';

// Light/dark switch. The choice is remembered on this device; before any choice the theme follows the device setting.
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = document.documentElement.getAttribute('data-theme');
    setDark(saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);
  function flip() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
    setDark(!dark);
  }
  return (
    <button type="button" className="theme-btn" onClick={flip} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}>
      <Icon name={dark ? 'sun' : 'moon'} size={18} />
    </button>
  );
}
