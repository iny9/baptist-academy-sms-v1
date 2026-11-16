// Two designs: Basic section (bright, friendly) and Secondary section (formal, ruled). Both are laid out for one A4 page.
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });
const when = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const TITLE = { payment: 'Payment receipt', item: 'Receipt for item paid', term: 'Term fees receipt: fully paid' };

export default function Receipt({ data, S }) {
  const basic = data.student.section === 'basic';
  const head = basic ? (
    <header className="r-head">
      <img src="/logo-192.webp" alt="School logo" className="r-logo" />
      <div><h1>{S.school_name}</h1><div className="r-sub">{S.address}</div></div>
      <div className="r-paid" aria-label="Paid">PAID</div>
    </header>) : (
    <header className="r-head">
      <img src="/logo-192.webp" alt="School logo" className="r-logo" />
      <h1>{S.school_name}</h1><div className="r-sub">{S.address}</div><div className="r-sub">{S.motto}</div>
    </header>);
  return (<article className={'rcpt ' + (basic ? 'basic' : 'secondary')}>
    {head}
    <div className="r-body">
      <div className="r-title">{TITLE[data.kind]}</div>
      <div className="r-meta">
        <div><span>Receipt no.</span><b>{data.receipt_no}</b></div>
        <div><span>Date</span><b>{when(data.issued_at)}</b></div>
        {data.term && <div><span>Session / term</span><b>{data.term.year}, Term {data.term.number}</b></div>}
        {data.reference && <div><span>Teller reference</span><b>{data.reference}</b></div>}
      </div>
      <div className="r-who">
        <div><span>Received for</span><b>{data.student.name}</b></div>
        <div><span>Class</span><b>{data.student.class}{data.student.admission_no ? ` | Adm. ${data.student.admission_no}` : ''}</b></div>
        {data.parent_name && <div><span>Paid by</span><b>{data.parent_name}</b></div>}
      </div>
      <table className="r-items"><thead><tr><th>Item</th>{data.kind === 'payment' && <th>Term</th>}<th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>{data.items.map((i, k) => (<tr key={k}><td>{i.title}{i.kind === 'brought_forward' ? ' (owed from before)' : ''}</td>{data.kind === 'payment' && <td>{i.year}, T{i.term}</td>}<td style={{ textAlign: 'right' }}>{naira(i.amount)}</td></tr>))}</tbody></table>
      <div className="r-total"><span>Total received</span><b>{naira(data.total)}</b></div>
      {data.kind === 'term' && <p className="r-note">All fees for this term, and any balance brought forward, have been paid and confirmed.</p>}
      <div className="r-sign"><div><div className="r-line" />{data.confirmed_by ? `Confirmed by ${data.confirmed_by}` : 'Bursar'}<br /><small>Bursar</small></div><div><div className="r-line" />School stamp</div></div>
    </div>
    <footer className="r-foot"><span>{S.school_name}</span><span>This receipt is valid only for payments confirmed by the bursar.</span></footer>
  </article>);
}
