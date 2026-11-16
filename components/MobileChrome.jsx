'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon from './Icon';

// Phone layout, in the style of a banking/school app: a top bar (menu, logo, profile) and a bottom tab bar (Home + the three most used pages + More).
// "Menu" and "More" both open the same drawer: the full sidebar slides in over the page with a dimmed backdrop. Hidden on wide screens and when printing.
export default function MobileChrome({ tabs, initial, name }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { document.body.classList.toggle('drawer-open', open); return () => document.body.classList.remove('drawer-open'); }, [open]);
  const on = (href) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
  return (<>
    <header className="m-top noprint">
      <button type="button" className="m-burger" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="menu" size={22} /></button>
      <Link href="/admin" className="m-brand"><img src="/logo-96.webp" alt="" width="36" height="36" decoding="async" /><span>Baptist Academy</span></Link>
      <Link href="/admin/profile" className="m-avatar" aria-label="My profile">{initial}</Link>
    </header>
    <nav className="m-tabs noprint" aria-label="Quick navigation">
      <Link href="/admin" className={'m-tab' + (on('/admin') ? ' on' : '')}><Icon name="home" size={22} /><span>Home</span></Link>
      {tabs.map((t) => <Link key={t.href} href={t.href} className={'m-tab' + (on(t.href) ? ' on' : '')}><Icon name={t.icon} size={22} /><span>{t.short}</span></Link>)}
      <button type="button" className={'m-tab' + (open ? ' on' : '')} onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="more" size={22} /><span>More</span></button>
    </nav>
    {open && <button type="button" className="m-backdrop noprint" aria-label="Close menu" onClick={() => setOpen(false)} />}
  </>);
}
