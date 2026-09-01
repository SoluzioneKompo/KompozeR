<script setup lang="ts">
/** Admin catalog management view for component CRUD and commercial updates. */
import { onMounted, reactive, ref, computed } from 'vue';
import { catalogService, type CatalogListParams } from '@/services/catalogService';
import { useNotificationStore } from '@/store/notificationStore';
import type { CatalogItem } from '@/types/catalog';
import { ApiError } from '@/types/api';
import { groupCatalog, dimensionLabel, type TypeGroup, type CategoryGroup } from '@/utils/catalogGrouping';

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
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
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
    throw new Error('Prezzo non valido');
  }
  return Math.round(num * 100);
}

/** Parses and validates non-negative integer dimensions from form inputs. */
function parseNonNegativeInt(value: string, fieldLabel: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`${fieldLabel} non valida`);
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
    error.value = e instanceof ApiError ? e.message : 'Errore caricamento catalogo';
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
        widthMm: parseNonNegativeInt(createForm.widthMm, 'Larghezza'),
        heightMm: parseNonNegativeInt(createForm.heightMm, 'Altezza'),
        depthMm: parseNonNegativeInt(createForm.depthMm, 'Profondita'),
      },
      compatibleWith,
    });

    notifications.addToast('success', `Componente creato: ${created.sku}`);
    resetCreateForm();
    closeCreateModal();
    await load();
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Errore creazione componente';
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
    notifications.addToast('success', `Componente ${updated.sku} aggiornato`);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Errore aggiornamento componente';
    notifications.addToast('error', msg);
  } finally {
    updatingId.value = '';
  }
}

