<script setup lang="ts">
/** CAD configurator view orchestrating environment, design, and BOM workflows. */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type {
  Category,
  ColumnDesign,
  ColumnPlan,
  Environment,
  NextOption,
} from '@/types/cad';
import { useCad } from '@/composables/useCad';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { cadCollabSocket, type CollabFieldPath, type CollabPresencePayload } from '@/services/cadCollabSocket';
import { catalogService } from '@/services/catalogService';
import type { CatalogItem } from '@/types/catalog';
import type { ConfigurationDto } from '@/types/cad';

const {
  selected,
  detailLoading,
  createLoading,
  finalizeLoading,
  categoryLoading,
  environmentLoading,
  columnPlanLoading,
  designLoading,
  error,
  nextOptionsByColumn,
  loadDetail,
  updateCategory,
  updateEnvironment,
  updateColumnPlan,
  fetchNextOptions,
  setNextOptions,
  addTopShelf,
  removeTopShelf,
  updateDesign,
  createConfiguration,
  createName,
  finalizeSelected,
} = useCad();

const categories: Array<Category> = ['TONDO', 'QUADRO', 'KUBE', 'INTELLIGENTE'];
const route = useRoute();
const notifications = useNotificationStore();
const authStore = useAuthStore();

const environmentDraft = ref<Environment>({
  maxWidthMm: 5000,
  maxHeightMm: 3000,
  minWidthMm: 600,
  minHeightMm: 220,
  unit: 'mm',
});

const columnCountDraft = ref(2);
const shelfWidthsDraft = ref<number[]>([800, 800]);
const SHELF_THICKNESS_MM = 20;
const shelfThicknessDraft = ref(SHELF_THICKNESS_MM);
const categoryDraft = ref('');
const selectedGapByColumn = ref<Record<number, number | null>>({});
const categoryCatalogItems = ref<CatalogItem[]>([]);
const catalogLoading = ref(false);

const showBomMobile = ref(false);
const showResetConfirm = ref(false);
const showResetFinalConfirm = ref(false);
const pendingCategory = ref<Category | null>(null);
const pendingEnvironment = ref<Environment | null>(null);
const joinCodeInput = ref('');
const joinLoading = ref(false);

const collabMode = ref<'solitary' | 'shared'>('solitary');
const collabSessionCode = ref('');
const collabConfigurationId = ref('');
const collabLamport = ref(0);
const collabParticipants = ref<string[]>([]);
const collabConnected = ref(false);
const collabOwnerId = ref('');
const collabOwnerDisconnected = ref(false);
const showCollabModal = ref(false);
const startCollabLoading = ref(false);

let removeCollabPresenceListener: (() => void) | null = null;
let removeCollabOperationListener: (() => void) | null = null;
let removeCollabErrorListener: (() => void) | null = null;
let removeCollabConnectionRestoredListener: (() => void) | null = null;
let removeCollabOwnerDisconnectedListener: (() => void) | null = null;

function detachCollabListeners(): void {
  removeCollabPresenceListener?.();
  removeCollabOperationListener?.();
  removeCollabErrorListener?.();
  removeCollabConnectionRestoredListener?.();
  removeCollabOwnerDisconnectedListener?.();
  removeCollabPresenceListener = null;
  removeCollabOperationListener = null;
  removeCollabErrorListener = null;
  removeCollabConnectionRestoredListener = null;
  removeCollabOwnerDisconnectedListener = null;
}

async function refreshAllNextOptions(): Promise<void> {
  const planIndexes = selected.value?.columnPlan?.columns.map((column) => column.index) ?? [];
  await Promise.all(planIndexes.map((columnIndex) => openNextOptions(columnIndex)));
}

function applyPresence(payload: CollabPresencePayload): void {
  if (!collabSessionCode.value || payload.sessionCode !== collabSessionCode.value) {
    return;
  }

  if (payload.participants && payload.participants.length > 0) {
    collabParticipants.value = payload.participants;
    return;
  }

  if (payload.event === 'joined') {
    collabParticipants.value = Array.from(new Set([...collabParticipants.value, payload.userId]));
    return;
  }

  collabParticipants.value = collabParticipants.value.filter((userId) => userId !== payload.userId);
}

function normalizeSnapshot(snapshot: ConfigurationDto): ConfigurationDto {
  return {
    ...snapshot,
    createdAt: new Date(snapshot.createdAt).toISOString(),
    updatedAt: new Date(snapshot.updatedAt).toISOString(),
  };
}

async function syncFromSessionSnapshot(snapshot: ConfigurationDto): Promise<void> {
  selected.value = normalizeSnapshot(snapshot);
  await refreshAllNextOptions();
}

function resetCollabState(): void {
  collabMode.value = 'solitary';
  collabSessionCode.value = '';
  collabConfigurationId.value = '';
  collabLamport.value = 0;
  collabParticipants.value = [];
  collabConnected.value = false;
  collabOwnerId.value = '';
  collabOwnerDisconnected.value = false;
  showCollabModal.value = false;
}

/** Owner: creates a new collaborative session and shows the code modal. */
async function startCollabSession(): Promise<void> {
  if (!selected.value) return;

  startCollabLoading.value = true;
  try {
    const res = await fetch(`/api/cad/configurations/${selected.value.id}/collab/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('kompozer_token') ?? ''}`,
      },
    });
    if (!res.ok) throw new Error(`Errore HTTP ${res.status}`);
    const data = await res.json() as { sessionCode: string; configurationId: string; participants: string[]; ownerId: string; lamport: number };

    collabSessionCode.value = data.sessionCode;
    collabConfigurationId.value = data.configurationId;
    collabParticipants.value = data.participants;
    collabOwnerId.value = data.ownerId;
    collabLamport.value = data.lamport;
    collabMode.value = 'shared';
    collabOwnerDisconnected.value = false;

    cadCollabSocket.connect();
    await cadCollabSocket.joinSession(data.sessionCode);
    collabConnected.value = cadCollabSocket.isConnected();

    showCollabModal.value = true;
  } catch (err) {
    notifications.addToast('error', err instanceof Error ? err.message : 'Avvio sessione collaborativa fallito');
  } finally {
    startCollabLoading.value = false;
  }
}

/** Participant: joins an existing session by entering the code. */
async function joinByCode(): Promise<void> {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code || !selected.value) {
    notifications.addToast('error', 'Inserisci un codice valido');
    return;
  }

  joinLoading.value = true;
  try {
    const res = await fetch(`/api/cad/configurations/${selected.value.id}/collab/join/${code}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('kompozer_token') ?? ''}`,
      },
    });
    if (!res.ok) throw new Error(`Errore HTTP ${res.status}`);
    const data = await res.json() as { sessionCode: string; configurationId: string; participants: string[]; ownerId: string; lamport: number; snapshot: ConfigurationDto };

    collabSessionCode.value = data.sessionCode;
    collabConfigurationId.value = data.configurationId;
    collabParticipants.value = data.participants;
    collabOwnerId.value = data.ownerId;
    collabLamport.value = data.lamport;
    collabMode.value = 'shared';
    collabOwnerDisconnected.value = false;

    cadCollabSocket.connect();
    await cadCollabSocket.joinSession(data.sessionCode);
    collabConnected.value = cadCollabSocket.isConnected();

    await syncFromSessionSnapshot(data.snapshot);
    joinCodeInput.value = '';
    notifications.addToast('success', `Sessione collaborativa agganciata (${data.sessionCode})`);
  } catch (err) {
    notifications.addToast('error', err instanceof Error ? err.message : 'Join sessione collaborativa fallito');
  } finally {
    joinLoading.value = false;
  }
}

