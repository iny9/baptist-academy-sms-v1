import Image from 'next/image';
import SiteHeader from '@/components/SiteHeader';
import HeroCarousel from '@/components/HeroCarousel';
import Reveal from '@/components/Reveal';
import Icon from '@/components/Icon';
import { supabasePublic } from '@/lib/supabase-server';

// Static page, rebuilt at most hourly, and instantly when the admin saves website content (see /api/revalidate).
export const revalidate = 3600;

const DEFAULTS = { school_name: 'Baptist Academy Jimeta Yola', motto: 'Strive for Excellence', hero_title: '', hero_text: '', about: '', history: '', address: '', phone: '', email: '', footer_text: 'Baptist Academy Jimeta Yola.' };

async function load() {
  try {
    const sb = supabasePublic();
    const [s, b, p, h] = await Promise.all([
      sb.from('site_settings').select('key,value'),
      sb.from('board_members').select('*').order('sort_order'),
      sb.from('past_leaders').select('*').order('start_year', { ascending: false }),
      sb.from('hero_slides').select('*').order('sort_order'),
    ]);
    return { settings: { ...DEFAULTS, ...Object.fromEntries((s.data ?? []).map((r) => [r.key, r.value])) }, board: b.data ?? [], leaders: p.data ?? [], slides: h.data ?? [] };
  } catch { return { settings: DEFAULTS, board: [], leaders: [], slides: [] }; }
}

// Shown until the admin uploads real school photos.
const DEFAULT_SLIDES = [
  { id: 'd1', image_url: '/hero/campus.svg', title: 'Our campus' },
  { id: 'd2', image_url: '/hero/library.svg', title: 'Learning and discovery' },
  { id: 'd3', image_url: '/hero/classroom.svg', title: 'Knowledge, faith and service' },
];

const Person = () => <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>;

export default async function Home() {
  const { settings: s, board, leaders, slides } = await load();
  const jsonLd = { '@context': 'https://schema.org', '@type': 'School', name: s.school_name, address: s.address, telephone: s.phone, email: s.email, slogan: s.motto, logo: '/logo.jpeg' };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <SiteHeader name={s.school_name} />
      <main>
        <HeroCarousel slides={slides.length ? slides : DEFAULT_SLIDES} eyebrow={s.motto} title={s.hero_title || s.school_name} text={s.hero_text || s.about} />

        <section id="history" className="block"><div className="wrap"><Reveal>
          <div className="section-head"><div className="eyebrow">Our story</div><h2>The history of the school</h2></div>
          <p style={{ maxWidth: '70ch', whiteSpace: 'pre-line', fontSize: '1.05rem' }}>{s.history}</p></Reveal></div></section>

        <section id="sections" className="block alt"><div className="wrap"><Reveal>
          <div className="section-head"><div className="eyebrow">Sections</div><h2>Two sections, one standard</h2></div>
          <div className="sections-grid">
            <div className="panel"><span className="badge gold">Basic section</span><h3 style={{ marginTop: 12 }}>Nursery and Primary</h3><p>Led by the Headmaster or Headmistress.</p><ul><li>Nursery</li><li>Primary 1 to 5</li></ul></div>
            <div className="panel"><span className="badge">Secondary section</span><h3 style={{ marginTop: 12 }}>Junior and Senior Secondary</h3><p>Led by the Principal.</p><ul><li>Junior secondary (JSS1 to JSS3)</li><li>Senior secondary (SSS1 to SSS3)</li></ul></div>
          </div></Reveal></div></section>

        <section id="portal" className="block"><div className="wrap"><Reveal>
          <div className="section-head"><div className="eyebrow">School portal</div><h2>Everything parents and staff need, in one place</h2><p>Sign in to follow your child's progress, pay and confirm fees, and keep records accurate and safe.</p></div>
          <div className="features">
            <div className="feature"><div className="ico"><Icon name="award" size={22} /></div><h3>Termly report cards</h3><p>Scores, grades, class positions and remarks for every term.</p></div>
            <div className="feature"><div className="ico"><Icon name="wallet" size={22} /></div><h3>Clear fee schedules</h3><p>A personal breakdown of what to pay each term, in naira. Tick what you have paid and get confirmation by email.</p></div>
            <div className="feature"><div className="ico"><Icon name="mail" size={22} /></div><h3>News and messages</h3><p>Newsletters and notices sent to your inbox or phone.</p></div>
            <div className="feature"><div className="ico"><Icon name="lock" size={22} /></div><h3>Private by design</h3><p>Each person sees only what their role allows. Parents see only their own children.</p></div>
          </div></Reveal></div></section>

        <section id="board" className="block alt"><div className="wrap"><Reveal>
          <div className="section-head"><div className="eyebrow">Leadership</div><h2>Board of governors</h2></div>
          {board.length === 0 && <div className="empty">Board members will appear here once the admin adds them.</div>}
          <div className="board">{board.map((m) => (
            <article className="card member" key={m.id}>
              <div className="ph">{m.photo_url ? <Image src={m.photo_url} alt={m.full_name} fill sizes="(max-width: 700px) 100vw, 280px" style={{ objectFit: 'cover' }} /> : <Person />}</div>
              <div className="body"><h3 style={{ margin: 0 }}>{m.full_name}</h3><div style={{ fontWeight: 600 }}>{m.portfolio}</div>{m.tenure && <div className="auth-hint">{m.tenure}</div>}<p>{m.description}</p></div>
            </article>))}</div></Reveal></div></section>

        <section id="archive" className="block"><div className="wrap"><Reveal>
          <div className="section-head"><div className="eyebrow">Archive</div><h2>Past school leaders</h2></div>
          {leaders.length === 0 && <div className="empty">The archive is empty. The admin can add past principals and administrators.</div>}
          <ol className="timeline people">{leaders.map((l) => (
            <li key={l.id}>
              <div className="avatar-lg">{l.photo_url ? <Image src={l.photo_url} alt={l.full_name} fill sizes="64px" style={{ objectFit: 'cover' }} /> : <Person />}</div>
              <div><div className="yrs">{l.start_year} to {l.end_year ?? 'date'} · {l.office}</div><h3>{l.full_name}</h3>{l.note && <p>{l.note}</p>}</div>
            </li>))}</ol></Reveal></div></section>
      </main>
      <footer className="site">
        <div className="wrap">
          <div><div className="brand" style={{ color: '#fff' }}><Image src="/logo.jpeg" alt="" width={44} height={44} /><span>{s.school_name}</span></div><p style={{ marginTop: 10 }}>{s.motto}</p></div>
          <div className="contact">
            {s.address && <div><Icon name="pin" size={18} /><span>{s.address}</span></div>}
            {s.phone && <div><Icon name="phone" size={18} /><span>{s.phone}</span></div>}
            {s.email && <div><Icon name="mail" size={18} /><span>{s.email}</span></div>}
          </div>
          <div><strong>Portal</strong><p><a href="/login">Sign in</a><br /><a href="/forgot-password">Forgot password</a></p><p style={{ fontSize: '.8rem', opacity: .8 }}>{s.footer_text}</p></div>
        </div>
      </footer>
    </>
  );
}
