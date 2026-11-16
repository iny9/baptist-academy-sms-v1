'use client';
import { useRouter, useSearchParams } from 'next/navigation';

// "Back to where I came from" for every page that shows a document (report card, receipt, payment schedule, newsletter, filled CA form, financial record).
//   1. a `from` link added by the page that opened the document (it keeps the term, class and filters that were chosen), if it is a page of this portal;
//   2. otherwise the browser's previous page, when this tab has one;
//   3. otherwise the list page given as `fallback` (the document was opened in a new tab or from a bookmark).
// It never shows when printing.
import { safeFrom as safe } from '@/lib/back';

export default function BackButton({ fallback = '/admin', label = 'Back' }) {
  const router = useRouter();
  const from = safe(useSearchParams()?.get('from'));
  function go() {
    if (from) return router.push(from);
    if (typeof window !== 'undefined' && window.history.length > 1) return router.back();
    router.push(fallback);
  }
  return <button type="button" className="btn ghost small noprint back-btn" onClick={go} aria-label={label}>← {label}</button>;
}
