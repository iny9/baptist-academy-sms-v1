// Branded header band shared by every printable document.
export default function DocHeader({ S, pill, sub, watermark = true }) {
  return (<>
    <div className="band">
      <img className="logo" src="/logo-192.webp" alt="School logo" decoding="async" />
      <div><h1>{S.school_name}</h1><div className="sub">{S.address}</div><span className="pill">{pill}</span>{sub && <span className="sess">{sub}</span>}</div>
    </div>
    {watermark && <div className="wm" aria-hidden="true"><img src="/logo.jpeg" alt="" /></div>}
  </>);
}
