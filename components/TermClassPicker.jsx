export default function TermClassPicker({ terms, classes, term, cls, action }) {
  return (
    <form method="get" action={action} className="row">
      <div><label htmlFor="term">Session and term</label>
        <select id="term" name="term" defaultValue={term ?? ''} required>
          <option value="">Choose</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.academic_years.name}, Term {t.number}{t.is_active === false ? ' (inactive)' : ''}</option>)}</select></div>
      {classes && <div><label htmlFor="class">Class</label>
        <select id="class" name="class" defaultValue={cls ?? ''} required>
          <option value="">Choose</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
      <button className="btn">Open</button>
    </form>
  );
}
