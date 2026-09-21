<script setup lang="ts">
/** Dashboard view for configuration overview, quick creation, and reorder actions. */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { cadService } from '@/services/cadService';
import { useNotificationStore } from '@/store/notificationStore';
import type { Category, ConfigurationDto, ConfigurationStatus } from '@/types/cad';
import { ApiError } from '@/types/api';
import { getIntlLocale } from '@/i18n/format';
import { CATEGORY_ORDER, categoryLabel } from '@/utils/catalogGrouping';

const router = useRouter();
const notifications = useNotificationStore();
const { t } = useI18n();

const loading = ref(false);
const createLoading = ref(false);
const reorderLoadingId = ref<string | null>(null);
const error = ref('');

const total = ref(0);
const draft = ref(0);
const readyForFinalize = ref(0);
const finalized = ref(0);

const recent = ref<ConfigurationDto[]>([]);

const quickName = ref(t('configurations.quickCreate.defaultName'));
const quickCategory = ref<Category | ''>('');

const inProgress = computed(() => Math.max(0, total.value - finalized.value));

onMounted(() => {
  void loadDashboard();
});

/** Formats ISO datetime values for configuration cards. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** Returns total configurations for a single lifecycle status. */
async function countByStatus(status: ConfigurationStatus): Promise<number> {
  const result = await cadService.list({ status, page: 1, limit: 1 });
  return result.total;
}

/** Loads dashboard KPIs and recent configurations in parallel. */
async function loadDashboard(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [all, draftCount, readyCount, finalizedCount, recents] = await Promise.all([
      cadService.list({ page: 1, limit: 1 }),
      countByStatus('DRAFT'),
      countByStatus('READY_FOR_FINALIZE'),
      countByStatus('FINALIZED'),
      cadService.list({ page: 1, limit: 5 }),
    ]);

    total.value = all.total;
    draft.value = draftCount;
    readyForFinalize.value = readyCount;
    finalized.value = finalizedCount;
    recent.value = recents.items;
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : t('configurations.errors.loadDashboard');
  } finally {
    loading.value = false;
  }
}

/** Creates a draft configuration from quick form and opens CAD workspace. */
async function quickCreate(): Promise<void> {
  createLoading.value = true;
  try {
    const created = await cadService.create({
      name: quickName.value.trim() || undefined,
      category: quickCategory.value || undefined,
    });
    notifications.addToast('success', t('configurations.toasts.created', { name: created.name }));
    await router.push({ name: 'cad', query: { configurationId: created.id } });
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : t('configurations.errors.create');
    notifications.addToast('error', msg);
  } finally {
    createLoading.value = false;
  }
}

/** Opens an existing configuration directly in the CAD view. */
async function openInCad(configuration: ConfigurationDto): Promise<void> {
  await router.push({ name: 'cad', query: { configurationId: configuration.id } });
}

/** Reorders a finalized configuration and redirects to cart overview. */
async function reorder(configuration: ConfigurationDto): Promise<void> {
  reorderLoadingId.value = configuration.id;
  try {
    await cadService.reorder(configuration.id);
    notifications.addToast('success', t('configurations.toasts.itemsAddedToCart', { name: configuration.name }));
    await router.push({ name: 'cart' });
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : t('configurations.errors.reorder');
    notifications.addToast('error', msg);
  } finally {
    reorderLoadingId.value = null;
  }
}
</script>

