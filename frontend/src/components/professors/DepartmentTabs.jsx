/** Department tabs with professor counts: All plus AI, IBA, BSC, IHM, KS, EAP. */
export default function DepartmentTabs({ departments, value, counts = {}, onChange }) {
  const tabs = [{ code: '', name: 'All', short: 'All' }, ...departments.map((d) => ({ code: d.code, name: d.name, short: d.code === 'KS' ? 'Korean Studies' : d.code }))];
  return (
    <div className="tabs" role="tablist" aria-label="Departments">
      {tabs.map((t) => (
        <button
          key={t.code || 'ALL'}
          type="button"
          role="tab"
          aria-selected={value === t.code}
          title={t.name}
          onClick={() => onChange(t.code)}
        >
          {t.short}
          <span className="count">({counts[t.code || 'ALL'] || 0})</span>
        </button>
      ))}
    </div>
  );
}
