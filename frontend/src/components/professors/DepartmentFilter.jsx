import Select from '../ui/Select';

export default function DepartmentFilter({ departments, value, counts, onChange }) {
  return (
    <Select
      label="Department"
      placeholder="Choose a department"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      options={departments.map(({ code, name, count }) => ({
        value: code,
        label: `${name} (${counts ? counts[code] || 0 : count})`,
      }))}
    />
  );
}