/** Deletes a catalog component after explicit user confirmation. */
async function deleteComponent(item: CatalogItem): Promise<void> {
  const confirmDelete = confirm(`Eliminare il componente ${item.sku}?`);
  if (!confirmDelete) return;

  deletingId.value = item.id;
  try {
    await catalogService.remove(item.id);
    items.value = items.value.filter((current) => current.id !== item.id);
    delete editCommercial[item.id];
    notifications.addToast('success', `Componente ${item.sku} eliminato`);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : 'Errore eliminazione componente';
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
        <h1>Catalogo Admin</h1>
        <p class="subtitle">Gestisci il catalogo mantenendo separata la vista acquisto.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn--add" @click="openCreateModal" aria-label="Aggiungi componente">+</button>
        <button class="btn btn--light" :disabled="loading" @click="load">Aggiorna</button>
      </div>
    </header>

    <div v-if="isCreateModalOpen" class="modal-overlay" @click.self="closeCreateModal">
      <section class="modal-card">
        <div class="modal-header">
          <h2>Aggiungi componente</h2>
          <button class="btn btn--light" :disabled="creating" @click="closeCreateModal">Chiudi</button>
        </div>
        <p class="required-note"><span class="required-asterisk">*</span> campi obbligatori</p>

        <div class="wizard-grid wizard-grid--modal">
          <label class="field">
            <span class="field__label">SKU <span class="required-asterisk">*</span></span>
            <input v-model="createForm.sku" class="field__input" type="text" placeholder="Es. TONDO-SKU-NUOVO-001" />
          </label>
          <label class="field">
            <span class="field__label">Nome <span class="required-asterisk">*</span></span>
            <input v-model="createForm.name" class="field__input" type="text" placeholder="Nome componente" />
          </label>
          <label class="field">
            <span class="field__label">Categoria <span class="required-asterisk">*</span></span>
            <select v-model="createForm.category" class="field__input">
              <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Tipo <span class="required-asterisk">*</span></span>
            <select v-model="createForm.Type" class="field__input">
              <option v-for="type in componentTypes" :key="type" :value="type">{{ type }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Prezzo (EUR) <span class="required-asterisk">*</span></span>
            <input v-model="createForm.priceEuro" class="field__input" type="text" placeholder="0,00" />
          </label>
          <label class="field checkbox-field">
            <input v-model="createForm.isAvailable" type="checkbox" />
            <span class="field__label">Disponibile</span>
          </label>
          <label class="field field--full">
            <span class="field__label">Descrizione <span class="required-asterisk">*</span></span>
            <textarea v-model="createForm.description" class="field__input" rows="3" placeholder="Descrizione componente" />
          </label>
          <label class="field">
            <span class="field__label">Larghezza (mm) <span class="required-asterisk">*</span></span>
            <input v-model="createForm.widthMm" class="field__input" type="text" />
          </label>
          <label class="field">
            <span class="field__label">Altezza (mm) <span class="required-asterisk">*</span></span>
            <input v-model="createForm.heightMm" class="field__input" type="text" />
          </label>
          <label class="field">
            <span class="field__label">Profondita (mm) <span class="required-asterisk">*</span></span>
            <input v-model="createForm.depthMm" class="field__input" type="text" />
          </label>
          <label class="field field--full">
            <span class="field__label">Image URL</span>
            <input v-model="createForm.imageUrl" class="field__input" type="text" placeholder="https://..." />
          </label>
          <label class="field field--full">
            <span class="field__label">Compatibile con categoria</span>
            <select v-model="createForm.compatibleCategory" class="field__input">
              <option value="">Nessuna</option>
              <option v-for="category in categories" :key="`compatible-${category}`" :value="category">{{ category }}</option>
            </select>
          </label>
        </div>

        <div class="wizard-actions">
          <button class="btn btn--light" :disabled="creating" @click="closeCreateModal">Annulla</button>
          <button class="btn btn--primary" :disabled="creating" @click="createComponent">
            {{ creating ? 'Creazione...' : 'Aggiungi componente' }}
          </button>
        </div>
      </section>
    </div>

    <section class="filters">
      <label class="field">
        <span class="field__label">Ricerca</span>
        <input v-model="search" class="field__input" type="text" @keyup.enter="load" />
      </label>
      <label class="field">
        <span class="field__label">Categoria</span>
        <select v-model="categoryFilter" class="field__input" @change="load">
          <option value="">Tutte</option>
          <option value="TONDO">TONDO</option>
          <option value="QUADRO">QUADRO</option>
          <option value="KUBE">KUBE</option>
          <option value="INTELLIGENTE">INTELLIGENTE</option>
        </select>
      </label>
      <label class="checkbox-field">
        <input v-model="availableOnly" type="checkbox" @change="load" />
        <span class="field__label">Solo disponibili</span>
      </label>
      <button class="btn btn--primary" :disabled="loading" @click="load">Filtra</button>
    </section>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
    <p v-if="loading" class="placeholder">Caricamento catalogo...</p>
    <p v-else-if="items.length === 0" class="placeholder">Nessun componente trovato.</p>

    <template v-else>
      <section v-for="catGroup in groupedCatalog" :key="catGroup.category" class="category-section">
        <h2 class="category-section__title">{{ catGroup.label }}</h2>

        <div class="list">
          <article v-for="group in catGroup.types" :key="group.key" class="row">
            <div class="row__main">
              <h3>{{ group.label }}</h3>
              <p class="meta">{{ selectedVariant(group).sku }} · {{ catGroup.category }} · {{ group.type }}</p>
              <p class="meta">Versione: {{ selectedVariant(group).version }}</p>

              <label class="field">
                <span class="field__label">Misura</span>
                <select
                  class="field__input"
                  :aria-label="`Misura ${group.label}`"
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
                <span class="field__label">Prezzo (EUR)</span>
                <input
                  v-model="editCommercial[selectedVariant(group).id].priceEuro"
                  class="field__input field__input--compact"
                  type="text"
                />
              </label>
              <label class="checkbox-field">
                <input v-model="editCommercial[selectedVariant(group).id].isAvailable" type="checkbox" />
                <span class="field__label">Disponibile</span>
              </label>
              <p class="meta">Corrente: {{ formatCurrency(selectedVariant(group).price) }}</p>
            </div>

            <div class="row__actions">
              <button
                class="btn btn--primary"
                :disabled="updatingId === selectedVariant(group).id"
                @click="saveCommercial(selectedVariant(group))"
              >
                {{ updatingId === selectedVariant(group).id ? 'Salvataggio...' : 'Salva prezzo/disponibilita' }}
              </button>
              <button
                class="btn btn--danger"
                :disabled="deletingId === selectedVariant(group).id"
                @click="deleteComponent(selectedVariant(group))"
              >
                {{ deletingId === selectedVariant(group).id ? 'Eliminazione...' : 'Elimina componente' }}
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
