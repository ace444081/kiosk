import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  OrderTimer,
  formatElapsed,
  getOrderTimerState,
  useOrderClock,
} from '../admin/OrderTimer.jsx';
import { getStaffStation, staffPatch } from '../services/admin-api.js';
import { useStaffWorkboard } from './useStaffWorkboard.js';

const laneMeta = {
  payment: {
    title: 'Payment',
    kicker: 'Cashier function',
    empty: 'No cash payments waiting.',
    action: 'Confirm cash received',
  },
  preparation: {
    title: 'Preparation',
    kicker: 'Kitchen function',
    empty: 'No paid orders waiting for preparation.',
  },
  handoff: {
    title: 'Handoff',
    kicker: 'Serving function',
    empty: 'No orders waiting at the serving counter.',
    action: 'Mark served',
  },
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

const stageIndex = { payment: 0, preparation: 1, handoff: 2 };

function ageStart(order, lane) {
  if (lane === 'preparation')
    return order.preparingAt || order.paymentConfirmedAt || order.createdAt;
  if (lane === 'handoff') return order.readyAt || order.createdAt;
  return order.createdAt;
}

export function ageLabel(order, lane, now) {
  const start = Date.parse(ageStart(order, lane));
  if (!Number.isFinite(start)) return 'Time unavailable';
  return `${formatElapsed(Math.floor(Math.max(0, now - start) / 1000))} waiting`;
}

export function orderState(order, lane, now) {
  if (lane === 'payment') {
    return {
      label: 'Payment due',
      tone: 'payment',
      action: 'Confirm cash',
      age: ageLabel(order, lane, now),
    };
  }
  if (lane === 'preparation' && order.status === 'preparing') {
    const timer = getOrderTimerState(order, now);
    const timerText = timer.elapsedSeconds ? formatElapsed(timer.elapsedSeconds) : 'Just started';
    return {
      label: `Preparing · ${timerText}`,
      tone: timer.phase,
      action: 'Mark ready',
      age: ageLabel(order, lane, now),
    };
  }
  if (lane === 'preparation') {
    return {
      label: 'Paid · not started',
      tone: 'paid',
      action: 'Start preparation',
      age: ageLabel(order, lane, now),
    };
  }
  return {
    label: 'Ready for handoff',
    tone: 'handoff',
    action: 'Mark served',
    age: ageLabel(order, lane, now),
  };
}

export function priorityScore(item, now) {
  const state = orderState(item.order, item.lane, now);
  if (item.lane === 'handoff') return 0;
  if (item.lane === 'preparation' && ['attention', 'red', 'overdue'].includes(state.tone)) return 1;
  if (item.lane === 'payment') return 2;
  return 3;
}

function WorkboardProgress({ lane }) {
  const active = stageIndex[lane];
  const label = `${laneMeta[lane].title} stage; ${active} of 2 previous stages complete`;
  return (
    <div className="workboard-progress" role="img" aria-label={label}>
      {Object.entries(stageIndex).map(([stage, index]) => (
        <span
          key={stage}
          className={`workboard-progress-step ${index < active ? 'complete' : ''} ${index === active ? 'current' : ''}`}
        >
          <i aria-hidden="true">{index < active ? '✓' : index + 1}</i>
          <small>{laneMeta[stage].title}</small>
        </span>
      ))}
      <span className="workboard-progress-line" aria-hidden="true" />
    </div>
  );
}

function WorkboardTicket({ order, lane, selected, onSelect, now, showLaneLabel = false }) {
  const timer = getOrderTimerState(order, now);
  const state = orderState(order, lane, now);
  const urgency = lane === 'preparation' && order.status === 'preparing' ? timer.phase : 'neutral';
  return (
    <article className={`station-ticket urgency-${urgency} ${selected ? 'selected' : ''}`}>
      <button className="ticket-select" type="button" onClick={onSelect} aria-pressed={selected}>
        <span className="ticket-topline">
          <strong>#{shortOrderNumber(order.orderNumber)}</strong>
          <time>{time(order.createdAt)}</time>
        </span>
        {showLaneLabel && <span className="ticket-lane-label">{laneMeta[lane].title}</span>}
        <span className="ticket-state">{state.label}</span>
        {lane === 'payment' && <span className="ticket-total">{money(order.totalCentavos)}</span>}
        {lane === 'preparation' && order.status === 'preparing' && (
          <OrderTimer order={order} now={now} />
        )}
        <WorkboardProgress lane={lane} />
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

function PriorityFocusCard({ item, selected, onSelect, onAction, now, disabled = false }) {
  const { order, lane } = item;
  const state = orderState(order, lane, now);
  return (
    <article
      className={`priority-focus-card priority-tone-${state.tone} ${selected ? 'selected' : ''}`}
    >
      <button
        className="priority-focus-select"
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
      >
        <span className="priority-focus-topline">
          <span>
            <small>Now</small>
            <strong>#{shortOrderNumber(order.orderNumber)}</strong>
          </span>
          <time>{state.age}</time>
        </span>
        <span className="priority-focus-stage">{laneMeta[lane].title}</span>
        <strong className="priority-focus-state">{state.label}</strong>
        <WorkboardProgress lane={lane} />
        <span className="priority-focus-items">
          {order.items.map((itemLine, index) => (
            <span key={`${itemLine.productName}-${index}`}>
              <b>{itemLine.quantity}×</b> {itemLine.productName}
              {[...itemLine.options, ...itemLine.addons].length > 0 && (
                <small>{[...itemLine.options, ...itemLine.addons].join(' · ')}</small>
              )}
            </span>
          ))}
        </span>
        {lane === 'payment' && (
          <span className="priority-focus-total">{money(order.totalCentavos)}</span>
        )}
      </button>
      <button
        type="button"
        className="priority-quick-action"
        onClick={() => onAction(item)}
        disabled={disabled}
        aria-label={`${state.action} order #${shortOrderNumber(order.orderNumber)}`}
      >
        {state.action}
      </button>
    </article>
  );
}

function PriorityQueueRow({ item, selected, onSelect, onAction, now, disabled = false }) {
  const { order, lane } = item;
  const state = orderState(order, lane, now);
  const firstItem = order.items[0];
  const remainingItems = Math.max(0, (order.items.length || 1) - 1);
  return (
    <article
      className={`priority-queue-row priority-tone-${state.tone} ${selected ? 'selected' : ''}`}
    >
      <button
        className="priority-queue-select"
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
      >
        <strong>#{shortOrderNumber(order.orderNumber)}</strong>
        <span className="priority-queue-stage">{laneMeta[lane].title}</span>
        <span className="priority-queue-state">{state.label}</span>
        <span className="priority-queue-item">
          {firstItem?.quantity || 0}× {firstItem?.productName || 'Order'}
          {remainingItems > 0 ? ` + ${remainingItems} more` : ''}
        </span>
        <span className="priority-queue-age">{state.age}</span>
      </button>
      <button
        type="button"
        className="priority-quick-action"
        onClick={() => onAction(item)}
        disabled={disabled}
        aria-label={`${state.action} order #${shortOrderNumber(order.orderNumber)}`}
      >
        {state.action}
      </button>
    </article>
  );
}

function nextAction(lane, selected) {
  if (!selected) return 'Select a ticket';
  if (lane === 'payment') return laneMeta.payment.action;
  if (lane === 'handoff') return laneMeta.handoff.action;
  return selected.status === 'placed' ? 'Start preparing' : 'Mark ready';
}

export function StaffOperations() {
  const { session, logout, sessionStation } = useOutletContext();
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('success');
  const [workView, setWorkView] = useState(() => {
    try {
      return sessionStorage.getItem('sgkiosk.workboard.view') === 'lanes' ? 'lanes' : 'priority';
    } catch {
      return 'priority';
    }
  });
  const [sound, setSound] = useState(() => localStorage.getItem('sgkiosk.station.sound') === 'on');
  const { lanes, connection, loading, error, refresh } = useStaffWorkboard(
    sessionStation || getStaffStation(),
  );
  const previousIds = useRef(new Set());
  const allOrders = useMemo(
    () => [
      ...new Map(
        Object.values(lanes)
          .flatMap((lane) => lane.orders)
          .map((order) => [order.id, order]),
      ).values(),
    ],
    [lanes],
  );
  const liveNow = useOrderClock(allOrders.length > 0);
  const selectedOrder = selected
    ? lanes[selected.lane]?.orders.find((order) => order.id === selected.id)
    : null;
  const priorityItems = useMemo(() => {
    return Object.entries(lanes)
      .flatMap(([lane, payload]) => payload.orders.map((order) => ({ lane, order })))
      .sort(
        (a, b) =>
          priorityScore(a, liveNow) - priorityScore(b, liveNow) ||
          new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime(),
      );
  }, [lanes, liveNow]);
  const focusItem = priorityItems[0] || null;
  const upNextItems = priorityItems.slice(1, 5);
  const laterCount = Math.max(0, priorityItems.length - 5);
  const quickActionsDisabled = busy || connection === 'offline';

  useEffect(() => {
    const incoming = allOrders.some((order) => !previousIds.current.has(order.id));
    if (sound && previousIds.current.size && incoming) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 740;
        gain.gain.value = 0.04;
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.12);
      }
    }
    previousIds.current = new Set(allOrders.map((order) => order.id));
    if (selected && !allOrders.some((order) => order.id === selected.id)) setSelected(null);
  }, [allOrders, selected, sound]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    localStorage.setItem('sgkiosk.station.sound', next ? 'on' : 'off');
  };

  const changeWorkView = (nextView) => {
    setWorkView(nextView);
    try {
      sessionStorage.setItem('sgkiosk.workboard.view', nextView);
    } catch {
      // Keep the view change in memory when storage is unavailable.
    }
  };

  const mutateOrder = async (target) => {
    if (!target?.order || connection === 'offline' || busy) return;
    const { lane, order } = target;
    let path = `/orders/${order.id}/status`;
    let body;
    if (lane === 'payment') {
      path = `/orders/${order.id}/payment`;
      body = { paymentStatus: 'cash_received', version: order.version };
    } else {
      const status =
        lane === 'handoff' ? 'completed' : order.status === 'placed' ? 'preparing' : 'ready';
      body = { status, version: order.version };
    }
    setBusy(true);
    setMessage('');
    try {
      await staffPatch(path, body, sessionStation || getStaffStation());
      setMessageTone('success');
      setMessage(
        lane === 'payment'
          ? 'Payment confirmed. Order moved to preparation.'
          : lane === 'handoff'
            ? 'Order served and completed.'
            : body.status === 'ready'
              ? 'Order moved to handoff.'
              : 'Preparation timer started.',
      );
      setSelected(null);
      await refresh();
    } catch (err) {
      setMessageTone('error');
      setMessage(
        err.code === 'STALE_VERSION'
          ? 'This order changed on another device. The workboard was refreshed.'
          : err.message,
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const mutate = async () => {
    if (!selectedOrder || !selected) return;
    await mutateOrder({ lane: selected.lane, order: selectedOrder });
  };

  const selectItem = (item) => {
    setSelected(selected?.id === item.order.id ? null : { id: item.order.id, lane: item.lane });
  };

  return (
    <main className="station-shell workboard-shell">
      <header className="station-header">
        <div className="station-brand">
          <img src="/placeholders/logo.svg" alt="" />
          <span>
            <small>Unified operations</small>
            <strong>Staff workboard</strong>
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
          Offline — showing the last workboard. Actions are disabled until reconnection.
        </div>
      )}
      <section className="station-toolbar workboard-toolbar">
        <div>
          <p className="station-eyebrow">Today’s live operations</p>
          <h1>{allOrders.length} orders visible across all functions</h1>
        </div>
        <div className="workboard-controls">
          <div className="workboard-view-toggle" role="group" aria-label="Workboard view">
            <button
              type="button"
              aria-pressed={workView === 'priority'}
              onClick={() => changeWorkView('priority')}
            >
              Solo priority
            </button>
            <button
              type="button"
              aria-pressed={workView === 'lanes'}
              onClick={() => changeWorkView('lanes')}
            >
              Team mode
            </button>
          </div>
        </div>
      </section>
      {message && (
        <div
          className={`station-message station-message-${messageTone}`}
          role={messageTone === 'error' ? 'alert' : 'status'}
        >
          <span className="station-message-icon" aria-hidden="true">
            {messageTone === 'error' ? '!' : '✓'}
          </span>
          <span>{message}</span>
        </div>
      )}
      {workView === 'priority' ? (
        <section
          className="workboard-priority"
          aria-busy={loading}
          aria-label="Solo priority queue"
        >
          <header className="workboard-priority-heading">
            <div>
              <p>Solo priority</p>
              <h2>One clear next action</h2>
            </div>
            <span>{priorityItems.length} visible</span>
          </header>
          <div className="workboard-priority-list">
            {loading && priorityItems.length === 0 ? (
              Array.from({ length: 3 }, (_, index) => (
                <div className="ticket-skeleton" key={index} />
              ))
            ) : priorityItems.length === 0 ? (
              <div className="station-empty">
                <span>Queue clear</span>
                <h2>Nothing needs attention</h2>
                <p>New orders will appear here automatically.</p>
              </div>
            ) : focusItem ? (
              <>
                <section className="priority-section priority-now" aria-label="Now">
                  <header className="priority-section-heading">
                    <div>
                      <span>Now</span>
                      <strong>Highest-priority action</strong>
                    </div>
                    <small>Do this first</small>
                  </header>
                  <PriorityFocusCard
                    item={focusItem}
                    selected={selected?.id === focusItem.order.id}
                    onSelect={() => selectItem(focusItem)}
                    onAction={mutateOrder}
                    now={liveNow}
                    disabled={quickActionsDisabled}
                  />
                </section>
                {upNextItems.length > 0 && (
                  <section className="priority-section priority-up-next" aria-label="Up next">
                    <header className="priority-section-heading">
                      <div>
                        <span>Up next</span>
                        <strong>Keep moving through the queue</strong>
                      </div>
                      <small>{upNextItems.length} orders</small>
                    </header>
                    <div className="priority-queue-list">
                      {upNextItems.map((item) => (
                        <PriorityQueueRow
                          key={`${item.lane}-${item.order.id}`}
                          item={item}
                          selected={selected?.id === item.order.id}
                          onSelect={() => selectItem(item)}
                          onAction={mutateOrder}
                          now={liveNow}
                          disabled={quickActionsDisabled}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {laterCount > 0 && (
                  <div className="priority-later" role="status">
                    <strong>{laterCount} more orders in the queue</strong>
                    <span>They will rise automatically as the next actions are completed.</span>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="workboard-lanes" aria-busy={loading}>
          {Object.entries(laneMeta).map(([lane, meta]) => (
            <section className="workboard-lane" key={lane} aria-label={meta.title}>
              <header className="workboard-lane-heading">
                <div>
                  <p>{meta.kicker}</p>
                  <h2>{meta.title}</h2>
                </div>
                <strong>{lanes[lane].pagination.total}</strong>
              </header>
              <div className="workboard-lane-list">
                {loading && lanes[lane].orders.length === 0 ? (
                  Array.from({ length: 2 }, (_, index) => (
                    <div className="ticket-skeleton" key={index} />
                  ))
                ) : lanes[lane].orders.length === 0 ? (
                  <div className="station-empty">
                    <span>Queue clear</span>
                    <h2>Nothing waiting</h2>
                    <p>{meta.empty}</p>
                  </div>
                ) : (
                  lanes[lane].orders.map((order) => (
                    <WorkboardTicket
                      key={order.id}
                      order={order}
                      lane={lane}
                      selected={selected?.id === order.id}
                      onSelect={() =>
                        setSelected(selected?.id === order.id ? null : { id: order.id, lane })
                      }
                      now={liveNow}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </section>
      )}
      {error && connection !== 'offline' && <p className="station-error">{error.message}</p>}
      <footer className="station-footer workboard-footer">
        <div className="station-action">
          <span>
            {selectedOrder
              ? `${laneMeta[selected.lane].title}: #${shortOrderNumber(selectedOrder.orderNumber)} selected`
              : 'Select a ticket from any lane to continue'}
          </span>
          <button
            className="station-primary"
            disabled={!selectedOrder || busy || connection === 'offline'}
            onClick={mutate}
          >
            {busy ? 'Updating…' : nextAction(selected?.lane, selectedOrder)}
          </button>
        </div>
      </footer>
    </main>
  );
}
