import { forwardRef } from 'react';
import Input from './Input';
import { TZ_LABEL } from '../../lib/time';

/**
 * Date-time input in the university time zone (Asia/Seoul). The value is a
 * datetime-local string; conversion to ISO with offset happens on save.
 */
const DateTimeField = forwardRef(function DateTimeField({ hint, ...rest }, ref) {
  const zoneHint = `Time zone: ${TZ_LABEL}`;
  return <Input ref={ref} type="datetime-local" hint={hint ? `${hint} ${zoneHint}` : zoneHint} {...rest} />;
});

export default DateTimeField;
