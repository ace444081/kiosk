import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  CART_STORAGE_KEY,
  IDEM_STORAGE_KEY,
  RECEIPT_STORAGE_KEY,
  MAX_QUANTITY,
} from '@kiosk/shared';
import { api, idempotencyKey, ApiError } from '../services/api.js';

const CartContext = createContext(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

function lineKey(item) {
  const addons = [...item.addons.map((a) => a.id)].sort().join('|');
  const options = [...item.options.map((o) => o.id)].sort().join('|');
  return `${item.productId}::${addons}::${options}`;
}

function loadCart() {
  try {
    const raw = sessionStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(items) {
  try {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage unavailable: cart still works for the session
  }
}

export function CartProvider({ children }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(loadCart);
  const [announcement, setAnnouncement] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const announceTimerRef = useRef(null);

  useEffect(() => {
    persist(items);
  }, [items]);

  useEffect(() => () => clearTimeout(announceTimerRef.current), []);

  const announce = useCallback(
    (key, opts) => {
      setAnnouncement(t(key, opts));
      clearTimeout(announceTimerRef.current);
      announceTimerRef.current = setTimeout(() => setAnnouncement(''), 3000);
    },
    [t],
  );

  const addItem = useCallback(
    (item) => {
      setItems((prev) => {
        // unitTotalCentavos = base price + add-ons + options per unit;
        // lineTotal is always recomputed so merges never undercharge.
        const unitTotal = item.unitTotalCentavos ?? item.unitPriceCentavos;
        const key = lineKey(item);
        const existing = prev.find((i) => lineKey(i) === key);
        if (existing) {
          return prev.map((i) =>
            i === existing
              ? {
                  ...i,
                  quantity: Math.min(MAX_QUANTITY, i.quantity + item.quantity),
                  lineTotalCentavos: unitTotal * Math.min(MAX_QUANTITY, i.quantity + item.quantity),
                }
              : i,
          );
        }
        return [...prev, { ...item, lineTotalCentavos: unitTotal * item.quantity }];
      });
      announce('cart.addedAnnouncement', { name: item.name });
    },
    [announce],
  );

  const updateQuantity = useCallback((key, delta) => {
    setItems((prev) =>
      prev
        .map((i) => {
          if (i.key !== key) return i;
          const quantity = Math.max(1, Math.min(MAX_QUANTITY, i.quantity + delta));
          const unitTotal = i.unitTotalCentavos ?? i.unitPriceCentavos;
          return { ...i, quantity, lineTotalCentavos: unitTotal * quantity };
        })
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const removeItem = useCallback(
    (key) => {
      setItems((prev) => {
        const removed = prev.find((i) => i.key === key);
        if (removed) announce('cart.removedAnnouncement', { name: removed.name });
        return prev.filter((i) => i.key !== key);
      });
    },
    [announce],
  );

  const clearCart = useCallback(() => {
    setItems([]);
    announce('cart.clearedAnnouncement');
  }, [announce]);

  const totals = useMemo(() => {
    const subtotalCentavos = items.reduce((sum, i) => sum + i.lineTotalCentavos, 0);
    return {
      subtotalCentavos,
      totalCentavos: subtotalCentavos,
      count: items.reduce((s, i) => s + i.quantity, 0),
    };
  }, [items]);

  /**
   * Place the order with an idempotency key. Returns the server order.
   * - Keeps the idempotency key in sessionStorage so a retry after a network
   *   failure reuses the same key (never duplicate orders).
   * - If the server answers "duplicate", the original order is returned.
   */
  const submitOrder = useCallback(
    async ({ paymentMethod, locale }) => {
      setSubmitting(true);
      try {
        let key = null;
        try {
          key = sessionStorage.getItem(IDEM_STORAGE_KEY);
        } catch {
          key = null;
        }
        if (!key) {
          key = idempotencyKey();
          try {
            sessionStorage.setItem(IDEM_STORAGE_KEY, key);
          } catch {
            // continue with in-memory key
          }
        }

        const payload = {
          locale,
          paymentMethod,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            addonIds: i.addons.map((a) => a.id),
            optionIds: i.options.map((o) => o.id),
          })),
        };

        const result = await api.post('/orders', payload, {
          headers: { 'Idempotency-Key': key },
        });

        try {
          sessionStorage.setItem(
            RECEIPT_STORAGE_KEY,
            JSON.stringify({
              orderNumber: result.orderNumber,
              receiptToken: result.receiptToken,
              at: Date.now(),
            }),
          );
        } catch {
          // receipt token stays in memory if storage is unavailable
        }

        return result;
      } finally {
        setSubmitting(false);
      }
    },
    [items],
  );

  const clearSession = useCallback(() => {
    setItems([]);
    try {
      sessionStorage.removeItem(CART_STORAGE_KEY);
      sessionStorage.removeItem(IDEM_STORAGE_KEY);
      sessionStorage.removeItem(RECEIPT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({
      items,
      totals,
      submitting,
      announcement,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      submitOrder,
      clearSession,
    }),
    [
      items,
      totals,
      submitting,
      announcement,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      submitOrder,
      clearSession,
    ],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
    </CartContext.Provider>
  );
}

export { ApiError };
