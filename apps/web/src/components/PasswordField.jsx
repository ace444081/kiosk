import { useState } from 'react';

export function PasswordField({
  id,
  value,
  onChange,
  label,
  showLabel,
  hideLabel,
  autoComplete = 'current-password',
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        aria-label={label}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        required
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? hideLabel : showLabel}
      </button>
    </div>
  );
}