/** Copies the current session code to clipboard. */
async function copySessionCode(): Promise<void> {
  if (!collabSessionCode.value) return;
  try {
    await navigator.clipboard.writeText(collabSessionCode.value);
    notifications.addToast('success', `Codice ${collabSessionCode.value} copiato`);
  } catch {
    notifications.addToast('error', 'Impossibile copiare il codice');
  }
}

onMounted(() => {
  cadCollabSocket.connect();

  removeCollabPresenceListener = cadCollabSocket.onPresence((payload) => {
    applyPresence(payload);
  });

  removeCollabOperationListener = cadCollabSocket.onOperationApplied((payload) => {
    const data = payload.data;
    if (!data || data.sessionCode !== collabSessionCode.value) {
      return;
    }

    collabLamport.value = Math.max(collabLamport.value, data.lamport);

    // Skip snapshot sync for own operations — REST already gave us the authoritative state.
    const myUserId = authStore.user?.id ?? '';
    if (myUserId && data.userId === myUserId) {
      return;
    }

    void syncFromSessionSnapshot(data.snapshot);
  });

  removeCollabErrorListener = cadCollabSocket.onError((payload) => {
    const code = payload.error?.code || 'COLLAB_ERROR';
    const message = payload.error?.message || 'Errore realtime CAD';
    if (code === 'COLLAB_OPERATION_STALE' && selected.value && collabSessionCode.value) {
      void cadCollabSocket
        .requestSnapshot(selected.value.id, collabSessionCode.value)
        .then((snapshot) => syncFromSessionSnapshot(snapshot.snapshot))
        .catch(() => {
          void reloadSelected();
        });
    }
    notifications.addToast('error', `${code}: ${message}`);
  });

  removeCollabConnectionRestoredListener = cadCollabSocket.onConnectionRestored(() => {
    collabConnected.value = true;
    if (!selected.value || !collabSessionCode.value) {
      return;
    }

    void cadCollabSocket
      .requestSnapshot(selected.value.id, collabSessionCode.value)
      .then((snapshot) => {
        collabParticipants.value = snapshot.participants;
        collabLamport.value = Math.max(collabLamport.value, snapshot.lamport);
        return syncFromSessionSnapshot(snapshot.snapshot);
      })
      .catch(() => {
        void reloadSelected();
      });
  });

  removeCollabOwnerDisconnectedListener = cadCollabSocket.onOwnerDisconnected((payload) => {
    if (payload.sessionCode !== collabSessionCode.value) return;
    collabOwnerDisconnected.value = true;
    collabConnected.value = false;
    notifications.addToast('error', 'Il proprietario ha lasciato la sessione collaborativa');
  });

  void (async () => {
    const configurationId = route.query['configurationId'];
    if (typeof configurationId === 'string' && configurationId.length > 0) {
      await loadDetail(configurationId);
    }
  })();
});

onBeforeUnmount(() => {
  const configurationId = selected.value?.id;
  const sessionCode = collabSessionCode.value;
  if (configurationId && sessionCode) {
    void cadCollabSocket.leaveSession(configurationId, sessionCode);
  }

  detachCollabListeners();
  cadCollabSocket.disconnect();
  resetCollabState();
});

watch(
  () => selected.value?.id,
  (configurationId, previousConfigurationId) => {
    // When navigating away from a config, leave any active collaborative session.
    if (
      previousConfigurationId
      && collabSessionCode.value
      && collabConfigurationId.value === previousConfigurationId
      && previousConfigurationId !== configurationId
    ) {
      void cadCollabSocket.leaveSession(previousConfigurationId, collabSessionCode.value);
      resetCollabState();
    }

    if (!configurationId) {
      resetCollabState();
      return;
    }

    // Default: open config in solitary mode — no auto-join.
  },
);

watch(selected, (value) => {
  if (!value) {
    return;
  }

  categoryDraft.value = value.category ?? '';

  if (value.environment) {
    environmentDraft.value = { ...value.environment };
  }

  if (value.columnPlan) {
    columnCountDraft.value = value.columnPlan.columnCount;
    shelfWidthsDraft.value = value.columnPlan.columns
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((column) => column.shelfWidthMm);
  }
}, { immediate: true });

watch(
  () => selected.value?.category,
  (category) => {
    void loadCatalogForCategory(category ?? null);
  },
  { immediate: true },
);

const currentStepIndex = computed(() => {
  if (!selected.value) return 0;
  switch (selected.value.status) {
    case 'DRAFT':
      return 0;
    case 'ENVIRONMENT_DEFINED':
      return 1;
    case 'CATEGORY_SELECTED':
      return 2;
    case 'COLUMNS_DEFINED':
      return 3;
    case 'DESIGN_IN_PROGRESS':
      return 3;
    case 'READY_FOR_FINALIZE':
      return 4;
    case 'FINALIZED':
      return 5;
    default:
      return 0;
  }
});

const canSubmitCategory = computed(() => {
  if (!selected.value) {
    return false;
  }

  if (!categoryDraft.value) {
    return false;
  }

  return categoryDraft.value !== selected.value.category;
});

const canFinalize = computed(() => selected.value?.status === 'READY_FOR_FINALIZE');
const canEditEnvironment = computed(() => selected.value && selected.value.status !== 'FINALIZED');
const canEditCategory = computed(() => selected.value && selected.value.status !== 'FINALIZED');
const canEditColumns = computed(() => {
  if (!selected.value) return false;
  return (
    selected.value.status === 'CATEGORY_SELECTED' ||
    selected.value.status === 'COLUMNS_DEFINED' ||
    selected.value.status === 'DESIGN_IN_PROGRESS' ||
    selected.value.status === 'READY_FOR_FINALIZE'
  );
});
const canEditDesign = computed(() => {
  if (!selected.value) return false;
  return (
    selected.value.status === 'COLUMNS_DEFINED' ||
    selected.value.status === 'DESIGN_IN_PROGRESS' ||
    selected.value.status === 'READY_FOR_FINALIZE'
  );
});

const collabStatusLabel = computed(() => {
  if (!selected.value) {
    return 'Seleziona o crea una configurazione';
  }
  if (collabOwnerDisconnected.value) {
    return 'Il proprietario ha lasciato — sessione terminata';
  }
  if (collabMode.value === 'shared') {
    return collabConnected.value
      ? `Collaborazione attiva · ${collabParticipants.value.length} partecipanti · Codice: ${collabSessionCode.value}`
      : 'Collaborazione — riconnessione in corso...';
  }
  return 'Modalità solitaria';
});

