/** Defines frontend route map and role-based navigation guards. */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/store/authStore';

const baseAllowedRoutes = new Set(['cad', 'cart', 'configurations', 'notifications']);
const guestAllowedRoutes = new Set(['cad', 'cart', 'configurations', 'notifications']);

function getAuthenticatedFallbackRoute(auth: ReturnType<typeof useAuthStore>): { name: string } {
  return { name: auth.homeRouteName };
}

function canAccessRoute(auth: ReturnType<typeof useAuthStore>, routeName: string | null): boolean {
  if (!routeName) {
    return true;
  }

  if (auth.isAdmin) {
    return true;
  }

  if (auth.isGuest) {
    return guestAllowedRoutes.has(routeName);
  }

  if (auth.isBaseUser) {
    return baseAllowedRoutes.has(routeName);
  }

  return true;
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'auth',
    component: () => import('@/views/AuthView.vue'),
    meta: { public: true },
  },
  {
    path: '/catalog',
    name: 'catalog',
    component: () => import('@/views/CatalogView.vue'),
    meta: { requiresToken: true },
  },
  {
    path: '/cart',
    name: 'cart',
    component: () => import('@/views/CartView.vue'),
    meta: { requiresToken: true },
  },
  {
    path: '/cad',
    name: 'cad',
    component: () => import('@/views/CadView.vue'),
    meta: { requiresToken: true },
  },
  {
    path: '/configurations',
    name: 'configurations',
    component: () => import('@/views/ConfigurationsView.vue'),
    meta: { requiresToken: true },
  },
  {
    path: '/notifications',
    name: 'notifications',
    component: () => import('@/views/NotificationsView.vue'),
    meta: { requiresToken: true },
  },
  {
    path: '/admin/orders',
    name: 'admin-orders',
    component: () => import('@/views/admin/AdminOrdersView.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/reports',
    name: 'admin-reports',
    component: () => import('@/views/admin/AdminReportsView.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/catalog',
    name: 'admin-catalog',
    component: () => import('@/views/admin/AdminCatalogView.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const routeName = typeof to.name === 'string' ? to.name : null;

  if (auth.isLoggedIn && !auth.isGuest && !auth.user) {
    await auth.hydrateCurrentUser();
  }

  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return auth.isLoggedIn ? getAuthenticatedFallbackRoute(auth) : { name: 'auth' };
  }

  if (to.meta.requiresAuth && (!auth.isLoggedIn || auth.isGuest)) {
    return auth.isLoggedIn ? getAuthenticatedFallbackRoute(auth) : { name: 'auth' };
  }

  if (to.meta.requiresToken && !auth.isLoggedIn) {
    return { name: 'auth' };
  }

  if (auth.isLoggedIn && !to.meta.public && !canAccessRoute(auth, routeName)) {
    return getAuthenticatedFallbackRoute(auth);
  }

  if (to.meta.public && auth.isLoggedIn) {
    return getAuthenticatedFallbackRoute(auth);
  }
});

export default router;
