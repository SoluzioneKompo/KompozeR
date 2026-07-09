/** Coordinates cart operations and local UI state for cart interactions. */
import { ref } from 'vue';
import { cartService } from '@/services/cartService';
import { useNotificationStore } from '@/store/notificationStore';
import { useCartStore } from '@/store/cartStore';
import type { Cart, CartItem, ExpeditionInfo } from '@/types/cart';
import { ApiError } from '@/types/api';

export function useCart() {
  const cart = ref<Cart | null>(null);
  const loading = ref(false);
  const checkoutLoading = ref(false);
  const clearLoading = ref(false);
  const error = ref('');

  const notifications = useNotificationStore();
  const cartStore = useCartStore();

  /** Fetches current cart from the API and syncs local store badge count. */
  async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      cart.value = await cartService.get();
      cartStore.setFromCart(cart.value);
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'Errore caricamento carrello';
    } finally {
      loading.value = false;
    }
  }

  /** Sets item quantity, removing the line when quantity reaches zero. */
  async function setQuantity(item: CartItem, quantity: number): Promise<void> {
    const safeQuantity = Math.max(0, quantity);
    try {
      if (safeQuantity === 0) {
        cart.value = await cartService.removeItem(item.sku);
      } else {
        cart.value = await cartService.addItem(item.sku, {
          name: item.name,
          unitPrice: item.unitPrice,
          quantity: safeQuantity,
        });
      }
      cartStore.setFromCart(cart.value);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Errore aggiornamento quantità';
      notifications.addToast('error', msg);
    }
  }

  /** Submits cart as order, clears badge, and reloads cart state. */
  async function checkout(expeditionInfo: ExpeditionInfo): Promise<void> {
    checkoutLoading.value = true;
    try {
      const result = await cartService.checkout(expeditionInfo);
      cartStore.clearCount();
      notifications.addToast('success', `Ordine ${result.orderId} creato con successo`);
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Errore durante checkout';
      notifications.addToast('error', msg);
      throw e;
    } finally {
      checkoutLoading.value = false;
    }
  }

  /** Empties the cart entirely and resets the header badge to zero. */
  async function clearCart(): Promise<void> {
    clearLoading.value = true;
    try {
      await cartService.clear();
      cartStore.clearCount();
      notifications.addToast('success', 'Carrello svuotato');
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Errore durante svuotamento carrello';
      notifications.addToast('error', msg);
    } finally {
      clearLoading.value = false;
    }
  }

  return {
    cart,
    loading,
    checkoutLoading,
    clearLoading,
    error,
    load,
    setQuantity,
    clearCart,
    checkout,
  };
}
