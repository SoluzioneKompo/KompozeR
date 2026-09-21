<script setup lang="ts">
/** Admin reporting view for date-range trends, KPIs, and daily order analytics. */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { reportingService } from '@/services/reportingService';
import type { OrderTrendDto } from '@/types/reporting';
import { ApiError } from '@/types/api';
import { formatCurrencyFromCents, getIntlLocale } from '@/i18n/format';

const { t } = useI18n();
const loading = ref(false);
const error = ref('');

const from = ref('');
const to = ref('');
const trend = ref<OrderTrendDto | null>(null);

const chartWidth = 860;
const chartHeight = 240;
const barGap = 10;

const maxOrders = computed(() => {
  if (!trend.value || trend.value.points.length === 0) {
    return 1;
  }
  return Math.max(1, ...trend.value.points.map((point) => point.totalOrders));
});

const bars = computed(() => {
  if (!trend.value || trend.value.points.length === 0) {
    return [];
  }

  const count = trend.value.points.length;
  const barWidth = Math.max(8, (chartWidth - (count - 1) * barGap) / count);

  return trend.value.points.map((point, index) => {
    const x = index * (barWidth + barGap);
    const height = Math.round((point.totalOrders / maxOrders.value) * chartHeight);
    const y = chartHeight - height;

    return {
      x,
      y,
      width: barWidth,
      height,
      label: point.date.slice(5),
      totalOrders: point.totalOrders,
      revenue: point.revenue,
    };
  });
});

onMounted(() => {
  void load();
});

/** Formats monetary KPI values from cents to localized euro string. */
function formatCurrency(cents: number): string {
  return formatCurrencyFromCents(cents);
}

/** Formats reporting date keys as local calendar dates. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: 'short',
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

/** Loads trend dataset for selected date range filters. */
async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    trend.value = await reportingService.orderTrend({
      from: from.value || undefined,
      to: to.value || undefined,
    });
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : t('admin.reports.errors.loadFailed');
  } finally {
    loading.value = false;
  }
}

/** Clears date filters and reloads report for full available range. */
async function setAllTime(): Promise<void> {
  from.value = '';
  to.value = '';
  await load();
}
</script>

<template>
  <div class="view-container">
    <header class="header">
      <div>
        <h1>{{ t('admin.reports.title') }}</h1>
      </div>
      <button class="btn btn--light" :disabled="loading" @click="load">{{ t('admin.reports.refresh') }}</button>
    </header>

    <section class="filters">
      <label class="field">
        <span class="field__label">{{ t('admin.reports.filters.from') }}</span>
        <input v-model="from" class="field__input" type="date" />
      </label>
      <label class="field">
        <span class="field__label">{{ t('admin.reports.filters.to') }}</span>
        <input v-model="to" class="field__input" type="date" />
      </label>
      <button class="btn btn--primary" :disabled="loading" @click="load">{{ t('admin.reports.filters.apply') }}</button>
      <button class="btn btn--light" :disabled="loading" @click="setAllTime">{{ t('admin.reports.filters.allTime') }}</button>
    </section>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
    <p v-if="loading" class="placeholder">{{ t('admin.reports.loading') }}</p>
    <p v-else-if="!trend" class="placeholder">{{ t('admin.reports.empty') }}</p>

    <template v-else>
      <section class="kpis">
        <article class="kpi-card">
          <span class="kpi-label">{{ t('admin.reports.kpis.period') }}</span>
          <strong class="kpi-value">{{ formatDate(trend.from) }} - {{ formatDate(trend.to) }}</strong>
        </article>
        <article class="kpi-card">
          <span class="kpi-label">{{ t('admin.reports.kpis.totalOrders') }}</span>
          <strong class="kpi-value">{{ trend.totals.totalOrders }}</strong>
        </article>
        <article class="kpi-card">
          <span class="kpi-label">{{ t('admin.reports.kpis.totalRevenue') }}</span>
          <strong class="kpi-value">{{ formatCurrency(trend.totals.totalRevenue) }}</strong>
        </article>
      </section>

      <section class="chart-card" v-if="bars.length > 0">
        <h2>{{ t('admin.reports.chart.title') }}</h2>
        <div class="chart-scroll">
          <svg :viewBox="`0 0 ${chartWidth} ${chartHeight + 26}`" :width="chartWidth" :height="chartHeight + 26" role="img" :aria-label="t('admin.reports.chart.ariaLabel')">
            <line x1="0" :y1="chartHeight" :x2="chartWidth" :y2="chartHeight" stroke="#d9d4cf" stroke-width="1" />

            <g v-for="bar in bars" :key="bar.label">
              <rect
                :x="bar.x"
                :y="bar.y"
                :width="bar.width"
                :height="bar.height"
                rx="3"
                fill="#5a6880"
              />
              <text
                :x="bar.x + bar.width / 2"
                :y="chartHeight + 14"
                text-anchor="middle"
                font-size="10"
                fill="#6b6460"
              >
                {{ bar.label }}
              </text>
              <title>{{ t('admin.reports.chart.tooltip', { count: bar.totalOrders, revenue: formatCurrency(bar.revenue) }) }}</title>
            </g>
          </svg>
        </div>
      </section>

      <section class="table-card">
        <h2>{{ t('admin.reports.table.title') }}</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ t('admin.reports.table.headers.date') }}</th>
                <th>{{ t('admin.reports.table.headers.totalOrders') }}</th>
                <th>{{ t('admin.reports.table.headers.submitted') }}</th>
                <th>{{ t('admin.reports.table.headers.done') }}</th>
                <th>{{ t('admin.reports.table.headers.cancelled') }}</th>
                <th>{{ t('admin.reports.table.headers.revenue') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="point in trend.points" :key="point.date">
                <td>{{ formatDate(point.date) }}</td>
                <td>{{ point.totalOrders }}</td>
                <td>{{ point.submitted }}</td>
                <td>{{ point.done }}</td>
                <td>{{ point.cancelled }}</td>
                <td>{{ formatCurrency(point.revenue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.view-container {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
}

.filters {
  margin-top: var(--space-5);
  display: grid;
  grid-template-columns: 180px 180px auto auto;
  gap: var(--space-3);
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field__label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.field__input {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
}

.error {
  margin-top: var(--space-4);
  color: var(--color-error);
  background: var(--color-error-subtle);
  border: 1px solid #f0cccc;
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.placeholder {
  margin-top: var(--space-4);
  color: var(--color-text-muted);
}

.kpis {
  margin-top: var(--space-5);
  display: grid;
  grid-template-columns: repeat(3, minmax(170px, 1fr));
  gap: var(--space-3);
}

.kpi-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.kpi-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.kpi-value {
  font-size: var(--font-size-lg);
  line-height: 1.2;
}

.chart-card,
.table-card {
  margin-top: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.chart-scroll {
  margin-top: var(--space-3);
  overflow-x: auto;
}

.table-wrap {
  margin-top: var(--space-3);
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border-subtle);
  white-space: nowrap;
}

th {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
}

td {
  font-size: var(--font-size-sm);
}

.btn {
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--color-admin-accent);
  color: #fff;
}

.btn--light {
  background: var(--color-surface-raised);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

@media (max-width: 1100px) {
  .filters {
    grid-template-columns: 1fr 1fr;
  }

  .kpis {
    grid-template-columns: repeat(2, minmax(170px, 1fr));
  }
}

@media (max-width: 700px) {
  .kpis {
    grid-template-columns: 1fr;
  }
}
</style>
