<script setup lang="ts">
/** Admin catalog management view for component CRUD and commercial updates. */
import { onMounted, reactive, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { catalogService, type CatalogListParams } from '@/services/catalogService';
import { useNotificationStore } from '@/store/notificationStore';
import type { CatalogItem } from '@/types/catalog';
import { ApiError } from '@/types/api';
import { groupCatalog, dimensionLabel, categoryLabel, typeLabel, type TypeGroup, type CategoryGroup } from '@/utils/catalogGrouping';
import { formatCurrencyFromCents } from '@/i18n/format';

const { t } = useI18n();
const notifications = useNotificationStore();

const items = ref<CatalogItem[]>([]);
const loading = ref(false);
const creating = ref(false);
const deletingId = ref('');
const updatingId = ref('');
const error = ref('');

const search = ref('');
const categoryFilter = ref('');
const availableOnly = ref(false);

const isCreateModalOpen = ref(false);

const createForm = reactive({
  sku: '',
  name: '',
  description: '',
  category: 'TONDO',
  Type: 'PIEDINO',
  priceEuro: '0',
  isAvailable: true,
  imageUrl: '',
  widthMm: '0',
  heightMm: '0',
  depthMm: '0',
  compatibleCategory: '',
});

const editCommercial = reactive<Record<string, { priceEuro: string; isAvailable: boolean }>>({});

const categories = ['TONDO', 'QUADRO', 'KUBE', 'INTELLIGENTE'] as const;
const componentTypes = ['PIEDINO', 'MONTANTE', 'RIPIANO', 'TERMINALE', 'MENSOLA'] as const;

onMounted(() => {
  void load();
});

/** Formats prices from cents for admin table display. */
function formatCurrency(cents: number): string {
  return formatCurrencyFromCents(cents);
}

/** Builds catalog query parameters from current admin filters. */
function buildListParams(): CatalogListParams {
  return {
    page: 1,
    limit: 100,
    search: search.value.trim() || undefined,
    category: categoryFilter.value || undefined,
    available: availableOnly.value ? true : undefined,
  };
}

/** Converts euro decimal input to integer cents expected by APIs. */
function parseEuroToCents(value: string): number {
  const normalized = value.replace(',', '.').trim();
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(t('admin.catalog.errors.invalidPrice'));
  }
  return Math.round(num * 100);
}

/** Parses and validates non-negative integer dimensions from form inputs. */
function parseNonNegativeInt(value: string, fieldLabel: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(t('admin.catalog.errors.invalidField', { field: fieldLabel }));
  }
  return n;
}

/** Initializes editable commercial fields from loaded catalog items. */
function initCommercialState(list: CatalogItem[]): void {
  for (const item of list) {
    editCommercial[item.id] = {
      priceEuro: (item.price / 100).toFixed(2).replace('.', ','),
      isAvailable: item.isAvailable,
    };
  }
}

const groupedCatalog = computed<CategoryGroup[]>(() => groupCatalog(items.value));

// Ricorda la variante (misura) selezionata per ogni gruppo Category/Type;
// le azioni di modifica/eliminazione agiscono sulla variante corrente.
const selectedVariantId = reactive<Record<string, string>>({});

function selectedVariant(group: TypeGroup): CatalogItem {
  const chosenId = selectedVariantId[group.key];
  const chosen = chosenId ? group.variants.find((v) => v.id === chosenId) : undefined;
  if (chosen) return chosen;
  return group.variants[0];
}

function onVariantChange(group: TypeGroup, event: Event): void {
  selectedVariantId[group.key] = (event.target as HTMLSelectElement).value;
}

/** Loads catalog list for admin management and syncs editable state map. */
async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const result = await catalogService.list(buildListParams());
    items.value = result.items;
    initCommercialState(result.items);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : t('admin.catalog.errors.loadFailed');
  } finally {
    loading.value = false;
  }
}

/** Resets the create-component modal form to default values. */
function resetCreateForm(): void {
  createForm.sku = '';
  createForm.name = '';
  createForm.description = '';
  createForm.category = 'TONDO';
  createForm.Type = 'PIEDINO';
  createForm.priceEuro = '0';
  createForm.isAvailable = true;
  createForm.imageUrl = '';
  createForm.widthMm = '0';
  createForm.heightMm = '0';
  createForm.depthMm = '0';
  createForm.compatibleCategory = '';
}

