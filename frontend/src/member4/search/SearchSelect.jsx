import { useId } from 'react';
import * as Select from '@radix-ui/react-select';
import FieldShell from '../../components/ui/FieldShell.jsx';
import Icon from '../../components/ui/Icon.jsx';
import './search-select.css';

const emptyValue = '__any__';

export default function SearchSelect({ label, value, onChange, options, placeholder }) {
  const id = useId();
  const choices = placeholder ? [{ value: '', label: placeholder }, ...options] : options;
  const selection = choices.find((option) => option.value === value)?.label || value || placeholder;

  return (
    <FieldShell id={id} label={label}>
      <Select.Root value={value || emptyValue} onValueChange={(next) => onChange(next === emptyValue ? '' : next)}>
        <Select.Trigger id={id} className="search-select-trigger">
          <span className="search-select-value"><Select.Value>{selection}</Select.Value></span>
          <Select.Icon><Icon name="chevronDown" size={16} /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            aria-label={label}
            className="search-select-menu"
            position="popper"
            align="start"
            sideOffset={6}
            collisionPadding={12}
          >
            <Select.Viewport className="search-select-options">
              {choices.map((option) => (
                <Select.Item key={option.value} value={option.value || emptyValue} className="search-select-option">
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="search-select-check">
                    <Icon name="check" size={16} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </FieldShell>
  );
}
