/** Exposes reactive CAD workflow state and actions for configurator views. */
import { computed, ref } from 'vue';
import { cadService, type ConfigurationStatus as ServiceConfigurationStatus } from '@/services/cadService';
import { useNotificationStore } from '@/store/notificationStore';
import type {
  Category,
  ColumnDesign,
  ColumnPlan,
  ConfigurationDto,
  Environment,
  NextOptionsDto,
} from '@/types/cad';
import { ApiError } from '@/types/api';
import { i18n } from '@/i18n';

const t = i18n.global.t;

const SHELF_THICKNESS_MM = 20;

export function useCad() {
  const notifications = useNotificationStore();

  const items = ref<ConfigurationDto[]>([]);
  const selected = ref<ConfigurationDto | null>(null);

  const loading = ref(false);
  const detailLoading = ref(false);
  const createLoading = ref(false);
  const finalizeLoading = ref(false);
  const categoryLoading = ref(false);
  const environmentLoading = ref(false);
  const columnPlanLoading = ref(false);
  const designLoading = ref(false);
  const nextOptionsLoading = ref(false);

  const error = ref('');

  const page = ref(1);
  const limit = ref(20);
  const total = ref(0);
  const totalPages = ref(1);
  const statusFilter = ref<ServiceConfigurationStatus | ''>('');
  const nextOptionsByColumn = ref<Record<number, NextOptionsDto['options']>>({});

  const createName = ref(t('cad.create.namePlaceholder'));

  const canPrev = computed(() => page.value > 1);
  const canNext = computed(() => page.value < totalPages.value);

  /** Loads paginated configuration list applying current status filter. */
  async function loadList(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const result = await cadService.list({
        status: statusFilter.value || undefined,
        page: page.value,
        limit: limit.value,
      });
      items.value = result.items;
      total.value = result.total;
      totalPages.value = result.totalPages;

      if (selected.value) {
        const current = result.items.find((c) => c.id === selected.value?.id);
        if (current) {
          selected.value = current;
        }
      }
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : t('cad.toasts.loadListError');
    } finally {
      loading.value = false;
    }
  }

  /** Loads a single configuration by id into the selected slot. */
  async function loadDetail(id: string): Promise<void> {
    detailLoading.value = true;
    try {
      selected.value = await cadService.get(id);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('cad.toasts.loadDetailError');
      notifications.addToast('error', msg);
    } finally {
      detailLoading.value = false;
    }
  }

  /** Creates a new draft configuration from the current name input and selects it. */
  async function createConfiguration(): Promise<void> {
    createLoading.value = true;
    try {
      const created = await cadService.create({
        name: createName.value.trim() || undefined,
      });
      notifications.addToast('success', t('cad.toasts.configurationCreated', { name: created.name }));
      selected.value = created;
      await loadList();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('cad.toasts.createError');
      notifications.addToast('error', msg);
    } finally {
      createLoading.value = false;
    }
  }

  /** Sets category on the selected configuration and refreshes list state. */
  async function updateCategory(category: Category): Promise<void> {
    if (!selected.value) {
      return;
    }
    categoryLoading.value = true;
    try {
      selected.value = await cadService.setCategory(selected.value.id, category);
      notifications.addToast('success', t('cad.toasts.categoryUpdated'));
      await loadList();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('cad.toasts.categoryUpdateError');
      notifications.addToast('error', msg);
    } finally {
      categoryLoading.value = false;
    }
  }

  /** Saves environment dimensions on the selected configuration. */
  async function updateEnvironment(environment: Environment): Promise<void> {
    if (!selected.value) {
      return;
    }
    environmentLoading.value = true;
    try {
      selected.value = await cadService.setEnvironment(selected.value.id, environment);
      notifications.addToast('success', t('cad.toasts.environmentUpdated'));
      await loadList();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('cad.toasts.environmentUpdateError');
      notifications.addToast('error', msg);
    } finally {
      environmentLoading.value = false;
    }
  }

  /** Persists column layout plan on the selected configuration. */
  async function updateColumnPlan(columnPlan: ColumnPlan): Promise<void> {
    if (!selected.value) {
      return;
    }
    columnPlanLoading.value = true;
    try {
      selected.value = await cadService.setColumnPlan(selected.value.id, columnPlan);
      notifications.addToast('success', t('cad.toasts.columnPlanUpdated'));
      await loadList();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('cad.toasts.columnPlanUpdateError');
      notifications.addToast('error', msg);
    } finally {
      columnPlanLoading.value = false;
    }
  }

  /** Saves full column design array (shelf levels) on the selected configuration. */
  async function updateDesign(columnDesigns: ColumnDesign[]): Promise<void> {
    if (!selected.value) {
      return;
    }
    designLoading.value = true;
    try {
      selected.value = await cadService.updateDesign(selected.value.id, columnDesigns);
      notifications.addToast('success', t('cad.toasts.designUpdated'));
      await loadList();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('cad.toasts.designUpdateError');
      notifications.addToast('error', msg);
    } finally {
      designLoading.value = false;
    }
  }

  /** Retrieves allowed/blocked next-shelf options for a column from the backend. */
  async function fetchNextOptions(columnIndex: number): Promise<NextOptionsDto['options']> {
    if (!selected.value) {
      return [];
    }

    nextOptionsLoading.value = true;
    try {
      const result = await cadService.nextOptions(selected.value.id, columnIndex);
      nextOptionsByColumn.value = {
        ...nextOptionsByColumn.value,
        [columnIndex]: result.options,
      };
      return result.options;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) {
        const msg = e instanceof ApiError ? e.message : t('cad.toasts.nextOptionsError');
        notifications.addToast('error', msg);
      }
      return [];
    } finally {
      nextOptionsLoading.value = false;
    }
  }

  /** Writes preloaded options into the reactive map without an API call. */
  function setNextOptions(columnIndex: number, options: NextOptionsDto['options']): void {
    nextOptionsByColumn.value = {
      ...nextOptionsByColumn.value,
      [columnIndex]: options,
    };
  }

  /** Builds a mutable design draft from the selected configuration's current state. */
  function createDesignDraft(defaultShelfThicknessMm = SHELF_THICKNESS_MM): ColumnDesign[] {
    if (!selected.value?.columnPlan) {
      return [];
    }

    const existingByColumn = new Map(
      selected.value.columnDesigns.map((design) => [design.columnIndex, design] as const),
    );

    return selected.value.columnPlan.columns
      .slice()
      .sort((a, b) => a.index - b.index)
      .map(({ index }) => {
        const existing = existingByColumn.get(index);
        return {
          columnIndex: index,
          levelsMm: existing ? [...existing.levelsMm].sort((a, b) => a - b) : [],
          shelfThicknessMm: defaultShelfThicknessMm,
        };
      });
  }

  /** Appends a shelf at the next valid level for the specified column, then persists the design. */
  async function addTopShelf(
    columnIndex: number,
    gapHeightMm: number,
    shelfThicknessMm = SHELF_THICKNESS_MM,
  ): Promise<void> {
    if (!selected.value) {
      return;
    }

    const draft = createDesignDraft(shelfThicknessMm);
    const target = draft.find((design) => design.columnIndex === columnIndex);
    if (!target) {
      notifications.addToast('error', t('cad.toasts.columnNotFound', { n: columnIndex + 1 }));
      return;
    }

    const lastLevel = target.levelsMm.length > 0 ? target.levelsMm[target.levelsMm.length - 1] : 0;
    const nextLevel = target.levelsMm.length === 0
      ? gapHeightMm
      : lastLevel + shelfThicknessMm + gapHeightMm;
    target.levelsMm = [...target.levelsMm, nextLevel].sort((a, b) => a - b);

    await updateDesign(draft);
  }

  /** Removes the highest shelf from the specified column and persists the updated design. */
  async function removeTopShelf(
    columnIndex: number,
    shelfThicknessMm = SHELF_THICKNESS_MM,
  ): Promise<void> {
    if (!selected.value) {
      return;
    }

    const draft = createDesignDraft(shelfThicknessMm);
    const target = draft.find((design) => design.columnIndex === columnIndex);
    if (!target || target.levelsMm.length === 0) {
      return;
    }

    target.levelsMm = target.levelsMm.slice(0, -1);
    await updateDesign(draft);
  }

  /** Finalizes the selected configuration and adds its BOM to the cart. */
  async function finalizeSelected(): Promise<void> {
    if (!selected.value) {
      return;
    }
    finalizeLoading.value = true;
    try {
      selected.value = await cadService.finalize(selected.value.id);
      notifications.addToast('success', t('cad.toasts.finalizeSuccess'));
      await loadList();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('cad.toasts.finalizeError');
      notifications.addToast('error', msg);
    } finally {
      finalizeLoading.value = false;
    }
  }

  /** Applies a lifecycle status filter and reloads from page 1. */
  async function setStatusFilter(value: ServiceConfigurationStatus | ''): Promise<void> {
    statusFilter.value = value;
    page.value = 1;
    await loadList();
  }

  /** Advances to the next configuration list page when available. */
  async function nextPage(): Promise<void> {
    if (!canNext.value) {
      return;
    }
    page.value += 1;
    await loadList();
  }

  /** Returns to the previous configuration list page when available. */
  async function prevPage(): Promise<void> {
    if (!canPrev.value) {
      return;
    }
    page.value -= 1;
    await loadList();
  }

  return {
    items,
    selected,
    loading,
    detailLoading,
    createLoading,
    finalizeLoading,
    categoryLoading,
    environmentLoading,
    columnPlanLoading,
    designLoading,
    nextOptionsLoading,
    error,
    page,
    total,
    totalPages,
    statusFilter,
    createName,
    nextOptionsByColumn,
    canPrev,
    canNext,
    loadList,
    loadDetail,
    createConfiguration,
    updateCategory,
    updateEnvironment,
    updateColumnPlan,
    updateDesign,
    fetchNextOptions,
    setNextOptions,
    addTopShelf,
    removeTopShelf,
    finalizeSelected,
    setStatusFilter,
    nextPage,
    prevPage,
  };
}
