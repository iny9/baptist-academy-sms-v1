'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Icon from './Icon';

// Full-bleed school photo carousel: autoplay (paused on hover, focus and for reduced-motion users), arrows, dots, swipe, keyboard.
export default function HeroCarousel({ slides, eyebrow, title, text }) {
  const [i, setI] = useState(0); const [paused, setPaused] = useState(false); const start = useRef(null); const n = slides.length;
  const go = useCallback((k) => setI((k + n) % n), [n]);
  useEffect(() => {
    if (n < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => go(i + 1), 6000); return () => clearTimeout(t);
  }, [i, paused, n, go]);
  const onKey = (e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); };
  return (
    <section className={'hero ' + (n ? 'photo' : 'static') + (paused ? ' paused' : '')} aria-roledescription="carousel" aria-label="School photos"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} onKeyDown={onKey}
      onPointerDown={(e) => { start.current = e.clientX; }} onPointerUp={(e) => { if (start.current != null && n > 1) { const d = e.clientX - start.current; if (Math.abs(d) > 50) go(i + (d < 0 ? 1 : -1)); } start.current = null; }}>
      {n > 0 && <div className="slides" aria-live={paused ? 'polite' : 'off'}>{slides.map((s, k) => (
        <div key={s.id} className={'slide' + (k === i ? ' on' : '')} aria-hidden={k !== i} role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${n}`}>
          <Image src={s.image_url} alt={s.title ?? ''} fill sizes="100vw" priority={k === 0} quality={80} unoptimized={s.image_url.endsWith('.svg')} /></div>))}</div>}
      {n > 0 && <div className="shade" />}
      <div className="wrap">
        <div className="copy">
          <span className="motto">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{text}</p>
          <div className="cta">
            <a className="btn gold lg" href="#history">Read our story</a>
            <a className="btn ghost lg" style={{ background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} href="/login">Parent and staff portal</a>
          </div>
          <div className="chips"><span>Nursery</span><span>Primary</span><span>Junior secondary</span><span>Senior secondary</span></div>
        </div>
        {n === 0 && <img className="seal" src="/logo.jpeg" alt="Baptist Academy Jimeta Yola school seal" style={{ borderRadius: 32, background: '#fff', padding: 14 }} />}
      </div>
      {n > 1 && <div className="carousel-ui"><div className="wrap">
        <button className="cbtn" onClick={() => go(i - 1)} aria-label="Previous photo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg></button>
        <button className="cbtn" onClick={() => go(i + 1)} aria-label="Next photo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg></button>
        <div className="dots" role="tablist">{slides.map((s, k) => <button key={s.id} role="tab" aria-selected={k === i} aria-label={`Show photo ${k + 1}`} className={'dot-btn' + (k === i ? ' on' : '')} onClick={() => go(k)} />)}</div>
        <div className="caption">{slides[i].title}</div></div></div>}
    </section>
  );
}
