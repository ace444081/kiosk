import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { OrderTimer, getOrderTimerState, useOrderClock } from '../admin/OrderTimer.jsx';
import { staffPatch } from '../services/admin-api.js';
import { useStationQueue } from './useStationQueue.js';

const labels = {
  cashier: { title: 'Cashier', subtitle: 'Payment queue', action: 'Confirm cash received' },
  kitchen: { title: 'Kitchen', subtitle: 'Production queue' },
  serving: { title: 'Serving counter', subtitle: 'Handoff queue', action: 'Mark served' },
};

function shortOrderNumber(value) {
  return value?.split('-').at(-1) || value;
}

function time(value) {
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value / 100);
}

function beep() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 740;
  gain.gain.value = 0.04;
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
}

function Ticket({ order, station, selected, onSelect, now }) {
  const timer = getOrderTimerState(order, now);
  const urgency = station === 'kitchen' && order.status === 'preparing' ? timer.phase : 'neutral';
  return (
    <article className={`station-ticket urgency-${urgency} ${selected ? 'selected' : ''}`}>
      <button className="ticket-select" type="button" onClick={onSelect} aria-pressed={selected}>
        <span className="ticket-topline">
          <strong>#{shortOrderNumber(order.orderNumber)}</strong>
          <time>{time(order.createdAt)}</time>
        </span>
        <span className="ticket-state">
          {order.status === 'placed'
            ? station === 'cashier'
              ? 'PAYMENT DUE'
              : 'NEW ORDER'
            : order.status.replace('_', ' ')}
        </span>
        {station === 'cashier' && (
          <span className="ticket-total">{money(order.totalCentavos)}</span>
        )}
        {station === 'kitchen' && order.status === 'preparing' && (
          <OrderTimer order={order} now={now} />
        )}
        <span className="ticket-items">
          {order.items.map((item, index) => (
            <span key={`${item.productName}-${index}`}>
              <b>{item.quantity}×</b> {item.productName}
              {[...item.options, ...item.addons].length > 0 && (
                <small>{[...item.options, ...item.addons].join(' · ')}</small>
              )}
            </span>
          ))}
        </span>
        <span className="ticket-footer">
          {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
          <b>{selected ? 'Selected' : 'Select ticket'}</b>
        </span>
      </button>
    </article>
  );
}

export function StationScreen({ station }) {
  const { session, logout } = useOutletContext();
  const [page, setPage] = useState(1);
  const [lane, setLane] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sound, setSound] = useState(() => localStorage.getItem('sgkiosk.station.sound') === 'on');
  const { orders, pagination, connection, loading, error, refresh } = useStationQueue(
    station,
    page,
  );
  const previousIds = useRef(new Set());
  const now = useOrderClock(station === 'kitchen');
  const selected = orders.find((order) => order.id === selectedId);

  useEffect(() => {
    const incoming = orders.some((order) => !previousIds.current.has(order.id));
    if (sound && previousIds.current.size && incoming) beep();
    previousIds.current = new Set(orders.map((order) => order.id));
    if (selectedId && !orders.some((order) => order.id === selectedId)) setSelectedId(null);
  }, [orders, selectedId, sound]);

  const visible = useMemo(() => {
    if (station !== 'kitchen' || lane === 'all') return orders;
    return orders.filter((order) => order.status === lane);
  }, [lane, orders, station]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    localStorage.setItem('sgkiosk.station.sound', next ? 'on' : 'off');
    if (next) beep();
  };

  const mutate = async () => {
    if (!selected || connection === 'offline') return;
    let path = `/orders/${selected.id}/status`;
    let body;
    if (station === 'cashier') {
      path = `/orders/${selected.id}/payment`;
      body = { paymentStatus: 'cash_received', version: selected.version };
    } else {
      const status =
        station === 'serving' ? 'completed' : selected.status === 'placed' ? 'preparing' : 'ready';
      body = { status, version: selected.version };
    }
    setBusy(true);
    setMessage('');
    try {
      await staffPatch(path, body);
      setMessage(
        station === 'cashier'
          ? 'Payment confirmed. Sent to kitchen.'
          : station === 'serving'
            ? 'Order served and completed.'
            : body.status === 'ready'
              ? 'Sent to serving counter.'
              : 'Preparation timer started.',
      );
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setMessage(
        err.code === 'STALE_VERSION'
          ? 'This order changed on another device. Queue refreshed.'
          : err.message,
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const action =
    station === 'kitchen'
      ? selected?.status === 'placed'
        ? 'Start preparing'
        : 'Mark ready'
      : labels[station].action;
  return (
    <main className={`station-shell station-${station}`}>
      <header className="station-header">
        <div className="station-brand">
          <img src="/placeholders/logo.svg" alt="" />
          <span>
            <small>{labels[station].subtitle}</small>
            <strong>{labels[station].title}</strong>
          </span>
        </div>
        <div className="station-header-meta">
          <span className={`station-connection ${connection}`}>
            {connection === 'live' ? 'Live' : connection}
          </span>
          <button type="button" onClick={toggleSound}>
            Sound {sound ? 'on' : 'off'}
          </button>
          <span>{session.username}</span>
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      {connection === 'offline' && (
        <div className="station-offline" role="alert">
          Offline — showing the last queue. Actions are disabled until reconnection.
        </div>
      )}
      <section className="station-toolbar">
        <div>
          <p className="station-eyebrow">Today’s live queue</p>
          <h1>
            {pagination.total} {pagination.total === 1 ? 'order' : 'orders'} waiting
          </h1>
        </div>
        {station === 'kitchen' && (
          <div className="lane-tabs" role="tablist" aria-label="Kitchen lanes">
            {[
              ['all', 'All'],
              ['placed', 'New'],
              ['preparing', 'Preparing'],
            ].map(([key, text]) => (
              <button
                key={key}
                className={lane === key ? 'active' : ''}
                onClick={() => setLane(key)}
              >
                {text}
                <span>
                  {key === 'all'
                    ? orders.length
                    : orders.filter((order) => order.status === key).length}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      {message && (
        <div className="station-message" role="status">
          {message}
        </div>
      )}
      <section className="station-queue" aria-busy={loading}>
        {loading && orders.length === 0 ? (
          Array.from({ length: 6 }, (_, index) => <div className="ticket-skeleton" key={index} />)
        ) : visible.length === 0 ? (
          <div className="station-empty">
            <span>Queue clear</span>
            <h2>No orders waiting</h2>
            <p>New orders will appear here automatically.</p>
          </div>
        ) : (
          visible.map((order) => (
            <Ticket
              key={order.id}
              order={order}
              station={station}
              selected={order.id === selectedId}
              onSelect={() => setSelectedId(order.id === selectedId ? null : order.id)}
              now={now}
            />
          ))
        )}
      </section>
      {error && connection !== 'offline' && <p className="station-error">{error.message}</p>}
      <footer className="station-footer">
        <div className="station-pagination">
          <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </button>
          <span>
            Page {pagination.page} of {pagination.pages}
          </span>
          <button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>
            Next
          </button>
        </div>
        <div className="station-action">
          <span>
            {selected
              ? `#${shortOrderNumber(selected.orderNumber)} selected`
              : 'Select a ticket to continue'}
          </span>
          <button
            className="station-primary"
            disabled={
              !selected || busy || connection === 'offline' || selected?.status === 'completed'
            }
            onClick={mutate}
          >
            {busy ? 'Updating…' : action || 'Completed'}
          </button>
        </div>
      </footer>
    </main>
  );
}
