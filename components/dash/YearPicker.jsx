'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

// Choosing a session loads that session's data (once); everything after that filters in the browser.
export default function YearPicker({ years, value }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="gd-field gd-year" aria-busy={pending}>
      <label htmlFor="gd-year">Session</label>
      <select id="gd-year" value={value} disabled={pending} onChange={(e) => start(() => router.replace('/admin/dashboard?year=' + encodeURIComponent(e.target.value)))}>
        {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
      </select>
    </div>
  );
}
