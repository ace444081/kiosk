import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPeso } from '@kiosk/shared';
import { aggregateTrend } from './analytics-trend.js';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="analytics-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => {
        const money = item.dataKey !== 'orders';
        return (
          <span key={item.dataKey}>
            <i style={{ backgroundColor: item.color }} aria-hidden="true" />
            {item.name}: {money ? formatPeso(item.value) : `${item.value} orders`}
          </span>
        );
      })}
    </div>
  );
}

export function AnalyticsTrendChart({ daily, from, to, title, description, compact = false }) {
  const { t } = useTranslation();
  const trend = useMemo(() => aggregateTrend(daily, from, to), [daily, from, to]);
  const moneyTick = (value) => formatPeso(value).replace('.00', '');
  const ordersTick = (value) => `${value}`;
  const first = trend.rows[0];
  const last = trend.rows.at(-1);
  const accessibleSummary =
    first && last
      ? `${title}. ${first.label} through ${last.label}. ${last.orders} orders in the latest bucket.`
      : `${title}. ${t('admin.noPeriodOrders')}`;

  return (
    <section className={`analytics-trend-panel ${compact ? 'analytics-trend-panel-compact' : ''}`}>
      <header className="analytics-chart-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <span className="analytics-grain-label">
          {trend.granularity === 'day'
            ? t('admin.chartDaily')
            : trend.granularity === 'week'
              ? t('admin.chartWeekly')
              : trend.granularity === 'month'
                ? t('admin.chartMonthly')
                : t('admin.chartYearly')}
        </span>
      </header>
      {trend.rows.length ? (
        <>
          <div className="analytics-chart-wrap" role="img" aria-label={accessibleSummary}>
            <ResponsiveContainer width="100%" height={compact ? 250 : 310}>
              <ComposedChart data={trend.rows} margin={{ top: 12, right: 10, bottom: 2, left: 4 }}>
                <CartesianGrid stroke="#e4e9ef" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={{ stroke: '#cfd7e1' }}
                  tickLine={false}
                  minTickGap={24}
                  tick={{ fill: '#66758a', fontSize: 11 }}
                />
                <YAxis
                  yAxisId="money"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#66758a', fontSize: 11 }}
                  tickFormatter={moneyTick}
                  width={64}
                />
                <YAxis
                  yAxisId="orders"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#66758a', fontSize: 11 }}
                  tickFormatter={ordersTick}
                  allowDecimals={false}
                  width={42}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: '#bbc6d3', strokeDasharray: '4 4' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar
                  yAxisId="orders"
                  dataKey="orders"
                  name={t('admin.totalOrders')}
                  fill="#d8e0ea"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                />
                <Line
                  yAxisId="money"
                  type="monotone"
                  dataKey="cashCentavos"
                  name={t('admin.cashReceived')}
                  stroke="#21384b"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#21384b', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#c87558', stroke: '#fff', strokeWidth: 2 }}
                />
                <Line
                  yAxisId="money"
                  type="monotone"
                  dataKey="demoCentavos"
                  name={t('admin.demoWalletSimulated')}
                  stroke="#c49a58"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: '#c49a58', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#c49a58', stroke: '#fff', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="analytics-chart-footnote">{accessibleSummary}</p>
        </>
      ) : (
        <div className="dashboard-empty-panel">{t('admin.noPeriodOrders')}</div>
      )}
    </section>
  );
}