/** Opens creation modal and prepares a clean form state. */
function openCreateModal(): void {
  resetCreateForm();
  isCreateModalOpen.value = true;
}

/** Closes component creation modal. */
function closeCreateModal(): void {
  isCreateModalOpen.value = false;
}

/** Creates a new catalog component and refreshes the admin list. */
async function createComponent(): Promise<void> {
  creating.value = true;
  try {
    const compatibleWith = createForm.compatibleCategory ? [createForm.compatibleCategory] : [];

    const created = await catalogService.create({
      sku: createForm.sku.trim(),
      name: createForm.name.trim(),
      description: createForm.description.trim(),
      category: createForm.category,
      Type: createForm.Type,
      price: parseEuroToCents(createForm.priceEuro),
      isAvailable: createForm.isAvailable,
      imageUrl: createForm.imageUrl.trim(),
      dimensions: {
        widthMm: parseNonNegativeInt(createForm.widthMm, t('admin.catalog.fields.width')),
        heightMm: parseNonNegativeInt(createForm.heightMm, t('admin.catalog.fields.height')),
        depthMm: parseNonNegativeInt(createForm.depthMm, t('admin.catalog.fields.depth')),
      },
      compatibleWith,
    });

    notifications.addToast('success', t('admin.catalog.toasts.created', { sku: created.sku }));
    resetCreateForm();
    closeCreateModal();
    await load();
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : t('admin.catalog.errors.createFailed');
    notifications.addToast('error', msg);
  } finally {
    creating.value = false;
  }
}

/** Saves price and availability updates for a single catalog component. */
async function saveCommercial(item: CatalogItem): Promise<void> {
  const state = editCommercial[item.id];
  if (!state) return;

  updatingId.value = item.id;
  try {
    const updated = await catalogService.update(item.id, {
      expectedVersion: item.version,
      price: parseEuroToCents(state.priceEuro),
      isAvailable: state.isAvailable,
    });

    items.value = items.value.map((current) => (current.id === updated.id ? updated : current));
    editCommercial[updated.id] = {
      priceEuro: (updated.price / 100).toFixed(2).replace('.', ','),
      isAvailable: updated.isAvailable,
    };
    notifications.addToast('success', t('admin.catalog.toasts.updated', { sku: updated.sku }));
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : t('admin.catalog.errors.updateFailed');
    notifications.addToast('error', msg);
  } finally {
    updatingId.value = '';
  }
}

/** Deletes a catalog component after explicit user confirmation. */
async function deleteComponent(item: CatalogItem): Promise<void> {
  const confirmDelete = confirm(t('admin.catalog.deleteConfirm', { sku: item.sku }));
  if (!confirmDelete) return;

  deletingId.value = item.id;
  try {
    await catalogService.remove(item.id);
    items.value = items.value.filter((current) => current.id !== item.id);
    delete editCommercial[item.id];
    notifications.addToast('success', t('admin.catalog.toasts.deleted', { sku: item.sku }));
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : t('admin.catalog.errors.deleteFailed');
    notifications.addToast('error', msg);
  } finally {
    deletingId.value = '';
  }
}
</script>

