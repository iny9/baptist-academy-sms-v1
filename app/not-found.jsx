import Link from 'next/link';
export default function NotFound() {
  return (<div className="wrap" style={{ padding: '96px 24px' }}><div className="eyebrow">404</div><h1>That page does not exist</h1><p>It may have moved, or the link may be wrong.</p><Link className="btn" href="/">Back to the home page</Link></div>);
}
