import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

/** variant: primary | secondary | danger | ghost; size: md | sm. Renders a Link when `to` is set. */
const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', icon, to, type = 'button', children, className = '', busy = false, disabled, ...rest },
  ref
) {
  const classes = ['btn', variant !== 'primary' ? `btn-${variant}` : '', size === 'sm' ? 'btn-sm' : '', className].filter(Boolean).join(' ');
  const content = (
    <>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      <span>{busy ? 'Please wait...' : children}</span>
    </>
  );
  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {content}
    </button>
  );
});

export default Button;
