'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';

export default function AdminNav({ groups }) {
  const path = usePathname();
  return (
    <nav aria-label="Portal">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="group">{g.title}</div>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className={'nav' + (path === i.href || (i.href !== '/admin' && path.startsWith(i.href)) ? ' on' : '')} aria-current={path === i.href ? 'page' : undefined}>
              <Icon name={i.icon} size={18} />{i.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
