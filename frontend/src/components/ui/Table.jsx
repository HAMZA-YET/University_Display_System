/**
 * columns: [{ key, header, render?(row), className? }]
 * On mobile the table becomes stacked cards (labels come from data-label).
 */
export default function Table({ columns, rows, rowKey = 'id', caption, emptyText = 'No rows.' }) {
  return (
    <div className="table-wrap stack-mobile">
      <table className="table">
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} data-label="">
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={typeof rowKey === 'function' ? rowKey(row, i) : row[rowKey] || i}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} className={c.className}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
