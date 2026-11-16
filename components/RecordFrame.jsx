'use client';
import { Children, useState } from 'react';

// Every list of records in the portal sits in one frame that shows the TOP 10 rows; "Show all" extends it (and "Show top 10" folds it back).
//   <RecordFrame head={<thead>...</thead>} cols={4}>{rows.map((r) => <tr key=...>...</tr>)}</RecordFrame>      a table (rows are <tr>)
//   <RecordFrame as="div">{items.map((x) => <div key=...>...</div>)}</RecordFrame>                              any other list
// The frame scrolls inside itself, so a long list never stretches the page.
export const TOP = 10;
export default function RecordFrame({ children, head = null, cols = 1, as = 'table', limit = TOP, noun = 'records', className = '', style }) {
  const [all, setAll] = useState(false);
  const rows = Children.toArray(children).filter(Boolean);
  const more = rows.length > limit;
  const shown = all || !more ? rows : rows.slice(0, limit);
  return (
    <div className={('record-frame ' + className).trim()} style={style}>
      <div className={'record-scroll' + (all && more ? ' open' : '')}>
        {as === 'table' ? <table>{head}<tbody>{shown}</tbody></table> : <div>{shown}</div>}
      </div>
      {more && <div className="record-foot noprint">
        <span>{all ? `Showing all ${rows.length} ${noun}` : `Showing the top ${limit} of ${rows.length} ${noun}`}</span>
        <button type="button" className="btn ghost small" onClick={() => setAll(!all)} aria-expanded={all}>{all ? `Show top ${limit}` : `Show all ${rows.length}`}</button>
      </div>}
    </div>
  );
}
