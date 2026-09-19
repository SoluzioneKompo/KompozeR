<script setup lang="ts">
/** CAD configurator view orchestrating category, design, and BOM workflows. */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type {
  Category,
  ColumnDesign,
  ColumnPlan,
  NextOption,
  TerminalSelection,
} from '@/types/cad';
import { useCad } from '@/composables/useCad';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { cadCollabSocket, type CollabFieldPath, type CollabPresencePayload } from '@/services/cadCollabSocket';
import { catalogService } from '@/services/catalogService';
import type { CatalogItem } from '@/types/catalog';
import type { ConfigurationDto } from '@/types/cad';
import { typeLabel } from '@/utils/catalogGrouping';
import { getIntlLocale } from '@/i18n/format';
import { computeAssemblyGeometry } from '@/utils/cadAssembly';
import { resolveShelfRoles, type ShelfRole } from '@/utils/shelfRoleResolver';

const { t } = useI18n();

const {
  selected,
  detailLoading,
  createLoading,
  finalizeLoading,
  categoryLoading,
  columnPlanLoading,
  designLoading,
  resetLoading,
  error,
  nextOptionsByColumn,
  loadDetail,
  updateCategory,
  updateColumnPlan,
  fetchNextOptions,
  setNextOptions,
  addTopShelf,
  removeTopShelf,
  updateDesign,
  resetConfiguration,
  createConfiguration,
  createName,
  finalizeSelected,
} = useCad();

const categories: Array<Category> = ['TONDO', 'QUADRO', 'KUBE'];
const route = useRoute();
const notifications = useNotificationStore();
const authStore = useAuthStore();

const columnCountDraft = ref(2);
const shelfWidthsDraft = ref<number[]>([800, 800]);
const SHELF_THICKNESS_MM = 20;
const shelfThicknessDraft = ref(SHELF_THICKNESS_MM);
const categoryDraft = ref('');
const selectedGapByColumn = ref<Record<number, number | null>>({});
const categoryCatalogItems = ref<CatalogItem[]>([]);
const catalogLoading = ref(false);

const showBomModal = ref(false);
const showResetConfirm = ref(false);
const showResetFinalConfirm = ref(false);
const showResetConfigConfirm = ref(false);
const pendingCategory = ref<Category | null>(null);
const pendingColumnPlan = ref<ColumnPlan | null>(null);
const terminalHeightBySpine = ref<Record<number, number | null>>({});
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
    if (!res.ok) throw new Error(t('cad.toasts.httpError', { status: res.status }));
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
    notifications.addToast('error', err instanceof Error ? err.message : t('cad.toasts.startSessionFailed'));
  } finally {
    startCollabLoading.value = false;
  }
}

/** Participant: joins an existing session by entering the code. */
async function joinByCode(): Promise<void> {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) {
    notifications.addToast('error', t('cad.toasts.invalidCode'));
    return;
  }

  joinLoading.value = true;
  try {
    // A participant joins purely by session code; the owner's configuration id is
    // resolved server-side from the code, so the path id is only a placeholder here.
    const joinPathId = selected.value?.id ?? 'join';
    const res = await fetch(`/api/cad/configurations/${joinPathId}/collab/join/${code}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('kompozer_token') ?? ''}`,
      },
    });
    if (!res.ok) throw new Error(t('cad.toasts.httpError', { status: res.status }));
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
    notifications.addToast('success', t('cad.toasts.sessionJoined', { code: data.sessionCode }));
  } catch (err) {
    notifications.addToast('error', err instanceof Error ? err.message : t('cad.toasts.joinFailed'));
  } finally {
    joinLoading.value = false;
  }
}

/** Copies the current session code to clipboard. */
async function copySessionCode(): Promise<void> {
  if (!collabSessionCode.value) return;
  try {
    await navigator.clipboard.writeText(collabSessionCode.value);
    notifications.addToast('success', t('cad.toasts.codeCopied', { code: collabSessionCode.value }));
  } catch {
    notifications.addToast('error', t('cad.toasts.copyFailed'));
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
    const message = payload.error?.message || t('cad.toasts.realtimeError');
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
    notifications.addToast('error', t('cad.toasts.ownerLeft'));
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
    case 'CATEGORY_SELECTED':
      return 1;
    case 'COLUMNS_DEFINED':
      return 2;
    case 'DESIGN_IN_PROGRESS':
      return 2;
    case 'READY_FOR_FINALIZE':
      return 3;
    case 'FINALIZED':
      return 4;
    default:
      return 0;
  }
});

