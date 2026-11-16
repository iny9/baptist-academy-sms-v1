export default function Loading() {
  return (
    <div className="gd" aria-busy="true" aria-label="Loading the dashboard">
      <div className="gd-skel" style={{ height: 52, width: 260, marginBottom: 20 }} />
      <div className="gd-skel" style={{ height: 70, marginBottom: 24 }} />
      <div className="gd-skel-row"><div className="gd-skel" /><div className="gd-skel big" /><div className="gd-skel" /></div>
    </div>
  );
}
