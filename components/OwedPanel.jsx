import RecordFrame from './RecordFrame';
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });
// Money owed from before, as recorded when each student was onboarded. Always shown to the bursar; it is carried into the payment schedule until cleared.
export default function OwedPanel({ rows }) {
  const total = rows.reduce((a, r) => a + Number(r.owed), 0);
  return (<div className="panel" style={{ marginTop: 20 }}>
    <h2 style={{ marginTop: 0 }}>Money owed from before <span className="badge red">{naira(total)}</span></h2>
    <p className="auth-hint">Recorded when the student was onboarded. It is added to the student’s payment schedule automatically and stays there until the bursar confirms it as paid.</p>
    {rows.length === 0 ? <div className="empty">No student owes a balance from before.</div> :
      <RecordFrame noun="students" head={<thead><tr><th>Student</th><th>Class</th><th>Owed</th><th>Where it stands</th></tr></thead>}>
        {rows.map((r) => (<tr key={r.student_id}><td>{r.student_name} <span className="auth-hint">{r.admission_no}</span></td><td>{r.class_name}</td><td>{naira(r.owed)}</td>
          <td className="auth-hint">{{ pending: 'In schedule, unpaid', claimed: 'Payment sent, awaiting you' }[r.bf_status] ?? r.bf_status}</td></tr>))}</RecordFrame>}
  </div>);
}
