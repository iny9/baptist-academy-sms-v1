'use client';
export default function PrintButton({ label = 'Download or print report card' }) { return <button className="btn" onClick={() => window.print()}>{label}</button>; }