const isCollabOwner = computed(() =>
  collabMode.value === 'shared' && collabOwnerId.value === (authStore.user?.id ?? ''),
);

const totalPrice = computed(() => {
  const bom = selected.value?.bom ?? [];
  return bom.reduce((sum, item) => {
    const unit = item.unitPrice ?? (item.unitPriceCents ? item.unitPriceCents / 100 : 0);
    return sum + unit * item.quantity;
  }, 0);
});

const orderedColumns = computed(() => {
  const plan = selected.value?.columnPlan;
  if (!plan) {
    return shelfWidthsDraft.value.map((width, index) => ({ index, shelfWidthMm: width }));
  }
  return plan.columns.slice().sort((a, b) => a.index - b.index);
});

const availableShelfWidths = computed(() =>
  uniqueSortedNumeric(
    categoryCatalogItems.value
      .filter((item) => {
        const t = normalizedType(item);
        return t === 'RIPIANO' || t === 'RIPIANO_BORDO' || t === 'RIPIANO_INTERMEDIO';
      })
      .map((item) => Number(item.dimensions?.widthMm))
      .filter((value) => Number.isFinite(value) && value > 0),
  ),
);

watch(columnCountDraft, (count) => {
  const safeCount = Math.max(1, Math.min(8, count));
  if (safeCount !== count) {
    columnCountDraft.value = safeCount;
    return;
  }

  shelfWidthsDraft.value = Array.from(
    { length: safeCount },
    (_, index) => shelfWidthsDraft.value[index] ?? availableShelfWidths.value[0] ?? 800,
  );
});

watch(() => availableShelfWidths.value, (widths) => {
  if (widths.length === 0) {
    return;
  }

  shelfWidthsDraft.value = shelfWidthsDraft.value.map((width) =>
    widths.includes(width) ? width : widths[0],
  );
});

const designByColumn = computed(() => {
  const map = new Map<number, { levelsMm: number[]; shelfThicknessMm: number }>();
  for (const design of selected.value?.columnDesigns ?? []) {
    map.set(design.columnIndex, {
      levelsMm: [...design.levelsMm].sort((a, b) => a - b),
      shelfThicknessMm: design.shelfThicknessMm,
    });
  }
  return map;
});

const gridMaxHeight = computed(() => Math.max(environmentDraft.value.maxHeightMm || 1, 1));

/** True when the selected configuration uses INTELLIGENTE logic. */
const isIntelligente = computed(() => selected.value?.category === 'INTELLIGENTE');

/**
 * Maps each column index to its INTELLIGENTE role:
 * outer columns (first and last) are BORDO; inner ones are INTERMEZZO.
 */
const columnRoles = computed((): Map<number, 'BORDO' | 'INTERMEZZO'> => {
  const plan = selected.value?.columnPlan;
  if (!plan || !isIntelligente.value) return new Map();
  const sorted = plan.columns.slice().sort((a, b) => a.index - b.index);
  const result = new Map<number, 'BORDO' | 'INTERMEZZO'>();
  sorted.forEach((col, i) => {
    result.set(col.index, (i === 0 || i === sorted.length - 1) ? 'BORDO' : 'INTERMEZZO');
  });
  return result;
});

/** True when all INTELLIGENTE columns share identical levelsMm (alignment satisfied). */
const columnsAligned = computed((): boolean => {
  if (!isIntelligente.value || !selected.value) return true;
  const designs = selected.value.columnDesigns;
  if (designs.length < 2) return true;
  const ref = [...designs[0].levelsMm].sort((a, b) => a - b).join(',');
  return designs.every((d) => [...d.levelsMm].sort((a, b) => a - b).join(',') === ref);
});

const canvasColumns = computed(() => {
  return orderedColumns.value.map((column) => {
    const design = designByColumn.value.get(column.index);
    const levels = design?.levelsMm ?? [];
    return {
      ...column,
      levels,
      levelPercents: levels.map((level) => Math.min(95, Math.max(2, Math.round((level / gridMaxHeight.value) * 100)))),
    };
  });
});

watch(
  () => [selected.value?.id, selected.value?.status, canvasColumns.value.length] as const,
  ([, status]) => {
    if (status !== 'COLUMNS_DEFINED' && status !== 'DESIGN_IN_PROGRESS' && status !== 'READY_FOR_FINALIZE') {
      return;
    }

    for (const column of canvasColumns.value) {
      void openNextOptions(column.index);
    }
  },
  { immediate: true },
);

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** Joins a shared collaboration session explicitly from UI input. */
async function joinFromCad(): Promise<void> {
  await joinByCode();
}

async function broadcastCollabOperation(
  fieldPath: CollabFieldPath,
  value: string | Category | Environment | ColumnPlan | ColumnDesign[] | null,
  baseVersion: number,
): Promise<void> {
  if (!selected.value || !collabSessionCode.value || collabMode.value !== 'shared') {
    return;
  }

  try {
    const output = await cadCollabSocket.applyOperation({
      configurationId: selected.value.id,
      sessionCode: collabSessionCode.value,
      lamport: collabLamport.value + 1,
      baseVersion,
      fieldPath,
      value,
    });

    collabLamport.value = Math.max(collabLamport.value, output.lamport);
  } catch {
    // Collaboration signaling is best-effort: local persistence is handled by REST APIs.
  }
}

