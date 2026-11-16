'use client';
import { memo, useState } from 'react';
import { initials } from '@/lib/dash-logic';

// Passport-style photo (35:45). Falls back to the student's initials when there is no photo or it fails to load.
function Photo({ url, name, className = '' }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={'gd-photo ' + className}>
      {url && !broken
        ? <img src={url} alt={`Passport photo of ${name}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : <span aria-hidden="true">{initials(name)}</span>}
    </div>
  );
}
export default memo(Photo);
