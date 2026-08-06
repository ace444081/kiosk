import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

function shortNumber(value) {
  return value?.split('-').at(-1) || value;
}

function chime() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  [660, 880].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.045;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + index * 0.15);
    oscillator.stop(context.currentTime + 0.13 + index * 0.15);
  });
}

export function OrderBoard() {
  const [orders, setOrders] = useState([]);
  const [connection, setConnection] = useState('connecting');
  const [sound, setSound] = useState(false);
  const previousServing = useRef(new Set());
  const refresh = useCallback(async () => {
    try {
      const payload = await api.get('/orders/board');
      const serving = payload.orders.filter((order) => order.publicStatus === 'now_serving');
      if (sound && serving.some((order) => !previousServing.current.has(order.orderNumber)))
        chime();
      previousServing.current = new Set(serving.map((order) => order.orderNumber));
      setOrders(payload.orders);
      setConnection('live');
    } catch {
      setConnection('offline');
    }
  }, [sound]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 5000);
    const source = new EventSource('/api/v1/orders/board/events');
    source.addEventListener('refresh', refresh);
    source.onerror = () => setConnection('polling');
    return () => {
      clearInterval(poll);
      source.close();
    };
  }, [refresh]);

  const setup = async () => {
    setSound(true);
    chime();
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* visual display remains usable */
    }
  };
  const preparing = orders.filter((order) => order.publicStatus === 'preparing');
  const serving = orders.filter((order) => order.publicStatus === 'now_serving');

  return (
    <main className="order-board">
      <header>
        <div>
          <img src="/placeholders/logo.svg" alt="Sweet Gonz Bakeshop Café" />
          <span>Order status · Katayuan ng order</span>
        </div>
        <div>
          <span className={`board-connection ${connection}`}>{connection}</span>
          <button onClick={setup}>{sound ? 'Sound on' : 'Enable sound & fullscreen'}</button>
        </div>
      </header>
      {connection === 'offline' && (
        <div className="board-offline">Connection lost — the last known order status is shown.</div>
      )}
      <section className="board-columns">
        <div className="board-lane preparing">
          <div className="board-lane-title">
            <p>Preparing</p>
            <h1>Inihahanda</h1>
            <span>{preparing.length}</span>
          </div>
          <div className="board-numbers">
            {preparing.length ? (
              preparing.map((order) => (
                <strong key={order.orderNumber}>{shortNumber(order.orderNumber)}</strong>
              ))
            ) : (
              <p>
                No orders preparing
                <br />
                <small>Walang inihahandang order</small>
              </p>
            )}
          </div>
        </div>
        <div className="board-lane serving">
          <div className="board-lane-title">
            <p>Now serving</p>
            <h1>Ihahain na</h1>
            <span>{serving.length}</span>
          </div>
          <div className="board-numbers">
            {serving.length ? (
              serving.map((order) => (
                <strong key={order.orderNumber}>{shortNumber(order.orderNumber)}</strong>
              ))
            ) : (
              <p>
                Please wait for your number
                <br />
                <small>Hintayin ang inyong numero</small>
              </p>
            )}
          </div>
        </div>
      </section>
      <footer>
        Please collect your order when your number appears under Now Serving. · Kunin ang inyong
        order kapag lumabas ang numero sa Ihahain na.
      </footer>
    </main>
  );
}