/** Formats BOM or pricing values using localized euro currency. */
function formatPrice(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

/** Clamps and synchronizes the draft number of columns for plan editing. */
function syncDraftLengths(nextCount: number): void {
  const safeCount = Math.max(1, Math.min(8, nextCount));
  columnCountDraft.value = safeCount;
}

/** Normalizes catalog component type values for safe comparisons. */
function normalizedType(item: CatalogItem): string {
  return String(item.Type ?? '').trim().toUpperCase();
}

/** Maps backend component type identifiers to user-facing labels. */
function formatComponentTypeLabel(componentType?: string): string {
  switch (componentType) {
    case 'RIPIANO':
      return 'Ripiano';
    case 'RIPIANO_BORDO':
      return 'Ripiano Bordo';
    case 'RIPIANO_INTERMEDIO':
      return 'Ripiano Intermezzo';
    case 'PIEDINO':
      return 'Piedino';
    case 'MONTANTE':
      return 'Montante';
    case 'TERMINALE':
      return 'Terminale';
    default:
      return componentType || 'Componente';
  }
}

/** Deduplicates and sorts numeric values in ascending order. */
function uniqueSortedNumeric(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

/** Loads all available catalog items for the selected category across pages. */
async function loadCatalogForCategory(category: Category | null): Promise<void> {
  if (!category) {
    categoryCatalogItems.value = [];
    return;
  }

  catalogLoading.value = true;
  try {
    const allItems: CatalogItem[] = [];
    let currentPage = 1;
    let totalPagesCount = 1;

    do {
      const response = await catalogService.list({
        category,
        available: true,
        page: currentPage,
        limit: 200,
      });
      allItems.push(...response.items);
      totalPagesCount = response.totalPages;
      currentPage += 1;
    } while (currentPage <= totalPagesCount);

    categoryCatalogItems.value = allItems;
  } catch {
    categoryCatalogItems.value = [];
  } finally {
    catalogLoading.value = false;
  }
}

/** Saves environment parameters, with reset confirmation when required. */
async function saveEnvironment(): Promise<void> {
  if (!selected.value) return;

  if (selected.value.status === 'FINALIZED') {
    return;
  }

  const requiresReset = ['COLUMNS_DEFINED', 'DESIGN_IN_PROGRESS', 'READY_FOR_FINALIZE'].includes(selected.value.status);
  if (requiresReset) {
    pendingEnvironment.value = { ...environmentDraft.value };
    showResetConfirm.value = true;
    return;
  }

  const baseVersion = selected.value.version;
  await updateEnvironment(environmentDraft.value);
  await broadcastCollabOperation('environment', environmentDraft.value, baseVersion);
}

/** Saves selected category, with reset confirmation when design already progressed. */
async function saveCategory(value: string): Promise<void> {
  if (!selected.value || !value) {
    return;
  }

  const nextCategory = value as Category;
  if (nextCategory === selected.value.category) {
    return;
  }

  if (selected.value.status === 'FINALIZED') {
    return;
  }

  const requiresReset = ['COLUMNS_DEFINED', 'DESIGN_IN_PROGRESS', 'READY_FOR_FINALIZE'].includes(selected.value.status);
  if (requiresReset) {
    pendingCategory.value = nextCategory;
    showResetConfirm.value = true;
    return;
  }

  const baseVersion = selected.value.version;
  await updateCategory(nextCategory);
  await broadcastCollabOperation('category', nextCategory, baseVersion);
}

/** Saves currently selected category draft through explicit Step 2 action button. */
async function submitCategory(): Promise<void> {
  if (!categoryDraft.value) {
    return;
  }

  await saveCategory(categoryDraft.value);
}

/** Advances reset confirmation flow to final irreversible confirmation. */
async function confirmResetStepOne(): Promise<void> {
  showResetConfirm.value = false;
  showResetFinalConfirm.value = true;
}

/** Applies pending reset changes for environment and category updates. */
async function confirmResetStepTwo(): Promise<void> {
  showResetFinalConfirm.value = false;

  if (pendingEnvironment.value) {
    const baseVersion = selected.value?.version ?? 1;
    await updateEnvironment(pendingEnvironment.value);
    await broadcastCollabOperation('environment', pendingEnvironment.value, baseVersion);
    pendingEnvironment.value = null;
  }

  if (pendingCategory.value) {
    const baseVersion = selected.value?.version ?? 1;
    await updateCategory(pendingCategory.value);
    await broadcastCollabOperation('category', pendingCategory.value, baseVersion);
    pendingCategory.value = null;
  }
}

/** Aborts reset flow and restores drafts from persisted configuration state. */
function cancelReset(): void {
  showResetConfirm.value = false;
  showResetFinalConfirm.value = false;
  pendingCategory.value = null;
  pendingEnvironment.value = null;

  if (selected.value?.environment) {
    environmentDraft.value = { ...selected.value.environment };
  }
}

/** Persists current column count and shelf width draft as column plan. */
async function saveColumnPlan(): Promise<void> {
  if (!selected.value) {
    return;
  }

  const baseVersion = selected.value.version;
  const columnPlan: ColumnPlan = {
    columnCount: columnCountDraft.value,
    columns: shelfWidthsDraft.value.map((shelfWidthMm, index) => ({ index, shelfWidthMm })),
  };
  await updateColumnPlan(columnPlan);
  await broadcastCollabOperation('columnPlan', columnPlan, baseVersion);
}

/** Returns raw next-step options for a given column index. */
function getOptions(columnIndex: number): NextOption[] {
  return nextOptionsByColumn.value[columnIndex] ?? [];
}

/** Returns effective options currently shown to user for a column. */
function effectiveOptions(columnIndex: number): NextOption[] {
  return getOptions(columnIndex);
}

/** Maps option reason codes to localized explanatory messages. */
function optionReason(option: NextOption): string {
  switch (option.reasonCode) {
    case 'INVALID_GAP':
      return 'Altezza pezzo non valida';
    case 'NON_INCREASING_LEVEL':
      return 'Il nuovo livello deve essere maggiore del precedente';
    case 'MAX_HEIGHT_EXCEEDED':
      return 'Supera l altezza massima configurata';
    case 'ADJACENCY_CONFLICT':
      return 'Conflitto con la colonna adiacente (stessa quota)';
    case 'LOOK_AHEAD_BLOCKED':
      return 'Questa scelta blocca i passi successivi';
    case 'INVALID_FIRST_LEVEL':
      return 'Il primo livello deve corrispondere a un piedino di catalogo';
    case 'INVALID_SEGMENT':
      return 'La spina condivisa richiede un montante non disponibile a catalogo';
    case 'NO_TERMINAL_FIT':
      return 'Non esiste un terminale compatibile con l altezza residua';
    case 'SPINE_CONFLICT':
      return 'Questa scelta viola i vincoli della spina condivisa';
    default:
      if (option.reason && option.reason.trim().length > 0) {
        return option.reason;
      }
      return 'Opzione non consentita';
  }
}

/** Checks whether at least one currently available option is selectable. */
function hasAllowedOption(columnIndex: number): boolean {
  return effectiveOptions(columnIndex).some((option) => option.allowed);
}

/** True when the column offers at least one allowed neighbor-anchored bridge option. */
function hasBridgeOption(columnIndex: number): boolean {
  return effectiveOptions(columnIndex).some((option) => option.allowed && option.kind === 'bridge');
}

/** Collects distinct blocking reasons for disabled options in a column. */
function blockedReasons(columnIndex: number): string[] {
  const reasons = effectiveOptions(columnIndex)
    .filter((option) => !option.allowed)
    .map((option) => optionReason(option));

  return Array.from(new Set(reasons));
}

/** Builds compact UI summary for blocked reasons, truncating long lists. */
function blockedReasonsSummary(columnIndex: number): string {
  const reasons = blockedReasons(columnIndex);
  if (reasons.length === 0) {
    return 'Nessuna scelta valida';
  }

  const MAX_REASONS = 3;
  const visible = reasons.slice(0, MAX_REASONS);
  const hiddenCount = reasons.length - visible.length;
  return hiddenCount > 0
    ? `${visible.join(' · ')} · +${hiddenCount} altre`
    : visible.join(' · ');
}

  /** Fetches and stores next options for a column, selecting default allowed gap. */
async function openNextOptions(columnIndex: number): Promise<void> {
  const options = await fetchNextOptions(columnIndex);
  setNextOptions(columnIndex, options);
  selectedGapByColumn.value = {
    ...selectedGapByColumn.value,
    [columnIndex]: options.find((option) => option.allowed)?.heightMm ?? null,
  };
}

/** Refreshes option sets for current column and adjacent impacted columns. */
async function refreshOptionsAround(columnIndex: number): Promise<void> {
  const planIndexes = new Set(
    selected.value?.columnPlan?.columns.map((column) => column.index) ?? [],
  );
  const targets = [columnIndex - 1, columnIndex, columnIndex + 1];
  const valid = targets.filter(
    (index, pos, arr) => index >= 0 && planIndexes.has(index) && arr.indexOf(index) === pos,
  );
  await Promise.all(valid.map((index) => openNextOptions(index)));
}

/** Adds a top shelf using selected or first allowed gap for the target column. */
async function addShelf(columnIndex: number): Promise<void> {
  if (!selected.value) {
    return;
  }

  const baseVersion = selected.value.version;
  const gap = selectedGapByColumn.value[columnIndex] ?? effectiveOptions(columnIndex).find((o) => o.allowed)?.heightMm ?? null;
  if (!gap) {
    return;
  }
  selectedGapByColumn.value = {
    ...selectedGapByColumn.value,
    [columnIndex]: gap,
  };

  if (isIntelligente.value) {
    // INTELLIGENTE: add the same gap to ALL columns simultaneously
    const allDesigns = (selected.value.columnPlan?.columns ?? []).map((col) => {
      const existing = selected.value!.columnDesigns.find((d) => d.columnIndex === col.index)
        ?? { columnIndex: col.index, levelsMm: [], shelfThicknessMm: SHELF_THICKNESS_MM };
      const lastLevel = existing.levelsMm.length > 0 ? existing.levelsMm[existing.levelsMm.length - 1] : 0;
      const nextLevel = existing.levelsMm.length === 0
        ? gap
        : lastLevel + SHELF_THICKNESS_MM + gap;
      return {
        ...existing,
        shelfThicknessMm: SHELF_THICKNESS_MM,
        levelsMm: [...existing.levelsMm, nextLevel].sort((a, b) => a - b),
      };
    });
    await updateDesign(allDesigns);
    if (selected.value) {
      await broadcastCollabOperation('columnDesigns', selected.value.columnDesigns, baseVersion);
    }
    await refreshAllNextOptions();
  } else {
    await addTopShelf(columnIndex, gap, shelfThicknessDraft.value);
    if (selected.value) {
      await broadcastCollabOperation('columnDesigns', selected.value.columnDesigns, baseVersion);
    }
    await refreshOptionsAround(columnIndex);
  }
}

/** Removes top shelf from a column and refreshes dependent options. */
async function removeShelf(columnIndex: number): Promise<void> {
  if (!selected.value) {
    return;
  }

  const baseVersion = selected.value.version;

  if (isIntelligente.value) {
    // INTELLIGENTE: remove top shelf from ALL columns simultaneously
    const allDesigns = (selected.value.columnPlan?.columns ?? []).map((col) => {
      const existing = selected.value!.columnDesigns.find((d) => d.columnIndex === col.index)
        ?? { columnIndex: col.index, levelsMm: [], shelfThicknessMm: SHELF_THICKNESS_MM };
      return {
        ...existing,
        shelfThicknessMm: SHELF_THICKNESS_MM,
        levelsMm: existing.levelsMm.slice(0, -1),
      };
    });
    await updateDesign(allDesigns);
    if (selected.value) {
      await broadcastCollabOperation('columnDesigns', selected.value.columnDesigns, baseVersion);
    }
    await refreshAllNextOptions();
  } else {
    await removeTopShelf(columnIndex, shelfThicknessDraft.value);
    if (selected.value) {
      await broadcastCollabOperation('columnDesigns', selected.value.columnDesigns, baseVersion);
    }
    await refreshOptionsAround(columnIndex);
  }
}

/** Reloads currently selected configuration detail from backend source. */
async function reloadSelected(): Promise<void> {
  if (!selected.value) {
    return;
  }

  await loadDetail(selected.value.id);
}

/** Creates a new configuration directly from CAD landing state. */
async function createFromCad(): Promise<void> {
  await createConfiguration();
}

/** Returns true when the requested step has already been completed. */
function stepDone(index: number): boolean {
  return currentStepIndex.value > index;
}

/** Returns true for the currently active step in configurator wizard. */
function stepActive(index: number): boolean {
  return currentStepIndex.value === index;
}
</script>

<template>
  <div class="cad-workspace">
    <header class="cad-header">
      <div>
        <h1>Configuratore CAD</h1>
        <p class="subtitle">Workspace di design con schema grafico indipendente</p>
      </div>
      <div class="header-actions">
        <button class="btn btn--light" :disabled="detailLoading || !selected" @click="reloadSelected">Aggiorna dettaglio</button>
        <button class="btn btn--light bom-mobile-btn" @click="showBomMobile = true">Distinta componenti</button>
      </div>
    </header>

    <section v-if="selected" class="collab-strip" aria-live="polite">
      <div>
        <p class="mini muted">Sessione</p>
        <strong>{{ collabStatusLabel }}</strong>
      </div>
      <div class="collab-actions">
        <!-- Owner: start collab -->
        <template v-if="collabMode === 'solitary'">
          <button
            class="btn btn--primary btn--small"
            :disabled="!selected || startCollabLoading"
            @click="startCollabSession"
          >
            {{ startCollabLoading ? 'Avvio...' : 'Collabora' }}
          </button>
        </template>
        <!-- Shared: show code + stop -->
        <template v-if="collabMode === 'shared' && !collabOwnerDisconnected">
          <button class="btn btn--light btn--small" @click="showCollabModal = true">
            Codice: <strong>{{ collabSessionCode }}</strong>
          </button>
          <button
            v-if="isCollabOwner"
            class="btn btn--light btn--small"
            @click="() => { if (selected && collabSessionCode) { void cadCollabSocket.leaveSession(selected.id, collabSessionCode); resetCollabState(); } }"
          >
            Termina sessione
          </button>
        </template>
        <!-- Owner disconnected -->
        <template v-if="collabOwnerDisconnected">
          <span class="muted mini">⚠️ Sessione terminata</span>
          <button class="btn btn--light btn--small" @click="resetCollabState">Torna a solitaria</button>
        </template>
      </div>
    </section>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>

    <div class="cad-layout">
      <main class="center-panel">
        <p v-if="detailLoading" class="placeholder">Caricamento dettaglio...</p>
        <section v-else-if="!selected" class="create-card">
          <h3>Crea nuova configurazione</h3>
          <p class="muted">Puoi iniziare da qui o entrare in una sessione collaborativa esistente.</p>
          <div class="actions-row">
            <label class="field" style="flex: 1; min-width: 220px;">
              <span class="field__label">Nome configurazione</span>
              <input v-model="createName" class="field__input" type="text" placeholder="Nuova configurazione" />
            </label>
            <button class="btn btn--primary" :disabled="createLoading" @click="createFromCad">
              {{ createLoading ? 'Creazione...' : 'Crea e apri configuratore' }}
            </button>
          </div>

          <div class="actions-row" style="margin-top: var(--space-3);">
            <label class="field" style="flex: 1; min-width: 220px;">
              <span class="field__label">Codice sessione collaborativa</span>
              <input
                v-model="joinCodeInput"
                class="field__input"
                type="text"
                placeholder="es. A3KP7X"
                maxlength="6"
                style="text-transform: uppercase;"
              />
            </label>
            <button class="btn btn--light" :disabled="joinLoading" @click="joinFromCad">
              {{ joinLoading ? 'Accesso...' : 'Entra con codice' }}
            </button>
          </div>
        </section>

        <template v-else>
          <section class="stepper">
            <article class="step" :class="{ 'step--done': stepDone(0), 'step--active': stepActive(0) }">
              <span class="step__index">1</span>
              <span class="step__label">Ambiente</span>
            </article>
            <article class="step" :class="{ 'step--done': stepDone(1), 'step--active': stepActive(1) }">
              <span class="step__index">2</span>
              <span class="step__label">Categoria</span>
            </article>
            <article class="step" :class="{ 'step--done': stepDone(2), 'step--active': stepActive(2) }">
              <span class="step__index">3</span>
              <span class="step__label">Colonne</span>
            </article>
            <article class="step" :class="{ 'step--done': stepDone(3), 'step--active': stepActive(3) }">
              <span class="step__index">4</span>
              <span class="step__label">Design</span>
            </article>
            <article class="step" :class="{ 'step--done': stepDone(4), 'step--active': stepActive(4) }">
              <span class="step__index">5</span>
              <span class="step__label">Finalizza</span>
            </article>
          </section>

          <section class="meta-row">
            <div><span class="muted">Configurazione</span><strong>{{ selected.name }}</strong></div>
            <div><span class="muted">Stato</span><strong>{{ selected.status }}</strong></div>
            <div><span class="muted">Ultimo update</span><strong>{{ formatDate(selected.updatedAt) }}</strong></div>
          </section>

          <section class="controls-section">
            <article class="control-card">
              <h3>Step 1 - Ambiente</h3>
              <div class="two-cols">
                <label class="field">
                  <span class="field__label">Larghezza max (mm)</span>
                  <input v-model.number="environmentDraft.maxWidthMm" class="field__input" type="number" min="1" />
                </label>
                <label class="field">
                  <span class="field__label">Altezza max (mm)</span>
                  <input v-model.number="environmentDraft.maxHeightMm" class="field__input" type="number" min="1" />
                </label>
                <label class="field">
                  <span class="field__label">Larghezza min (mm)</span>
                  <input v-model.number="environmentDraft.minWidthMm" class="field__input" type="number" min="1" />
                </label>
                <label class="field">
                  <span class="field__label">Altezza min (mm)</span>
                  <input v-model.number="environmentDraft.minHeightMm" class="field__input" type="number" min="1" />
                </label>
              </div>
              <button class="btn btn--light" :disabled="!canEditEnvironment || environmentLoading" @click="saveEnvironment">
                {{ environmentLoading ? 'Salvataggio...' : 'Salva ambiente' }}
              </button>
            </article>

            <article class="control-card">
              <h3>Step 2 - Categoria</h3>
              <label class="field">
                <span class="field__label">Categoria</span>
                <select
                  class="field__input"
                  v-model="categoryDraft"
                  :disabled="!canEditCategory || categoryLoading"
                >
                  <option disabled value="">Seleziona categoria</option>
                  <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
                </select>
              </label>
              <button
                class="btn btn--light"
                :disabled="!canEditCategory || categoryLoading || !canSubmitCategory"
                @click="submitCategory"
              >
                {{ categoryLoading ? 'Salvataggio...' : 'Salva categoria' }}
              </button>
            </article>

            <article class="control-card">
              <h3>Step 3 - Piano colonne</h3>
              <label class="field">
                <span class="field__label">Numero colonne (1-8)</span>
                <input
                  :value="columnCountDraft"
                  class="field__input"
                  type="number"
                  min="1"
                  max="8"
                  :disabled="!canEditColumns"
                  @change="syncDraftLengths(Number(($event.target as HTMLInputElement).value))"
                />
              </label>
              <p class="mini muted" v-if="catalogLoading">Caricamento larghezze da catalogo...</p>
              <p class="mini muted" v-else-if="availableShelfWidths.length === 0">
                Nessun ripiano disponibile per la categoria selezionata.
              </p>
              <div class="column-widths">
                <label v-for="(_, i) in columnCountDraft" :key="`col-width-${i}`" class="field">
                  <span class="field__label">Colonna {{ i + 1 }}</span>
                  <select
                    v-model.number="shelfWidthsDraft[i]"
                    class="field__input"
                    :disabled="!canEditColumns || availableShelfWidths.length === 0"
                  >
                    <option v-for="width in availableShelfWidths" :key="`width-${i}-${width}`" :value="width">
                      {{ width }} mm
                    </option>
                  </select>
                </label>
              </div>
              <button
                class="btn btn--light"
                :disabled="!canEditColumns || columnPlanLoading || availableShelfWidths.length === 0"
                @click="saveColumnPlan"
              >
                {{ columnPlanLoading ? 'Salvataggio...' : 'Salva piano colonne' }}
              </button>
            </article>

            <article class="control-card">
              <h3>Step 4 - Costruzione livelli (+ / -)</h3>
              <p class="mini muted">Spessore ripiano fisso: {{ shelfThicknessDraft }} mm</p>

              <div v-if="isIntelligente" class="intelligente-banner" role="note">
                <strong>Modalità INTELLIGENTE</strong> — “+ Livello” aggiunge lo stesso ripiano a <em>tutte</em> le colonne simultaneamente. Le colonne esterne usano ripiani <strong>BORDO</strong>, quelle interne <strong>INTERMEZZO</strong>.
                <span v-if="!columnsAligned" class="alignment-warning" role="alert">
                  ⚠️ Livelli non allineati tra colonne. Completa il design su tutte le colonne prima di finalizzare.
                </span>
              </div>

              <div class="design-columns">
                <article v-for="column in canvasColumns" :key="`design-col-${column.index}`" class="design-column">
                  <header>
                    <strong>Colonna {{ column.index + 1 }}</strong>
                    <span>{{ column.shelfWidthMm }}mm</span>
                    <span
                      v-if="isIntelligente"
                      class="role-badge"
                      :class="columnRoles.get(column.index) === 'BORDO' ? 'role-badge--bordo' : 'role-badge--intermezzo'"
                    >{{ columnRoles.get(column.index) ?? '' }}</span>
                  </header>

                  <p class="mini muted">Livelli correnti: {{ column.levels.join(', ') || 'nessuno' }}</p>
                  <p class="mini muted">
                    {{ column.levels.length === 0 ? 'Primo livello: scegli un PIEDINO o un ponte verso le colonne adiacenti' : 'Livello successivo: scegli un MONTANTE o un ponte' }}
                  </p>
                  <p v-if="!isIntelligente && hasBridgeOption(column.index)" class="mini bridge-hint">
                    🌉 Puoi creare un <strong>ponte</strong>: unire questa colonna alle adiacenti scavalcando un gap più alto dei montanti singoli.
                  </p>

                  <label class="field" v-if="effectiveOptions(column.index).length > 0">
                    <span class="field__label">Altezza pezzo da aggiungere</span>
                    <select
                      class="field__input field__input--column-select"
                      :aria-label="`Seleziona altezza da aggiungere per colonna ${column.index + 1}`"
                      :disabled="!canEditDesign || designLoading"
                      v-model.number="selectedGapByColumn[column.index]"
                    >
                      <option
                        v-for="option in effectiveOptions(column.index)"
                        :key="`opt-${column.index}-${option.heightMm}`"
                        :value="option.allowed ? option.heightMm : null"
                        :disabled="!option.allowed"
                      >
                          {{ option.heightMm }}mm{{ option.kind === 'bridge' ? ' · ponte' : '' }}{{ option.allowed ? '' : ` - ${option.reasonCode || 'NON_CONSENTITA'}` }}
                      </option>
                    </select>
                  </label>

                  <p class="mini muted" v-if="effectiveOptions(column.index).length === 0">
                    Nessuna opzione disponibile dal backend per questa colonna.
                  </p>
                  <p class="mini blocked-reasons" v-else-if="!hasAllowedOption(column.index)">
                    Nessuna scelta valida: {{ blockedReasonsSummary(column.index) }}
                  </p>

                  <div class="actions-row">
                    <button
                      class="btn btn--primary btn--small"
                      :aria-label="`Aggiungi livello alla colonna ${column.index + 1}`"
                      :disabled="!canEditDesign || designLoading || !selectedGapByColumn[column.index]"
                      @click="addShelf(column.index)"
                    >
                      + Livello
                    </button>
                    <button
                      class="btn btn--light btn--small"
                      :aria-label="`Rimuovi ultimo livello dalla colonna ${column.index + 1}`"
                      :disabled="!canEditDesign || designLoading || column.levels.length === 0"
                      @click="removeShelf(column.index)"
                    >
                      - Ultimo
                    </button>
                  </div>
                </article>
              </div>
            </article>

            <article class="control-card finalize-card">
              <h3>Step 5 - Finalizzazione</h3>
              <button class="btn btn--primary" :disabled="!canFinalize || finalizeLoading" @click="finalizeSelected">
                {{ finalizeLoading ? 'Finalizzazione...' : 'Finalizza e invia al carrello' }}
              </button>
              <p v-if="!canFinalize" class="hint">Finalizzazione disponibile solo in READY_FOR_FINALIZE.</p>
            </article>
          </section>
        </template>
      </main>

      <aside class="schema-panel" v-if="selected">
        <section class="canvas-section">
          <header class="canvas-section__header">
            <div>
              <h3>Schema grafico</h3>
              <p class="mini muted">Vista sempre visibile della struttura corrente</p>
            </div>
            <span class="canvas-size">{{ environmentDraft.maxWidthMm }} x {{ environmentDraft.maxHeightMm }} mm</span>
          </header>

          <div class="canvas-scroll">
            <div class="canvas-grid">
              <article
                v-for="column in canvasColumns"
                :key="column.index"
                class="canvas-column"
                :style="{
                  '--column-grow': String(
                    Number.isFinite(column.shelfWidthMm) && column.shelfWidthMm > 0
                      ? column.shelfWidthMm
                      : 1,
                  ),
                }"
              >
              <div class="canvas-column__scale">Y</div>
              <div class="canvas-column__body">
                <div
                  v-for="(level, idx) in column.levelPercents"
                  :key="`level-${column.index}-${idx}`"
                  class="level-line"
                  :style="{ bottom: `${level}%` }"
                >
                  <span>{{ column.levels[idx] }}mm</span>
                </div>
              </div>
              <div class="canvas-column__x">C{{ column.index + 1 }} · {{ column.shelfWidthMm }}mm<span v-if="isIntelligente" class="canvas-role-label"> ({{ columnRoles.get(column.index) ?? '' }})</span></div>
              </article>
            </div>
          </div>
        </section>
      </aside>

      <aside class="right-panel" v-if="selected">
        <h2>Distinta componenti</h2>
        <p class="muted">Anteprima aggiornata in tempo reale dal backend</p>

        <div class="bom-list" v-if="(selected.bom?.length ?? 0) > 0">
          <article class="bom-row" v-for="item in selected.bom" :key="`${item.sku}-${item.componentType || 'GEN'}`">
            <div>
              <strong>{{ item.name }}</strong>
              <p class="mini">SKU: {{ item.sku }} · {{ formatComponentTypeLabel(item.componentType) }}</p>
            </div>
            <div class="bom-row__right">
              <span>x{{ item.quantity }}</span>
              <strong>
                {{ formatPrice((item.unitPrice ?? ((item.unitPriceCents || 0) / 100)) * item.quantity) }}
              </strong>
            </div>
          </article>
        </div>
        <p v-else class="placeholder">Nessun componente disponibile: completa i passaggi di design.</p>

        <footer class="total-box">
          <span>Totale preview</span>
          <strong>{{ formatPrice(totalPrice) }}</strong>
        </footer>
      </aside>
    </div>

    <div v-if="showBomMobile" class="modal-overlay" @click.self="showBomMobile = false">
      <article class="modal-card">
        <header class="modal-header">
          <h3>Distinta componenti</h3>
          <button class="btn btn--light btn--small" @click="showBomMobile = false">Chiudi</button>
        </header>
        <div class="bom-list" v-if="(selected?.bom?.length ?? 0) > 0">
          <article class="bom-row" v-for="item in selected?.bom" :key="`mob-${item.sku}-${item.componentType || 'GEN'}`">
            <div>
              <strong>{{ item.name }}</strong>
              <p class="mini">SKU: {{ item.sku }} · {{ formatComponentTypeLabel(item.componentType) }}</p>
            </div>
            <div class="bom-row__right">
              <span>x{{ item.quantity }}</span>
              <strong>
                {{ formatPrice((item.unitPrice ?? ((item.unitPriceCents || 0) / 100)) * item.quantity) }}
              </strong>
            </div>
          </article>
        </div>
        <p v-else class="placeholder">Nessun componente disponibile.</p>
        <footer class="total-box">
          <span>Totale preview</span>
          <strong>{{ formatPrice(totalPrice) }}</strong>
        </footer>
      </article>
    </div>

    <div v-if="showCollabModal" class="modal-overlay" @click.self="showCollabModal = false">
      <article class="modal-card modal-card--narrow">
        <header class="modal-header">
          <h3>Sessione collaborativa attiva</h3>
          <button class="btn btn--light btn--small" @click="showCollabModal = false">Chiudi</button>
        </header>
        <p>Condividi questo codice con chi vuoi far partecipare:</p>
        <p class="collab-code-display">{{ collabSessionCode }}</p>
        <p class="mini muted">Sia utenti registrati che ospiti possono usarlo. La sessione termina quando esci dalla configurazione.</p>
        <div class="actions-row">
          <button class="btn btn--primary" @click="copySessionCode">Copia codice</button>
        </div>
      </article>
    </div>

    <div v-if="showResetConfirm" class="modal-overlay" @click.self="cancelReset">
      <article class="modal-card modal-card--narrow">
        <h3>Conferma reset progetto</h3>
        <p>
          Cambiare ambiente o categoria dopo la definizione colonne resetta design e componenti. Vuoi continuare?
        </p>
        <div class="actions-row">
          <button class="btn btn--light" @click="cancelReset">Annulla</button>
          <button class="btn btn--primary" @click="confirmResetStepOne">Continua</button>
        </div>
      </article>
    </div>

    <div v-if="showResetFinalConfirm" class="modal-overlay" @click.self="cancelReset">
      <article class="modal-card modal-card--narrow">
        <h3>Seconda conferma richiesta</h3>
        <p>Confermi definitivamente il reset dei passaggi successivi?</p>
        <div class="actions-row">
          <button class="btn btn--light" @click="cancelReset">Annulla</button>
          <button class="btn btn--primary" @click="confirmResetStepTwo">Conferma reset</button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.cad-workspace {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
}

.cad-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
}