<template>
  <div class="view-container">
    <header class="header">
      <div>
        <h1>{{ t('configurations.title') }}</h1>
        <p class="subtitle">{{ t('configurations.subtitle') }}</p>
      </div>
      <button class="btn btn--light" :disabled="loading" @click="loadDashboard">{{ t('configurations.actions.refresh') }}</button>
    </header>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>

    <section class="metrics" v-if="!loading">
      <article class="metric-card">
        <span class="metric-label">{{ t('configurations.metrics.total') }}</span>
        <strong class="metric-value">{{ total }}</strong>
      </article>
      <article class="metric-card">
        <span class="metric-label">{{ t('configurations.metrics.draft') }}</span>
        <strong class="metric-value">{{ draft }}</strong>
      </article>
      <article class="metric-card">
        <span class="metric-label">{{ t('configurations.metrics.readyForFinalize') }}</span>
        <strong class="metric-value">{{ readyForFinalize }}</strong>
      </article>
      <article class="metric-card">
        <span class="metric-label">{{ t('configurations.metrics.finalized') }}</span>
        <strong class="metric-value">{{ finalized }}</strong>
      </article>
      <article class="metric-card metric-card--accent">
        <span class="metric-label">{{ t('configurations.metrics.inProgress') }}</span>
        <strong class="metric-value">{{ inProgress }}</strong>
      </article>
    </section>
    <p v-else class="placeholder">{{ t('configurations.placeholders.loadingDashboard') }}</p>

    <section class="quick-create">
      <h2>{{ t('configurations.quickCreate.title') }}</h2>
      <div class="quick-create__grid">
        <label class="field">
          <span class="field__label">{{ t('configurations.quickCreate.nameLabel') }}</span>
          <input v-model="quickName" class="field__input" type="text" :aria-label="t('configurations.quickCreate.nameAriaLabel')" :placeholder="t('configurations.quickCreate.namePlaceholder')" />
        </label>
        <label class="field">
          <span class="field__label">{{ t('configurations.quickCreate.categoryLabel') }}</span>
          <select v-model="quickCategory" class="field__input" :aria-label="t('configurations.quickCreate.categoryAriaLabel')">
            <option value="">{{ t('configurations.quickCreate.categoryNone') }}</option>
            <option v-for="category in CATEGORY_ORDER" :key="category" :value="category">
              {{ categoryLabel(category) }}
            </option>
          </select>
        </label>
        <button class="btn btn--primary" :disabled="createLoading" :aria-label="t('configurations.quickCreate.createAriaLabel')" @click="quickCreate">
          {{ createLoading ? t('configurations.actions.creating') : t('configurations.actions.createAndOpen') }}
        </button>
      </div>
    </section>

    <section class="recent">
      <h2>{{ t('configurations.recent.title') }}</h2>
      <p v-if="loading" class="placeholder">{{ t('configurations.placeholders.loadingList') }}</p>
      <p v-else-if="recent.length === 0" class="placeholder">{{ t('configurations.placeholders.empty') }}</p>
      <div v-else class="recent-list">
        <article class="recent-item" v-for="item in recent" :key="item.id">
          <div>
            <h3>{{ item.name }}</h3>
            <p class="meta">{{ item.status }} · {{ item.category || t('configurations.recent.noCategory') }}</p>
            <p class="meta">{{ t('configurations.recent.updatedAt', { date: formatDate(item.updatedAt) }) }}</p>
          </div>
          <div class="recent-item__actions">
            <button
              v-if="item.status === 'FINALIZED'"
              class="btn btn--light"
              :disabled="reorderLoadingId === item.id"
              :aria-label="t('configurations.recent.reorderAriaLabel', { name: item.name })"
              @click="reorder(item)"
            >
              {{ reorderLoadingId === item.id ? t('configurations.actions.reordering') : t('configurations.actions.reorder') }}
            </button>
            <button class="btn btn--light" :aria-label="t('configurations.recent.openAriaLabel', { name: item.name })" @click="openInCad(item)">{{ t('configurations.actions.openInCad') }}</button>
          </div>
        </article>
      </div>
    </section>
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

.subtitle {
  margin-top: var(--space-1);
  color: var(--color-text-muted);
}

.metrics {
  margin-top: var(--space-5);
  display: grid;
  grid-template-columns: repeat(5, minmax(140px, 1fr));
  gap: var(--space-3);
}

.metric-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.metric-card--accent {
  border-color: var(--color-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 25%, transparent);
}

.metric-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.metric-value {
  font-size: var(--font-size-2xl);
  line-height: 1;
}

.quick-create,
.recent {
  margin-top: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.quick-create__grid {
  margin-top: var(--space-3);
  display: grid;
  grid-template-columns: 2fr 1fr auto;
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

.recent-list {
  margin-top: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.recent-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  padding: var(--space-3);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.recent-item__actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.recent-item h3 {
  font-size: var(--font-size-base);
}

.meta {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  margin-top: 2px;
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
  background: var(--color-accent);
  color: #fff;
}

.btn--light {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

@media (max-width: 1000px) {
  .header {
    flex-direction: column;
  }

  .metrics {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }

  .quick-create__grid {
    grid-template-columns: 1fr;
  }

  .recent-item {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 760px) {
  .view-container {
    padding: var(--space-6) var(--space-4);
  }

  .metrics {
    grid-template-columns: 1fr;
  }
}
</style>
