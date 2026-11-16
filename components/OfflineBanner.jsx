'use client';
import { useEffect, useState } from 'react';

// Slides in when the device loses its connection and out again when it returns.
export default function OfflineBanner() {
  const [state, setState] = useState('online');   // online | offline | back
  useEffect(() => {
    if (!navigator.onLine) setState('offline');
    let t;
    const off = () => { clearTimeout(t); setState('offline'); };
    const on = () => { setState('back'); t = setTimeout(() => setState('online'), 3500); };
    window.addEventListener('offline', off); window.addEventListener('online', on);
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); clearTimeout(t); };
  }, []);
  if (state === 'online') return null;
  return (<div className={'offline-banner ' + state} role="status" aria-live="polite">
    {state === 'offline' ? 'You are offline. You can keep typing, but saving needs a connection.' : 'You are back online.'}</div>);
}