.subtitle {
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}

.header-actions {
  display: flex;
  gap: var(--space-2);
}

.collab-strip {
  margin-top: var(--space-3);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.collab-actions {
  display: flex;
  gap: var(--space-2);
}

.bom-mobile-btn {
  display: none;
}

.toolbar {
  margin-top: var(--space-5);
  display: flex;
  justify-content: space-between;
  align-items: end;
}

.create-card {
  margin-top: var(--space-5);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field__label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.field__input {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.field__input--column-select {
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta,
.muted {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.mini {
  font-size: var(--font-size-xs);
}

.error {
  margin-top: var(--space-4);
  color: var(--color-error);
  background: var(--color-error-subtle);
  border: 1px solid #f0cccc;
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.cad-layout {
  margin-top: var(--space-5);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px) minmax(280px, 340px);
  gap: var(--space-4);
  align-items: stretch;
}

.schema-panel,
.center-panel,
.right-panel {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.center-panel,
.schema-panel,
.right-panel {
  max-height: calc(100vh - 130px);
  overflow: auto;
}

.stepper {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-2);
}

.step {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-surface-raised);
}

.step__index {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-xs);
}

.step__label {
  font-size: var(--font-size-xs);
}

.step--active {
  border-color: var(--color-accent);
}

.step--done .step__index {
  background: var(--color-accent);
  color: #fff;
}

.meta-row {
  margin-top: var(--space-3);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.meta-row > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.schema-panel {
  position: sticky;
  top: var(--space-4);
  align-self: start;
}

.canvas-section {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  background: var(--color-surface-raised);
}

.canvas-section__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-3);
}

.canvas-size {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.canvas-grid {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
  min-height: 260px;
  min-width: 100%;
  width: max-content;
}

.canvas-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: var(--space-1);
}

.canvas-column {
  flex: var(--column-grow, 1) 0 0;
  min-width: 140px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: var(--space-2);
}

.canvas-column__scale,
.canvas-column__x {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.canvas-column__body {
  position: relative;
  background: linear-gradient(to top, #f2f6f8 0%, #ffffff 100%);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.level-line {
  position: absolute;
  left: 8px;
  right: 8px;
  border-top: 2px solid var(--color-accent);
}

.level-line span {
  position: absolute;
  right: 0;
  top: -14px;
  background: #fff;
  font-size: 10px;
  color: var(--color-text-secondary);
  padding: 0 4px;
}

.controls-section {
  margin-top: var(--space-4);
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
  min-width: 0;
}

.control-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: grid;
  gap: var(--space-3);
}

.two-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(140px, 1fr));
  gap: var(--space-2);
}

.column-widths {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-2);
}