const canFinalize = computed(() => selected.value?.status === 'READY_FOR_FINALIZE');
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
    return t('cad.collab.statusSelectOrCreate');
  }
  if (collabOwnerDisconnected.value) {
    return t('cad.collab.statusOwnerLeftEnded');
  }
  if (collabMode.value === 'shared') {
    return collabConnected.value
      ? t('cad.collab.statusActive', { count: collabParticipants.value.length, code: collabSessionCode.value })
      : t('cad.collab.statusReconnecting');
  }
  return t('cad.collab.statusSolitary');
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

// Step2 only offers plain RIPIANO widths: BORDO/INTERMEDIO shelves are assigned
// dynamically per level (based on adjacency), never chosen directly by the user.
const availableShelfWidths = computed(() =>
  uniqueSortedNumeric(
    categoryCatalogItems.value
      .filter((item) => normalizedType(item) === 'RIPIANO')
      .map((item) => Number(item.dimensions?.widthMm))
      .filter((value) => Number.isFinite(value) && value > 0),
  ),
);

/** Catalog-available TERMINALE heights for the selected category. */
const availableTerminalHeights = computed(() =>
  uniqueSortedNumeric(
    categoryCatalogItems.value
      .filter((item) => normalizedType(item) === 'TERMINALE')
      .map((item) => Number(item.dimensions?.heightMm))
      .filter((value) => Number.isFinite(value) && value > 0),
  ),
);

/**
 * One entry per spine (columnCount + 1): the outer two are owned by a single
 * outer column, inner ones sit between two adjacent columns and are shared —
 * mirrors backend `SpineModel.buildSpines` indexing.
 */
const spines = computed(() => {
  const cols = orderedColumns.value;
  if (cols.length === 0) {
    return [];
  }

  return Array.from({ length: cols.length + 1 }, (_, spineIndex) => ({
    spineIndex,
    leftColumnNumber: spineIndex > 0 ? spineIndex : null,
    rightColumnNumber: spineIndex < cols.length ? spineIndex + 1 : null,
  }));
});

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

/** Rebuilds the per-spine terminal-height draft from persisted selections + catalog defaults. */
watch(
  [() => selected.value?.terminalSelections, () => selected.value?.columnPlan?.columnCount, availableTerminalHeights],
  () => {
    const columnCount = selected.value?.columnPlan?.columnCount;
    if (!columnCount) {
      terminalHeightBySpine.value = {};
      return;
    }

    const selectionsByIndex = new Map(
      (selected.value?.terminalSelections ?? []).map((selection) => [selection.spineIndex, selection.heightMm]),
    );
    const defaultHeight = availableTerminalHeights.value[0] ?? null;

    const next: Record<number, number | null> = {};
    for (let spineIndex = 0; spineIndex <= columnCount; spineIndex += 1) {
      next[spineIndex] = selectionsByIndex.get(spineIndex) ?? defaultHeight;
    }
    terminalHeightBySpine.value = next;
  },
  { immediate: true },
);

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

/** True when the selected configuration uses QUADRO logic (BORDO/INTERMEDIO shelves possible). */
const isQuadro = computed(() => selected.value?.category === 'QUADRO');

/**
 * QUADRO shelf role per (column, level): a level shared with index-adjacent
 * columns becomes BORDO (cluster of 2) or BORDO/INTERMEDIO (cluster of 3+); a
 * level not shared by any neighbor stays NORMALE (plain RIPIANO). The same
 * column can therefore have different roles on different levels.
 */
const shelfRolesByColumn = computed((): Map<number, Map<number, ShelfRole>> => {
  const plan = selected.value?.columnPlan;
  if (!plan || !isQuadro.value) return new Map();
  const sorted = plan.columns.slice().sort((a, b) => a.index - b.index);
  const levelsByPosition = sorted.map((col) => ({
    levelsMm: designByColumn.value.get(col.index)?.levelsMm ?? [],
  }));
  const rolesByPosition = resolveShelfRoles(levelsByPosition);
  const result = new Map<number, Map<number, ShelfRole>>();
  sorted.forEach((col, position) => {
    result.set(col.index, rolesByPosition.get(position) ?? new Map());
  });
  return result;
});

function shelfRoleFor(columnIndex: number, levelMm: number): ShelfRole {
  return shelfRolesByColumn.value.get(columnIndex)?.get(levelMm) ?? 'NORMALE';
}

const canvasColumns = computed(() => {
  return orderedColumns.value.map((column) => {
    const design = designByColumn.value.get(column.index);
    return { ...column, levels: design?.levelsMm ?? [] };
  });
});

/** Realistic 2D assembly geometry (feet/uprights/terminals/shelves) for the schema panel. */
const assembly = computed(() => computeAssemblyGeometry(selected.value?.columnPlan, selected.value?.columnDesigns));

const ASSEMBLY_BASE_SCALE_PX_PER_MM = 0.6;
const assemblyZoom = ref(1);
const canvasScrollRef = ref<HTMLElement | null>(null);