<template>
  <div class="view-container">
    <header class="header">
      <div>
        <h1>{{ t('admin.catalog.title') }}</h1>
        <p class="subtitle">{{ t('admin.catalog.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <button class="btn btn--add" @click="openCreateModal" :aria-label="t('admin.catalog.addComponentAria')">+</button>
        <button class="btn btn--light" :disabled="loading" @click="load">{{ t('admin.catalog.refresh') }}</button>
      </div>
    </header>

    <div v-if="isCreateModalOpen" class="modal-overlay" @click.self="closeCreateModal">
      <section class="modal-card">
        <div class="modal-header">
          <h2>{{ t('admin.catalog.modal.addComponent') }}</h2>
          <button class="btn btn--light" :disabled="creating" @click="closeCreateModal">{{ t('admin.catalog.modal.close') }}</button>
        </div>
        <p class="required-note"><span class="required-asterisk">*</span> {{ t('admin.catalog.modal.requiredNote') }}</p>

        <div class="wizard-grid wizard-grid--modal">
          <label class="field">
            <span class="field__label">{{ t('admin.catalog.fields.sku') }} <span class="required-asterisk">*</span></span>
            <input v-model="createForm.sku" class="field__input" type="text" :placeholder="t('admin.catalog.placeholders.sku')" />
          </label>
          <label class="field">
            <span class="field__label">{{ t('admin.catalog.fields.name') }} <span class="required-asterisk">*</span></span>
            <input v-model="createForm.name" class="field__input" type="text" :placeholder="t('admin.catalog.placeholders.name')" />
          </label>
          <label class="field">
            <span class="field__label">{{ t('admin.catalog.fields.category') }} <span class="required-asterisk">*</span></span>
            <select v-model="createForm.category" class="field__input">
              <option v-for="category in categories" :key="category" :value="category">{{ categoryLabel(category) }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">{{ t('admin.catalog.fields.type') }} <span class="required-asterisk">*</span></span>
            <select v-model="createForm.Type" class="field__input">
              <option v-for="type in componentTypes" :key="type" :value="type">{{ typeLabel(type) }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">{{ t('admin.catalog.fields.price') }} <span class="required-asterisk">*</span></span>
            <input v-model="createForm.priceEuro" class="field__input" type="text" :placeholder="t('admin.catalog.placeholders.price')" />
          </label>
          <label class="field checkbox-field">
            <input v-model="createForm.isAvailable" type="checkbox" />
            <span class="field__label">{{ t('admin.catalog.fields.available') }}</span>
          </label>
          <label class="field field--full">
            <span class="field__label">{{ t('admin.catalog.fields.description') }} <span class="required-asterisk">*</span></span>
            <textarea v-model="createForm.description" class="field__input" rows="3" :placeholder="t('admin.catalog.placeholders.description')" />
          </label>
          <label class="field">
            <span class="field__label">{{ t('admin.catalog.fields.width') }} (mm) <span class="required-asterisk">*</span></span>
            <input v-model="createForm.widthMm" class="field__input" type="text" />
          </label>
          <label class="field">
            <span class="field__label">{{ t('admin.catalog.fields.height') }} (mm) <span class="required-asterisk">*</span></span>
            <input v-model="createForm.heightMm" class="field__input" type="text" />
          </label>
          <label class="field">
            <span class="field__label">{{ t('admin.catalog.fields.depth') }} (mm) <span class="required-asterisk">*</span></span>
            <input v-model="createForm.depthMm" class="field__input" type="text" />
          </label>
          <label class="field field--full">
            <span class="field__label">{{ t('admin.catalog.fields.imageUrl') }}</span>
            <input v-model="createForm.imageUrl" class="field__input" type="text" :placeholder="t('admin.catalog.placeholders.imageUrl')" />
          </label>
          <label class="field field--full">
            <span class="field__label">{{ t('admin.catalog.fields.compatibleCategory') }}</span>
            <select v-model="createForm.compatibleCategory" class="field__input">
              <option value="">{{ t('admin.catalog.none') }}</option>
              <option v-for="category in categories" :key="`compatible-${category}`" :value="category">{{ categoryLabel(category) }}</option>
            </select>
          </label>
        </div>

        <div class="wizard-actions">
          <button class="btn btn--light" :disabled="creating" @click="closeCreateModal">{{ t('admin.catalog.modal.cancel') }}</button>
          <button class="btn btn--primary" :disabled="creating" @click="createComponent">
            {{ creating ? t('admin.catalog.modal.creating') : t('admin.catalog.modal.addComponent') }}
          </button>
        </div>
      </section>
    </div>

    <section class="filters">
      <label class="field">
        <span class="field__label">{{ t('admin.catalog.filters.search') }}</span>
        <input v-model="search" class="field__input" type="text" @keyup.enter="load" />
      </label>
      <label class="field">
        <span class="field__label">{{ t('admin.catalog.filters.category') }}</span>
        <select v-model="categoryFilter" class="field__input" @change="load">
          <option value="">{{ t('admin.catalog.filters.all') }}</option>
          <option v-for="category in categories" :key="`filter-${category}`" :value="category">{{ categoryLabel(category) }}</option>
        </select>
      </label>
      <label class="checkbox-field">
        <input v-model="availableOnly" type="checkbox" @change="load" />
        <span class="field__label">{{ t('admin.catalog.filters.availableOnly') }}</span>
      </label>
      <button class="btn btn--primary" :disabled="loading" @click="load">{{ t('admin.catalog.filters.filter') }}</button>
    </section>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
    <p v-if="loading" class="placeholder">{{ t('admin.catalog.loading') }}</p>
    <p v-else-if="items.length === 0" class="placeholder">{{ t('admin.catalog.empty') }}</p>

    <template v-else>
      <section v-for="catGroup in groupedCatalog" :key="catGroup.category" class="category-section">
        <h2 class="category-section__title">{{ catGroup.label }}</h2>

        <div class="list">
          <article v-for="group in catGroup.types" :key="group.key" class="row">
            <div class="row__main">
              <h3>{{ group.label }}</h3>
              <p class="meta">{{ selectedVariant(group).sku }} · {{ catGroup.category }} · {{ group.type }}</p>
              <p class="meta">{{ t('admin.catalog.row.version', { version: selectedVariant(group).version }) }}</p>

              <label class="field">
                <span class="field__label">{{ t('admin.catalog.row.size') }}</span>
                <select
                  class="field__input"
                  :aria-label="t('admin.catalog.row.sizeAria', { label: group.label })"
                  :value="selectedVariant(group).id"
                  @change="onVariantChange(group, $event)"
                >
                  <option v-for="variant in group.variants" :key="variant.id" :value="variant.id">
                    {{ dimensionLabel(variant) }}
                  </option>
                </select>
              </label>
            </div>

            <div class="row__commercial">
              <label class="field">
                <span class="field__label">{{ t('admin.catalog.fields.price') }}</span>
                <input
                  v-model="editCommercial[selectedVariant(group).id].priceEuro"
                  class="field__input field__input--compact"
                  type="text"
                />
              </label>
              <label class="checkbox-field">
                <input v-model="editCommercial[selectedVariant(group).id].isAvailable" type="checkbox" />
                <span class="field__label">{{ t('admin.catalog.fields.available') }}</span>
              </label>
              <p class="meta">{{ t('admin.catalog.row.current', { price: formatCurrency(selectedVariant(group).price) }) }}</p>
            </div>

            <div class="row__actions">
              <button
                class="btn btn--primary"
                :disabled="updatingId === selectedVariant(group).id"
                @click="saveCommercial(selectedVariant(group))"
              >
                {{ updatingId === selectedVariant(group).id ? t('admin.catalog.row.saving') : t('admin.catalog.row.savePrice') }}
              </button>
              <button
                class="btn btn--danger"
                :disabled="deletingId === selectedVariant(group).id"
                @click="deleteComponent(selectedVariant(group))"
              >
                {{ deletingId === selectedVariant(group).id ? t('admin.catalog.row.deleting') : t('admin.catalog.row.deleteComponent') }}
              </button>
            </div>
          </article>
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

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.subtitle {
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}

.filters,
.list {
  margin-top: var(--space-5);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 25, 0.45);
  display: grid;
  place-items: center;
  z-index: 40;
  padding: var(--space-4);
}

.modal-card {
  width: min(960px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.required-note {
  margin-top: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.wizard-grid {
  margin-top: var(--space-4);
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: var(--space-3);
}

.wizard-grid--modal {
  margin-top: var(--space-3);
}

.wizard-actions {
  margin-top: var(--space-4);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.filters {
  display: grid;
  grid-template-columns: 2fr 1fr auto auto;
  gap: var(--space-3);
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field--full {
  grid-column: 1 / -1;
}

.field__label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.required-asterisk {
  color: var(--color-error);
  font-weight: 700;
}

.field__input {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  font: inherit;
}

.field__input--compact {
  min-width: 130px;
}

.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
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

.category-section {
  margin-top: var(--space-8);
}

.category-section__title {
  font-size: var(--font-size-2xl);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}

.list {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.row {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: grid;
  grid-template-columns: 1.2fr 1fr auto;
  gap: var(--space-4);
  align-items: center;
}

.row__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.row__main h3 {
  margin: 0;
}

.meta {
  margin: 2px 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.row__commercial {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--space-3);
}

.row__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
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

.btn--add {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--color-admin-accent);
  color: #fff;
  font-size: 1.4rem;
  line-height: 1;
  padding: 0;
}

.btn--light {
  background: var(--color-surface-raised);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn--danger {
  background: var(--color-error-subtle);
  color: var(--color-error);
  border: 1px solid #f0cccc;
}

@media (max-width: 1100px) {
  .row {
    grid-template-columns: 1fr;
  }

  .row__actions {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .filters,
  .wizard-grid {
    grid-template-columns: 1fr;
  }
}
</style>
