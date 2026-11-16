'use client';
export default function GlobalError({ reset }) {
  return (<html lang="en"><body style={{ fontFamily: 'system-ui', maxWidth: 520, margin: '15vh auto', padding: '0 20px', color: '#0F1F44' }}>
    <h1>Something went wrong</h1><p>The page could not load. Check your connection and try again. Your information is safe.</p>
    <button onClick={reset} style={{ padding: '10px 18px', borderRadius: 9, border: 0, background: '#1B3A7A', color: '#fff', fontWeight: 700 }}>Try again</button></body></html>);
}