/** True-scale width (px) of the assembly drawing at zoom 1. */
const assemblyBaseWidthPx = computed(() => Math.max(200, assembly.value.totalWidthMm * ASSEMBLY_BASE_SCALE_PX_PER_MM));
/** Rendered width (px) after applying the current zoom level. */
const assemblyFrameWidthPx = computed(() => assemblyBaseWidthPx.value * assemblyZoom.value);
const assemblyZoomPercent = computed(() => Math.round(assemblyZoom.value * 100));

function zoomIn(): void {
  assemblyZoom.value = Math.min(3, Math.round((assemblyZoom.value + 0.25) * 100) / 100);
}

function zoomOut(): void {
  assemblyZoom.value = Math.max(0.1, Math.round((assemblyZoom.value - 0.25) * 100) / 100);
}

function zoomReset(): void {
  assemblyZoom.value = 1;
}

/** Shrinks (or grows) the drawing so the whole width fits the visible panel without horizontal scrolling. */
function zoomFit(): void {
  const containerWidth = canvasScrollRef.value?.clientWidth ?? 0;
  if (containerWidth <= 0) {
    return;
  }
  assemblyZoom.value = Math.max(0.1, Math.round((containerWidth / assemblyBaseWidthPx.value) * 100) / 100);
}

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
  return new Intl.DateTimeFormat(getIntlLocale(), {
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
  value: string | Category | ColumnPlan | ColumnDesign[] | null,
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
  return new Intl.NumberFormat(getIntlLocale(), {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

/** Formats a millimeter measurement as centimeters for display (storage stays in mm). */
function formatCm(valueMm: number): string {
  const cm = Math.round((valueMm / 10) * 10) / 10;
  return `${Number.isInteger(cm) ? cm : cm.toFixed(1)} cm`;
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

/** Saves currently selected category draft; triggered automatically on select change. */
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

/** Applies pending reset changes for category or column-plan updates. */
async function confirmResetStepTwo(): Promise<void> {
  showResetFinalConfirm.value = false;

  if (pendingCategory.value) {
    const baseVersion = selected.value?.version ?? 1;
    await updateCategory(pendingCategory.value);
    await broadcastCollabOperation('category', pendingCategory.value, baseVersion);
    pendingCategory.value = null;
    return;
  }

  if (pendingColumnPlan.value) {
    const plan = pendingColumnPlan.value;
    pendingColumnPlan.value = null;
    await applyColumnPlan(plan);
  }
}

/** Aborts reset flow and restores drafts from persisted configuration state. */
function cancelReset(): void {
  showResetConfirm.value = false;
  showResetFinalConfirm.value = false;
  pendingCategory.value = null;
  pendingColumnPlan.value = null;
}

/** Persists a column plan and broadcasts the change to any active collab session. */
async function applyColumnPlan(columnPlan: ColumnPlan): Promise<void> {
  if (!selected.value) {
    return;
  }

  const baseVersion = selected.value.version;
  await updateColumnPlan(columnPlan);
  await broadcastCollabOperation('columnPlan', columnPlan, baseVersion);
}

/**
 * Saves current column count and shelf width draft as column plan; triggered
 * automatically on change. Redoing the plan after a design already exists
 * discards that design, so it goes through the same two-step reset confirm
 * used for category changes.
 */
async function saveColumnPlan(): Promise<void> {
  if (!selected.value) {
    return;
  }

  const columnPlan: ColumnPlan = {
    columnCount: columnCountDraft.value,
    columns: shelfWidthsDraft.value.map((shelfWidthMm, index) => ({ index, shelfWidthMm })),
  };

  if (selected.value.columnDesigns.length > 0) {
    pendingColumnPlan.value = columnPlan;
    showResetConfirm.value = true;
    return;
  }

  await applyColumnPlan(columnPlan);
}

/** Adjusts the column-count draft, waits for the width-array resize, then auto-saves. */
async function onColumnCountChange(value: number): Promise<void> {
  syncDraftLengths(value);
  await nextTick();
  await saveColumnPlan();
}

/** Explicit "reset configuration" button: clears columns/design, keeps the category. */
function requestConfigReset(): void {
  if (!selected.value) {
    return;
  }
  showResetConfigConfirm.value = true;
}

async function confirmConfigReset(): Promise<void> {
  showResetConfigConfirm.value = false;
  await resetConfiguration();
}

function cancelConfigReset(): void {
  showResetConfigConfirm.value = false;
}

/** Returns raw next-step options for a given column index. */
function getOptions(columnIndex: number): NextOption[] {
  return nextOptionsByColumn.value[columnIndex] ?? [];
}

/** Returns only the currently usable (allowed) options for a column — blocked choices are hidden, not shown disabled. */
function effectiveOptions(columnIndex: number): NextOption[] {
  return getOptions(columnIndex).filter((option) => option.allowed);
}

/** True when the column offers at least one neighbor-anchored bridge option. */
function hasBridgeOption(columnIndex: number): boolean {
  return effectiveOptions(columnIndex).some((option) => option.kind === 'bridge');
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

  await addTopShelf(columnIndex, gap, shelfThicknessDraft.value);
  if (selected.value) {
    await broadcastCollabOperation('columnDesigns', selected.value.columnDesigns, baseVersion);
  }
  await refreshOptionsAround(columnIndex);
}

/** Removes top shelf from a column and refreshes dependent options. */
async function removeShelf(columnIndex: number): Promise<void> {
  if (!selected.value) {
    return;
  }

  const baseVersion = selected.value.version;

  await removeTopShelf(columnIndex, shelfThicknessDraft.value);
  if (selected.value) {
    await broadcastCollabOperation('columnDesigns', selected.value.columnDesigns, baseVersion);
  }
  await refreshOptionsAround(columnIndex);
}

/** Persists the chosen terminal height for one spine; auto-saves on selection. */
async function saveTerminalSelection(spineIndex: number, heightMm: number): Promise<void> {
  if (!selected.value?.columnPlan) {
    return;
  }

  terminalHeightBySpine.value = { ...terminalHeightBySpine.value, [spineIndex]: heightMm };

  const baseVersion = selected.value.version;
  const terminalSelections: TerminalSelection[] = Object.entries(terminalHeightBySpine.value)
    .filter((entry): entry is [string, number] => entry[1] != null)
    .map(([index, height]) => ({ spineIndex: Number(index), heightMm: height }));

  await updateDesign(selected.value.columnDesigns, terminalSelections);
  if (selected.value) {
    await broadcastCollabOperation('columnDesigns', selected.value.columnDesigns, baseVersion);
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
        <h1>{{ t('cad.header.title') }}</h1>
        <p class="subtitle">{{ t('cad.header.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <button class="btn btn--light" :disabled="detailLoading || !selected" @click="reloadSelected">{{ t('cad.header.refreshDetail') }}</button>
        <button
          v-if="selected && selected.category && selected.status !== 'FINALIZED'"
          class="btn btn--light"
          :disabled="resetLoading"
          @click="requestConfigReset"
        >
          {{ resetLoading ? t('cad.resetConfig.resetting') : t('cad.resetConfig.button') }}
        </button>
        <button
          v-if="selected"
          class="btn btn--light bom-trigger-btn"
          :aria-label="t('cad.bom.title')"
          @click="showBomModal = true"
        >
          <span class="bom-trigger-icon" aria-hidden="true">🧾</span>
          <span class="bom-trigger-total">{{ formatPrice(totalPrice) }}</span>
        </button>
      </div>
    </header>

    <section v-if="selected" class="collab-strip" aria-live="polite">
      <div>
        <p class="mini muted">{{ t('cad.collab.sessionLabel') }}</p>
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
            {{ startCollabLoading ? t('cad.collab.starting') : t('cad.collab.start') }}
          </button>
        </template>
        <!-- Shared: show code + stop -->
        <template v-if="collabMode === 'shared' && !collabOwnerDisconnected">
          <button class="btn btn--light btn--small" @click="showCollabModal = true">
            {{ t('cad.collab.codePrefix') }} <strong>{{ collabSessionCode }}</strong>
          </button>
          <button
            v-if="isCollabOwner"
            class="btn btn--light btn--small"
            @click="() => { if (selected && collabSessionCode) { void cadCollabSocket.leaveSession(selected.id, collabSessionCode); resetCollabState(); } }"
          >
            {{ t('cad.collab.endSession') }}
          </button>
        </template>
        <!-- Owner disconnected -->
        <template v-if="collabOwnerDisconnected">
          <span class="muted mini">{{ t('cad.collab.endedWarning') }}</span>
          <button class="btn btn--light btn--small" @click="resetCollabState">{{ t('cad.collab.backToSolitary') }}</button>
        </template>
      </div>
    </section>

    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>

    <div class="cad-layout">
      <main class="center-panel">
        <p v-if="detailLoading" class="placeholder">{{ t('cad.header.loadingDetail') }}</p>
        <section v-else-if="!selected" class="create-card">
          <h3>{{ t('cad.create.title') }}</h3>
          <p class="muted">{{ t('cad.create.hint') }}</p>
          <div class="actions-row">
            <label class="field" style="flex: 1; min-width: 220px;">
              <span class="field__label">{{ t('cad.create.nameLabel') }}</span>
              <input v-model="createName" class="field__input" type="text" :placeholder="t('cad.create.namePlaceholder')" />
            </label>
            <button class="btn btn--primary" :disabled="createLoading" @click="createFromCad">
              {{ createLoading ? t('cad.create.creating') : t('cad.create.createButton') }}
            </button>
          </div>

          <div class="actions-row" style="margin-top: var(--space-3);">
            <label class="field" style="flex: 1; min-width: 220px;">
              <span class="field__label">{{ t('cad.create.joinCodeLabel') }}</span>
              <input
                v-model="joinCodeInput"
                class="field__input"
                type="text"
                :placeholder="t('cad.create.joinCodePlaceholder')"
                maxlength="6"
                style="text-transform: uppercase;"
              />
            </label>
            <button class="btn btn--light" :disabled="joinLoading" @click="joinFromCad">
              {{ joinLoading ? t('cad.create.joining') : t('cad.create.joinButton') }}
            </button>
          </div>
        </section>

        <template v-else>
          <section class="stepper">
            <article class="step" :class="{ 'step--done': stepDone(0), 'step--active': stepActive(0) }">
              <span class="step__index">1</span>
              <span class="step__label">{{ t('cad.steps.category') }}</span>
            </article>
            <article class="step" :class="{ 'step--done': stepDone(1), 'step--active': stepActive(1) }">
              <span class="step__index">2</span>
              <span class="step__label">{{ t('cad.steps.columns') }}</span>
            </article>
            <article class="step" :class="{ 'step--done': stepDone(2), 'step--active': stepActive(2) }">
              <span class="step__index">3</span>
              <span class="step__label">{{ t('cad.steps.design') }}</span>
            </article>
            <article class="step" :class="{ 'step--done': stepDone(3), 'step--active': stepActive(3) }">
              <span class="step__index">4</span>
              <span class="step__label">{{ t('cad.steps.finalize') }}</span>
            </article>
          </section>

          <section class="meta-row">
            <div><span class="muted">{{ t('cad.meta.configuration') }}</span><strong>{{ selected.name }}</strong></div>
            <div><span class="muted">{{ t('cad.meta.status') }}</span><strong>{{ selected.status }}</strong></div>
            <div><span class="muted">{{ t('cad.meta.lastUpdate') }}</span><strong>{{ formatDate(selected.updatedAt) }}</strong></div>
          </section>

          <section class="controls-section">
            <article class="control-card">
              <h3>{{ t('cad.categoryStep.title') }}</h3>
              <label class="field">
                <span class="field__label">{{ t('cad.categoryStep.label') }}</span>
                <select
                  class="field__input"
                  v-model="categoryDraft"
                  :disabled="!canEditCategory || categoryLoading"
                  @change="submitCategory"
                >
                  <option disabled value="">{{ t('cad.categoryStep.placeholder') }}</option>
                  <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
                </select>
              </label>
              <p class="mini muted" v-if="categoryLoading">{{ t('cad.categoryStep.saving') }}</p>
            </article>

            <article class="control-card">
              <h3>{{ t('cad.columnsStep.title') }}</h3>
              <label class="field">
                <span class="field__label">{{ t('cad.columnsStep.countLabel') }}</span>
                <input
                  :value="columnCountDraft"
                  class="field__input"
                  type="number"
                  min="1"
                  max="8"
                  :disabled="!canEditColumns"
                  @change="onColumnCountChange(Number(($event.target as HTMLInputElement).value))"
                />
              </label>
              <p class="mini muted" v-if="catalogLoading">{{ t('cad.columnsStep.loadingWidths') }}</p>
              <p class="mini muted" v-else-if="availableShelfWidths.length === 0">
                {{ t('cad.columnsStep.noShelvesAvailable') }}
              </p>
              <div class="column-widths">
                <label v-for="(_, i) in columnCountDraft" :key="`col-width-${i}`" class="field">
                  <span class="field__label">{{ t('cad.columnsStep.columnLabel', { n: i + 1 }) }}</span>
                  <select
                    v-model.number="shelfWidthsDraft[i]"
                    class="field__input"
                    :disabled="!canEditColumns || availableShelfWidths.length === 0"
                    @change="saveColumnPlan"
                  >
                    <option v-for="width in availableShelfWidths" :key="`width-${i}-${width}`" :value="width">
                      {{ formatCm(width) }}
                    </option>
                  </select>
                </label>
              </div>
              <p class="mini muted" v-if="columnPlanLoading">{{ t('cad.columnsStep.saving') }}</p>
            </article>

            <article class="control-card">
              <h3>{{ t('cad.designStep.title') }}</h3>
              <p class="mini muted">{{ t('cad.designStep.fixedThickness', { cm: formatCm(shelfThicknessDraft) }) }}</p>

              <div class="design-columns">
                <article v-for="column in canvasColumns" :key="`design-col-${column.index}`" class="design-column">
                  <header>
                    <strong>{{ t('cad.designStep.columnLabel', { n: column.index + 1 }) }}</strong>
                    <span>{{ formatCm(column.shelfWidthMm) }}</span>
                  </header>

                  <ul v-if="isQuadro && column.levels.length > 0" class="mini muted level-list">
                    <li v-for="level in column.levels" :key="`lvl-${column.index}-${level}`">
                      {{ formatCm(level) }}
                      <span
                        v-if="shelfRoleFor(column.index, level) !== 'NORMALE'"
                        class="role-badge"
                        :class="shelfRoleFor(column.index, level) === 'BORDO' ? 'role-badge--bordo' : 'role-badge--intermezzo'"
                      >{{ shelfRoleFor(column.index, level) }}</span>
                    </li>
                  </ul>
                  <p v-else class="mini muted">{{ t('cad.designStep.currentLevels', { levels: column.levels.length > 0 ? column.levels.map(formatCm).join(', ') : t('cad.designStep.none') }) }}</p>
                  <p class="mini muted">
                    {{
                      column.levels.length === 0
                        ? t('cad.designStep.firstLevelHint', { type: typeLabel('PIEDINO') })
                        : t('cad.designStep.nextLevelHint', { type: typeLabel('MONTANTE') })
                    }}
                  </p>
                  <p v-if="hasBridgeOption(column.index)" class="mini bridge-hint">
                    🌉 <span v-html="t('cad.designStep.bridgeHint')"></span>
                  </p>

                  <label class="field" v-if="effectiveOptions(column.index).length > 0">
                    <span class="field__label">{{ t('cad.designStep.pieceHeightLabel') }}</span>
                    <select
                      class="field__input field__input--column-select"
                      :aria-label="t('cad.designStep.selectHeightAriaLabel', { n: column.index + 1 })"
                      :disabled="!canEditDesign || designLoading"
                      v-model.number="selectedGapByColumn[column.index]"
                    >
                      <option
                        v-for="option in effectiveOptions(column.index)"
                        :key="`opt-${column.index}-${option.heightMm}`"
                        :value="option.heightMm"
                      >
                          {{ formatCm(option.heightMm) }}{{ option.kind === 'bridge' ? t('cad.designStep.bridgeSuffix') : '' }}
                      </option>
                    </select>
                  </label>

                  <p class="mini muted" v-if="effectiveOptions(column.index).length === 0">
                    {{ t('cad.designStep.noOptionsAvailable') }}
                  </p>

                  <div class="actions-row">
                    <button
                      class="btn btn--primary btn--small"
                      :aria-label="t('cad.designStep.addLevelAriaLabel', { n: column.index + 1 })"
                      :disabled="!canEditDesign || designLoading || !selectedGapByColumn[column.index]"
                      @click="addShelf(column.index)"
                    >
                      {{ t('cad.designStep.addLevel') }}
                    </button>
                    <button
                      class="btn btn--light btn--small"
                      :aria-label="t('cad.designStep.removeLastAriaLabel', { n: column.index + 1 })"
                      :disabled="!canEditDesign || designLoading || column.levels.length === 0"
                      @click="removeShelf(column.index)"
                    >
                      {{ t('cad.designStep.removeLast') }}
                    </button>
                  </div>
                </article>
              </div>
            </article>

            <article class="control-card" v-if="spines.length > 0">
              <h3>{{ t('cad.terminalStep.title') }}</h3>
              <p class="mini muted">{{ t('cad.terminalStep.hint') }}</p>
              <p class="mini muted" v-if="availableTerminalHeights.length === 0">
                {{ t('cad.terminalStep.noHeightsAvailable') }}
              </p>
              <div class="column-widths" v-else>
                <label v-for="spine in spines" :key="`spine-${spine.spineIndex}`" class="field">
                  <span class="field__label">
                    {{
                      spine.leftColumnNumber && spine.rightColumnNumber
                        ? t('cad.terminalStep.innerLabel', { left: spine.leftColumnNumber, right: spine.rightColumnNumber })
                        : t('cad.terminalStep.outerLabel', { n: spine.leftColumnNumber ?? spine.rightColumnNumber })
                    }}
                  </span>
                  <select
                    class="field__input"
                    :aria-label="t('cad.terminalStep.selectAriaLabel', { spine: spine.spineIndex })"
                    :disabled="!canEditDesign || designLoading"
                    :value="terminalHeightBySpine[spine.spineIndex] ?? undefined"
                    @change="saveTerminalSelection(spine.spineIndex, Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option v-for="height in availableTerminalHeights" :key="`term-${spine.spineIndex}-${height}`" :value="height">
                      {{ formatCm(height) }}
                    </option>
                  </select>
                </label>
              </div>
            </article>

            <article class="control-card finalize-card">
              <h3>{{ t('cad.finalizeStep.title') }}</h3>
              <button class="btn btn--primary" :disabled="!canFinalize || finalizeLoading" @click="finalizeSelected">
                {{ finalizeLoading ? t('cad.finalizeStep.finalizing') : t('cad.finalizeStep.finalizeButton') }}
              </button>
              <p v-if="!canFinalize" class="hint">{{ t('cad.finalizeStep.hint') }}</p>
            </article>
          </section>
        </template>
      </main>

      <aside class="schema-panel" v-if="selected">
        <section class="canvas-section">
          <header class="canvas-section__header">
            <div>
              <h3>{{ t('cad.schema.title') }}</h3>
              <p class="mini muted">{{ t('cad.schema.subtitle') }}</p>
            </div>
            <div class="assembly-zoom-controls">
              <button
                type="button"
                class="btn btn--light btn--small"
                :aria-label="t('cad.schema.zoomOut')"
                @click="zoomOut"
              >&minus;</button>
              <button
                type="button"
                class="btn btn--light btn--small assembly-zoom-percent"
                :aria-label="t('cad.schema.zoomReset')"
                @click="zoomReset"
              >{{ assemblyZoomPercent }}%</button>
              <button
                type="button"
                class="btn btn--light btn--small"
                :aria-label="t('cad.schema.zoomIn')"
                @click="zoomIn"
              >+</button>
              <button
                type="button"
                class="btn btn--light btn--small"
                @click="zoomFit"
              >{{ t('cad.schema.zoomFit') }}</button>
            </div>
          </header>

          <div class="canvas-scroll" ref="canvasScrollRef">
            <div class="assembly-frame" :style="{ width: `${assemblyFrameWidthPx}px` }">
              <svg
                class="assembly-svg"
                :viewBox="`0 0 ${assembly.totalWidthMm} ${assembly.totalHeightMm}`"
                preserveAspectRatio="xMinYMax meet"
                role="img"
                :aria-label="t('cad.schema.title')"
              >
                <rect
                  v-for="(piece, idx) in assembly.pieces"
                  :key="`piece-${idx}`"
                  :class="`assembly-piece assembly-piece--${piece.kind}`"
                  :x="piece.xMm"
                  :y="assembly.totalHeightMm - piece.topMm"
                  :width="piece.widthMm"
                  :height="piece.topMm - piece.bottomMm"
                />
                <text
                  v-for="piece in assembly.pieces.filter((p) => p.kind === 'shelf')"
                  :key="`label-${piece.xMm}-${piece.bottomMm}`"
                  class="assembly-label"
                  :x="piece.xMm + piece.widthMm / 2"
                  :y="assembly.totalHeightMm - piece.topMm - 4"
                  text-anchor="middle"
                >{{ formatCm(piece.bottomMm) }}</text>
              </svg>

              <div class="assembly-column-labels">
                <span
                  v-for="label in assembly.columnLabels"
                  :key="`col-label-${label.index}`"
                  class="assembly-column-label"
                  :style="{ left: `${(label.centerXMm / assembly.totalWidthMm) * 100}%` }"
                >
                  {{ t('cad.designStep.columnLabel', { n: label.index + 1 }) }} - {{ formatCm(label.shelfWidthMm) }}
                </span>
              </div>
            </div>
          </div>
        </section>
      </aside>
    </div>

    <div v-if="showBomModal" class="modal-overlay" @click.self="showBomModal = false">
      <article class="modal-card">
        <header class="modal-header">
          <h3>{{ t('cad.bom.title') }}</h3>
          <button class="btn btn--light btn--small" @click="showBomModal = false">{{ t('cad.collab.modal.close') }}</button>
        </header>
        <p class="muted">{{ t('cad.bom.subtitle') }}</p>
        <div class="bom-list" v-if="(selected?.bom?.length ?? 0) > 0">
          <article class="bom-row" v-for="item in selected?.bom" :key="`${item.sku}-${item.componentType || 'GEN'}`">
            <div>
              <strong>{{ item.name }}</strong>
              <p class="mini">{{ t('cad.bom.skuLine', { sku: item.sku, type: item.componentType ? typeLabel(item.componentType) : t('cad.bom.componentFallback') }) }}</p>
            </div>
            <div class="bom-row__right">
              <span>x{{ item.quantity }}</span>
              <strong>
                {{ formatPrice((item.unitPrice ?? ((item.unitPriceCents || 0) / 100)) * item.quantity) }}
              </strong>
            </div>
          </article>
        </div>
        <p v-else class="placeholder">{{ t('cad.bom.empty') }}</p>
        <footer class="total-box">
          <span>{{ t('cad.bom.totalPreview') }}</span>
          <strong>{{ formatPrice(totalPrice) }}</strong>
        </footer>
      </article>
    </div>

    <div v-if="showCollabModal" class="modal-overlay" @click.self="showCollabModal = false">
      <article class="modal-card modal-card--narrow">
        <header class="modal-header">
          <h3>{{ t('cad.collab.modal.title') }}</h3>
          <button class="btn btn--light btn--small" @click="showCollabModal = false">{{ t('cad.collab.modal.close') }}</button>
        </header>
        <p>{{ t('cad.collab.modal.shareInstruction') }}</p>
        <p class="collab-code-display">{{ collabSessionCode }}</p>
        <p class="mini muted">{{ t('cad.collab.modal.note') }}</p>
        <div class="actions-row">
          <button class="btn btn--primary" @click="copySessionCode">{{ t('cad.collab.modal.copyCode') }}</button>
        </div>
      </article>
    </div>

    <div v-if="showResetConfirm" class="modal-overlay" @click.self="cancelReset">
      <article class="modal-card modal-card--narrow">
        <h3>{{ t('cad.resetConfirm.title') }}</h3>
        <p>
          {{ t('cad.resetConfirm.message') }}
        </p>
        <div class="actions-row">
          <button class="btn btn--light" @click="cancelReset">{{ t('cad.resetConfirm.cancel') }}</button>
          <button class="btn btn--primary" @click="confirmResetStepOne">{{ t('cad.resetConfirm.continue') }}</button>
        </div>
      </article>
    </div>

    <div v-if="showResetFinalConfirm" class="modal-overlay" @click.self="cancelReset">
      <article class="modal-card modal-card--narrow">
        <h3>{{ t('cad.resetFinalConfirm.title') }}</h3>
        <p>{{ t('cad.resetFinalConfirm.message') }}</p>
        <div class="actions-row">
          <button class="btn btn--light" @click="cancelReset">{{ t('cad.resetFinalConfirm.cancel') }}</button>
          <button class="btn btn--primary" @click="confirmResetStepTwo">{{ t('cad.resetFinalConfirm.confirm') }}</button>
        </div>
      </article>
    </div>

    <div v-if="showResetConfigConfirm" class="modal-overlay" @click.self="cancelConfigReset">
      <article class="modal-card modal-card--narrow">
        <h3>{{ t('cad.resetConfig.confirmTitle') }}</h3>
        <p>{{ t('cad.resetConfig.confirmMessage') }}</p>
        <div class="actions-row">
          <button class="btn btn--light" @click="cancelConfigReset">{{ t('cad.resetConfig.cancel') }}</button>
          <button class="btn btn--primary" @click="confirmConfigReset">{{ t('cad.resetConfig.confirm') }}</button>
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

.bom-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.bom-trigger-icon {
  font-size: var(--font-size-lg);
}

.bom-trigger-total {
  font-weight: var(--font-weight-semibold);
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
  grid-template-columns: minmax(360px, 1fr) minmax(420px, 1.3fr);
  gap: var(--space-4);
  align-items: stretch;
}

.schema-panel,
.center-panel {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.center-panel,
.schema-panel {
  max-height: calc(100vh - 130px);
  overflow: auto;
}

.stepper {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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
  gap: var(--space-2);
  flex-wrap: wrap;
}

.assembly-zoom-controls {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.assembly-zoom-percent {
  min-width: 52px;
}

.canvas-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: var(--space-1);
}

.assembly-frame {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-3);
}

.assembly-svg {
  display: block;
  width: 100%;
  height: auto;
  max-height: 55vh;
}

.assembly-piece {
  stroke: var(--color-border);
  stroke-width: 1;
}

.assembly-piece--foot,
.assembly-piece--upright {
  fill: var(--color-admin-accent);
}

.assembly-piece--terminal {
  fill: var(--color-text-secondary);
}

.assembly-piece--shelf {
  fill: var(--color-accent-subtle);
  stroke: var(--color-text-secondary);
}

.assembly-label {
  font-size: 9px;
  fill: var(--color-text-muted);
}

.assembly-column-labels {
  position: relative;
  height: 1.6em;
  margin-top: var(--space-2);
}

.assembly-column-label {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
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

.level-list {
  display: grid;
  gap: 2px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.level-list li {
  display: flex;
  align-items: center;
  gap: var(--space-1);
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
    grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
    align-items: start;
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
  .schema-panel {
    max-height: none;
    overflow: visible;
  }

  .center-panel {
    order: 1;
  }

  .schema-panel {
    order: 2;
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
