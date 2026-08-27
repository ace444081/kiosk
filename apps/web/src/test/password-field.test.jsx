import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordField } from '../components/PasswordField.jsx';

describe('PasswordField', () => {
  it('toggles visibility without changing the value', async () => {
    const user = userEvent.setup();
    render(
      <PasswordField
        id="password"
        label="Password"
        value="secret-value"
        onChange={() => {}}
        showLabel="Show password"
        hideLabel="Hide password"
      />,
    );
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('secret-value');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
