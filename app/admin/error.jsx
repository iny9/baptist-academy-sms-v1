'use client';
import { useEffect } from 'react';
import Notice from '@/components/Notice';
import { classify } from '@/lib/errors';

export default function Error({ error, reset }) {
  useEffect(() => { console.error(error); }, [error]);
  const n = classify(error);
  return (<div className="wrap" style={{ padding: '96px 24px', maxWidth: 640 }}>
    <h1>Oops, that did not work</h1>
    <Notice notice={n.kind === 'unknown' ? { ...n, body: 'This page could not be shown. Your information is safe.' } : n} />
    <p><button className="btn" onClick={reset}>Try again</button> <a className="btn ghost" href="/">Go to the home page</a></p>
  </div>);
}
