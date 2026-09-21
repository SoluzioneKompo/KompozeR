<script setup lang="ts">
/** Standalone payment page reached via a direct /payment/:orderId link (e.g. bookmark/refresh). */
import { useRoute, useRouter } from 'vue-router';
import PaymentPanel from '@/components/PaymentPanel.vue';

const route = useRoute();
const router = useRouter();
const orderId = route.params.orderId as string;

function goToCatalog(): void {
  void router.push({ name: 'catalog' });
}
</script>

<template>
  <div class="view-container">
    <PaymentPanel :order-id="orderId" @done="goToCatalog" />
  </div>
</template>

<style scoped>
.view-container {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
}
</style>
