// The head's stamp, always at the bottom right of the report card. Signature sits where the stamp says "sign",
// and the printed date where it says "date" (positions are saved as fractions of the stamp picture).
import { parseLayout, stampKeys } from '@/lib/stamp';
export { parseLayout };
export const stampOf = (S, section) => { const k = stampKeys(section); return { stamp: S[k.stamp] || '', signature: S[k.signature] || S[k.legacy] || '', layout: parseLayout(S[k.layout]) }; };
export const fmtDateLong = (d = new Date()) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Stamp({ S, section, date, width = 150 }) {
  const { stamp, signature, layout } = stampOf(S, section);
  const title = section === 'secondary' ? 'Principal' : 'Headmaster / Headmistress';
  if (!stamp) return (<div className="stamp-fallback">{signature && <img src={signature} alt="Signature" />}<div>{title}</div></div>);
  const L = layout;
  return (<div className="stamp" style={{ width }} aria-label={`${title}'s stamp`}>
    <img src={stamp} alt="School stamp" style={{ width: '100%', display: 'block' }} />
    {signature && <img src={signature} alt="Signature" style={{ position: 'absolute', left: `${L.sign.x * 100}%`, top: `${L.sign.y * 100}%`, width: `${L.sign.w * 100}%`, transform: 'translate(-50%,-50%)', mixBlendMode: 'multiply' }} />}
    <span style={{ position: 'absolute', left: `${L.date.x * 100}%`, top: `${L.date.y * 100}%`, transform: 'translate(-50%,-50%)', fontSize: `${L.date.size * width}px`, fontWeight: 700, color: '#1B2A6B', whiteSpace: 'nowrap', textShadow: '0 0 2px #fff' }}>{date ?? fmtDateLong()}</span>
  </div>);
}