.design-columns {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-2);
}

.collab-code-display {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-align: center;
  background: var(--color-surface-raised);
  border: 2px solid var(--color-accent);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  margin: var(--space-2) 0;
  font-family: monospace;
}

.design-column {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  overflow: hidden;
}

.design-column header {
  display: flex;
  justify-content: space-between;
}

.actions-row {
  display: flex;
  gap: var(--space-2);
}

.blocked-reasons {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.bridge-hint {
  color: var(--color-primary, #4f46e5);
  background: color-mix(in srgb, var(--color-primary, #4f46e5) 6%, transparent);
  border-radius: var(--radius-sm, 6px);
  padding: 4px 8px;
  line-height: 1.4;
}

.intelligente-banner {
  background: color-mix(in srgb, var(--color-primary, #4f46e5) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary, #4f46e5) 30%, transparent);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-3);
  font-size: 0.85rem;
  line-height: 1.5;
}

.alignment-warning {
  display: block;
  margin-top: var(--space-1);
  color: var(--color-warning, #b45309);
  font-weight: 600;
}

.role-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 999px;
  text-transform: uppercase;
}

.role-badge--bordo {
  background: #dbeafe;
  color: #1e40af;
}

.role-badge--intermezzo {
  background: #dcfce7;
  color: #166534;
}

.canvas-role-label {
  font-size: 0.7rem;
  opacity: 0.75;
}

.bom-list {
  margin-top: var(--space-3);
  display: grid;
  gap: var(--space-2);
}

.bom-row {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}

.bom-row__right {
  text-align: right;
  display: grid;
  gap: 2px;
}

.total-box {
  margin-top: var(--space-4);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-3);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.placeholder,
.hint {
  color: var(--color-text-muted);
  margin-top: var(--space-2);
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
  width: min(720px, 100%);
  max-height: 88vh;
  overflow: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.modal-card--narrow {
  width: min(460px, 100%);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.btn--small {
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-sm);
}

.btn--primary {
  background: var(--color-accent);
  color: #fff;
}

.btn--light {
  background: var(--color-surface-raised);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

@media (max-width: 1360px) {
  .cad-layout {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
    align-items: start;
  }

  .right-panel {
    grid-column: 1 / -1;
    max-height: none;
    overflow: visible;
  }

  .schema-panel {
    position: static;
  }
}

@media (max-width: 1200px) {
  .cad-workspace {
    padding: var(--space-6) var(--space-4);
  }

  .design-columns {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}

@media (max-width: 980px) {
  .cad-workspace {
    padding: var(--space-6) var(--space-4);
  }

  .cad-layout {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }

  .center-panel,
  .schema-panel,
  .right-panel {
    max-height: none;
    overflow: visible;
  }

  .center-panel {
    order: 1;
  }

  .schema-panel {
    order: 2;
  }

  .right-panel {
    display: none;
  }

  .bom-mobile-btn {
    display: inline-flex;
  }

  .stepper {
    grid-template-columns: 1fr;
  }

  .meta-row,
  .two-cols {
    grid-template-columns: 1fr;
  }

  .actions-row {
    flex-wrap: wrap;
  }

  .collab-strip {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 760px) {
  .design-columns {
    grid-template-columns: 1fr;
  }
}
</style>
