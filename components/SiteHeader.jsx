import Link from 'next/link';
import Image from 'next/image';
import AuthLink from './AuthLink';
import ThemeToggle from './ThemeToggle';
export default function SiteHeader({ name }) {
  return (
    <header className="site">
      <div className="wrap">
        <Link href="/" className="brand"><Image src="/logo.jpeg" alt="" width={42} height={42} priority /><span>{name}</span></Link>
        <nav aria-label="Main">
          <a className="hide-sm" href="#history">About</a>
          <a className="hide-sm" href="#sections">Sections</a>
          <a className="hide-sm" href="#portal">Portal</a>
          <a className="hide-sm" href="#board">Board</a>
          <a className="hide-sm" href="#archive">Archive</a>
          <ThemeToggle />
          <AuthLink />
        </nav>
      </div>
    </header>
  );
}
