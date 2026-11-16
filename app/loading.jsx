export default function Loading() {
  return (<div className="wrap" style={{ paddingTop: 96 }} aria-busy="true" aria-label="Loading">
    <div className="skeleton" style={{ height: 36, width: '40%', marginBottom: 20 }} /><div className="skeleton" style={{ height: 18, width: '70%', marginBottom: 10 }} /><div className="skeleton" style={{ height: 18, width: '60%', marginBottom: 30 }} />
    <div className="board">{[1, 2, 3].map((k) => <div key={k} className="skeleton" style={{ height: 220 }} />)}</div></div>);
}
