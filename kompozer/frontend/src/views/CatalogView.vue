<script setup lang="ts">
/** Catalog browsing view with filters and add-to-cart interactions. */
import { onMounted } from 'vue';
import { useCatalog } from '@/composables/useCatalog';

const {
  items,
  loading,
  error,
  search,
  category,
  availableOnly,
  load,
  addToCart,
} = useCatalog();

onMounted(() => {
  void load();
});

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}
</script>

<template>
  <div class="view-container">
    <header class="catalog-header">
      <div>
        <h1>Catalogo</h1>
        <p class="subtitle">Componenti disponibili per il tuo progetto</p>
      </div>
      <button class="btn btn--light" :disabled="loading" @click="load">Aggiorna</button>
    </header>

    <section class="filters">
      <label class="field">
        <span class="field__label">Ricerca</span>
        <input
          v-model="search"
          class="field__input"
          type="text"
          aria-label="Ricerca nel catalogo"
          placeholder="Nome o descrizione"
          @keyup.enter="load"
        />
      </label>

      <label class="field">
        <span class="field__label">Categoria</span>
        <select v-model="category" class="field__input" aria-label="Filtro categoria" @change="load">
          <option value="">Tutte</option>
          <option value="TONDO">Tondo</option>
          <option value="QUADRO">Quadro</option>
          <option value="KUBE">Kube</option>
          <option value="INTELLIGENTE">Intelligente</option>
        </select>
      </label>

      <label class="checkbox">
        <input v-model="availableOnly" type="checkbox" aria-label="Mostra solo componenti disponibili" @change="load" />
        Solo disponibili
      </label>

      <button class="btn btn--primary" :disabled="loading" aria-label="Applica filtri catalogo" @click="load">
        Cerca
      </button>
    </section>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
    <p v-if="loading" class="placeholder">Caricamento catalogo...</p>
    <p v-else-if="items.length === 0" class="placeholder">Nessun componente trovato.</p>

    <section v-else class="grid">
      <article v-for="item in items" :key="item.id" class="card">
        <div class="card__meta">
          <span class="tag">{{ item.category }}</span>
          <span :class="['availability', item.isAvailable ? 'ok' : 'no']">
            {{ item.isAvailable ? 'Disponibile' : 'Non disponibile' }}
          </span>
        </div>

        <h2 class="card__title">{{ item.name }}</h2>
        <p class="card__desc">{{ item.description }}</p>

        <div class="card__footer">
          <span class="price">{{ formatCurrency(item.price) }}</span>
          <button
            class="btn btn--primary"
            :disabled="!item.isAvailable"
            @click="addToCart(item)"
          >
            Aggiungi
          </button>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.view-container {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
}

.catalog-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
}

.subtitle {
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}

.filters {
  margin-top: var(--space-6);
  display: grid;
  grid-template-columns: 2fr 1fr auto auto;
  gap: var(--space-3);
  align-items: end;
}

.field { display: flex; flex-direction: column; gap: var(--space-1); }
.field__label { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.field__input {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
}

.checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
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
  color: var(--color-text-muted);
  margin-top: var(--space-4);
}

.grid {
  margin-top: var(--space-6);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.card__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.tag {
  font-size: var(--font-size-xs);
  background: var(--color-accent-subtle);
  color: var(--color-accent);
  border-radius: var(--radius-full);
  padding: 2px 8px;
}

.availability {
  font-size: var(--font-size-xs);
}

.availability.ok { color: var(--color-success); }
.availability.no { color: var(--color-text-muted); }

.card__title {
  font-size: var(--font-size-lg);
}

.card__desc {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.card__footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.price {
  font-weight: var(--font-weight-semibold);
}

.btn {
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
}

.btn:disabled { opacity: 0.6; cursor: not-allowed; }

.btn--primary {
  background: var(--color-accent);
  color: #fff;
}

.btn--light {
  background: var(--color-surface-raised);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

@media (max-width: 1200px) {
  .filters {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
}

@media (max-width: 760px) {
  .view-container {
    padding: var(--space-6) var(--space-4);
  }

  .catalog-header {
    flex-direction: column;
  }

  .filters {
    grid-template-columns: 1fr;
  }

  .card__footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
