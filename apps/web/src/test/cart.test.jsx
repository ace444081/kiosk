import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CartProvider, useCart } from '../kiosk/CartContext.jsx';
import { MAX_QUANTITY, CART_STORAGE_KEY } from '@kiosk/shared';

function Harness() {
  const { items, totals, addItem, updateQuantity, removeItem, clearCart, announcement } = useCart();
  return (
    <div>
      <ul>
        {items.map((item) => (
          <li key={item.key} data-testid={`line-${item.name}`}>
            {item.name} x{item.quantity} = {item.lineTotalCentavos}
          </li>
        ))}
      </ul>
      <span data-testid="count">{totals.count}</span>
      <span data-testid="total">{totals.totalCentavos}</span>
      <span data-testid="announce">{announcement}</span>
      <button
        type="button"
        onClick={() =>
          addItem({
            key: 'americano-1',
            productId: 'americano',
            name: 'Americano',
            unitPriceCentavos: 4500,
            unitTotalCentavos: 4500,
            quantity: 1,
            addons: [],
            options: [],
            lineTotalCentavos: 4500,
          })
        }
      >
        add plain americano
      </button>
      <button
        type="button"
        onClick={() =>
          addItem({
            key: 'latte-1',
            productId: 'cafe-latte',
            name: 'Cafe Latte',
            unitPriceCentavos: 5500,
            unitTotalCentavos: 9000,
            quantity: 2,
            addons: [{ id: 'addon-espresso-shot', name: 'Espresso Shot', priceCentavos: 3500 }],
            options: [],
            lineTotalCentavos: 18000,
          })
        }
      >
        add latte w/ shot
      </button>
      <button
        type="button"
        onClick={() =>
          addItem({
            key: 'latte-2',
            productId: 'cafe-latte',
            name: 'Cafe Latte',
            unitPriceCentavos: 5500,
            unitTotalCentavos: 5500,
            quantity: 1,
            addons: [],
            options: [],
            lineTotalCentavos: 5500,
          })
        }
      >
        add plain latte
      </button>
      <button type="button" onClick={() => updateQuantity('americano-1', 5)}>
        bump americano
      </button>
      <button type="button" onClick={() => removeItem('americano-1')}>
        remove americano
      </button>
      <button type="button" onClick={() => clearCart()}>
        clear
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <CartProvider>
      <Harness />
    </CartProvider>,
  );
}

describe('CartProvider', () => {
  it('starts empty with zero totals', () => {
    renderHarness();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByTestId('total')).toHaveTextContent('0');
  });

  it('adds items and computes totals', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'add plain americano' }));
    await user.click(screen.getByRole('button', { name: 'add latte w/ shot' }));
    expect(screen.getByTestId('count')).toHaveTextContent('3');
    expect(screen.getByTestId('total')).toHaveTextContent('22500');
    expect(screen.getByTestId('line-Cafe Latte')).toHaveTextContent('x2 = 18000');
  });

  it('merges identically configured lines and keeps differently configured lines separate', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'add plain americano' }));
    await user.click(screen.getByRole('button', { name: 'add plain americano' }));
    // Same product, no add-ons: merged into one line with quantity 2.
    expect(screen.getAllByTestId('line-Americano')).toHaveLength(1);
    expect(screen.getByTestId('line-Americano')).toHaveTextContent('x2 = 9000');

    // Same product, different configuration: separate lines.
    await user.click(screen.getByRole('button', { name: 'add latte w/ shot' }));
    await user.click(screen.getByRole('button', { name: 'add plain latte' }));
    expect(screen.getAllByTestId('line-Cafe Latte')).toHaveLength(2);
  });

  it('caps merged quantities at MAX_QUANTITY', async () => {
    const user = userEvent.setup();
    renderHarness();
    for (let i = 0; i < 25; i += 1) {
      await user.click(screen.getByRole('button', { name: 'add plain americano' }));
    }
    expect(screen.getByTestId('line-Americano')).toHaveTextContent(`x${MAX_QUANTITY} = 90000`);
  });

  it('updates and removes quantities', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'add plain americano' }));
    await user.click(screen.getByRole('button', { name: 'bump americano' }));
    expect(screen.getByTestId('line-Americano')).toHaveTextContent('x6 = 27000');
    await user.click(screen.getByRole('button', { name: 'remove americano' }));
    expect(screen.queryByTestId('line-Americano')).not.toBeInTheDocument();
  });

  it('clears the cart', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'add plain americano' }));
    await user.click(screen.getByRole('button', { name: 'clear' }));
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('persists the cart to sessionStorage (survives refresh)', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'add plain americano' }));
    await waitFor(() => {
      const stored = JSON.parse(sessionStorage.getItem(CART_STORAGE_KEY));
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Americano');
    });
  });

  it('announces cart updates for screen readers', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'add plain americano' }));
    await waitFor(() => {
      expect(screen.getByTestId('announce').textContent).toContain('Americano');
    });
  });
});
