/** Loads catalog data and bridges catalog actions with cart updates. */
import { ref } from 'vue';
import { catalogService } from '@/services/catalogService';
import { cartService } from '@/services/cartService';
import { useNotificationStore } from '@/store/notificationStore';
import { useCartStore } from '@/store/cartStore';
import type { CatalogItem } from '@/types/catalog';
import { ApiError } from '@/types/api';

export function useCatalog() {
  const items = ref<CatalogItem[]>([]);
  const loading = ref(false);
  const error = ref('');

  const search = ref('');
  const cart = useCartStore();
  const availableOnly = ref(false);

  const notifications = useNotificationStore();

  /** Fetches catalog items applying current search and availability filters. All categories load together for the grouped view. */
  async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const response = await catalogService.list({
        search: search.value || undefined,
        available: availableOnly.value ? true : undefined,
        limit: 100,
        page: 1,
      });
      items.value = response.items;
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'Errore caricamento catalogo';
    } finally {
      loading.value = false;
    }
  }

  /** Adds one unit of a catalog item to cart and updates the header badge count. */
  async function addToCart(item: CatalogItem): Promise<void> {
    try {
      const updatedCart = await cartService.addItem(item.sku, {
        name: item.name,
        unitPrice: item.price,
        quantity: 1,
      });
      cart.setFromCart(updatedCart);
      notifications.addToast('success', `Aggiunto al carrello: ${item.name}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Errore aggiunta al carrello';
      notifications.addToast('error', msg);
    }
  }

  return {
    items,
    loading,
    error,
    search,
    availableOnly,
    load,
    addToCart,
  };
}
