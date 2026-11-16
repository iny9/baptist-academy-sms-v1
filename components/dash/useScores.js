'use client';
import { useEffect, useState } from 'react';

// Small shared loader for the dashboard's extra data (scores, ratings). Answers are kept for five minutes, so switching tabs or terms back and forth is instant
// and a reload (or the time passing) picks up scores that were entered meanwhile.
const cache = new Map(), TTL = 5 * 60 * 1000;
const fresh = (u) => { const h = cache.get(u); return h && Date.now() - h.t < TTL ? h.d : null; };
async function get(url, signal) {
  const hit = fresh(url); if (hit) return hit;
  const r = await fetch(url, { signal, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'The data could not be loaded.');
  cache.set(url, { t: Date.now(), d: j }); return j;
}

export function useRemoteMany(urls, enabled = true) {
  const key = urls.join('\n');
  const [st, setSt] = useState({ key: '', data: null, loading: false, error: '' });
  useEffect(() => {
    if (!enabled || urls.length === 0) return;
    const hits = urls.map(fresh);
    if (hits.every(Boolean)) { setSt({ key, data: hits, loading: false, error: '' }); return; }
    const ctl = new AbortController();
    setSt({ key, data: null, loading: true, error: '' });
    Promise.all(urls.map((u) => get(u, ctl.signal)))
      .then((data) => setSt({ key, data, loading: false, error: '' }))
      .catch((e) => { if (e.name !== 'AbortError') setSt({ key, data: null, loading: false, error: e.message }); });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  const current = st.key === key;
  return { data: current ? st.data : null, loading: enabled && urls.length > 0 && (!current || st.loading), error: current ? st.error : '' };
}

const q = (p, y, t) => `/api/${p}?year=${encodeURIComponent(y)}&term=${t}`;
// Scores of one term (term 0 = session average per subject)
export default function useScores(yearId, term, enabled = true) {
  const r = useRemoteMany(enabled ? [q('dashboard-scores', yearId, term)] : []);
  return { data: r.data?.[0] ?? null, loading: r.loading, error: r.error };
}
// Scores of several terms at once: { [term]: answer }
export function useScoreTerms(yearId, terms, enabled = true) {
  const r = useRemoteMany(enabled ? terms.map((t) => q('dashboard-scores', yearId, t)) : []);
  return { sets: r.data ? Object.fromEntries(terms.map((t, i) => [t, r.data[i]])) : null, loading: r.loading, error: r.error };
}
// Behaviour and skills ratings of one term (term 0 = session average)
export function useDomains(yearId, term, enabled = true) {
  const r = useRemoteMany(enabled ? [q('dashboard-domains', yearId, term)] : []);
  return { data: r.data?.[0] ?? null, loading: r.loading, error: r.error };
}
