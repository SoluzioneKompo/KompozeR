/** Central authentication store for session state and user identity. */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AuthUser } from '@/types/auth';
import { authService } from '@/services/authService';

const TOKEN_KEY = 'kompozer_token';
const USER_KEY = 'kompozer_user';
const GUEST_KEY = 'kompozer_guest';

/** Reads and deserializes the persisted user from localStorage, clearing stale data on failure. */
function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const user = ref<AuthUser | null>(readStoredUser());
  const isGuest = ref<boolean>(localStorage.getItem(GUEST_KEY) === 'true');

  const isLoggedIn = computed(() => !!token.value);
  const isAdmin = computed(() => user.value?.role === 'ADMIN');
  const isBaseUser = computed(() => isLoggedIn.value && !isGuest.value && !isAdmin.value);
  const homeRouteName = computed(() => (isAdmin.value ? 'admin-orders' : 'cad'));

  /** Stores the JWT in memory and localStorage. */
  function persistToken(t: string): void {
    token.value = t;
    localStorage.setItem(TOKEN_KEY, t);
  }

  /** Stores or clears the authenticated user in memory and localStorage. */
  function persistUser(nextUser: AuthUser | null): void {
    user.value = nextUser;
    if (nextUser) {
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      return;
    }
    localStorage.removeItem(USER_KEY);
  }

  /** Tracks guest flag in memory and localStorage. */
  function persistGuest(nextValue: boolean): void {
    isGuest.value = nextValue;
    if (nextValue) {
      localStorage.setItem(GUEST_KEY, 'true');
      return;
    }
    localStorage.removeItem(GUEST_KEY);
  }

  /** Wipes all session data from memory and localStorage. */
  function clearSession(): void {
    token.value = null;
    persistUser(null);
    persistGuest(false);
    localStorage.removeItem(TOKEN_KEY);
  }

  /** Fetches the current user from the API when a token exists but user data is missing. */
  async function hydrateCurrentUser(): Promise<void> {
    if (!token.value || isGuest.value || user.value) {
      return;
    }

    try {
      const currentUser = await authService.me();
      persistUser(currentUser);
    } catch {
      clearSession();
    }
  }

  /** Authenticates with credentials, persisting token and user on success. */
  async function login(identifier: string, password: string): Promise<void> {
    const normalizedIdentifier = identifier.trim();
    const res = await authService.login({
      identifier: normalizedIdentifier,
      username: normalizedIdentifier,
      password,
    });
    persistToken(res.token);
    persistUser(res.user);
    persistGuest(false);
  }

  /** Registers a new user and immediately persists the resulting session. */
  async function register(
    username: string,
    name: string,
    surname: string,
    email: string,
    password: string,
  ): Promise<void> {
    const res = await authService.register({ username, name, surname, email, password });
    persistToken(res.token);
    persistUser(res.user);
    persistGuest(false);
  }

  /** Creates an anonymous guest session and persists the token without user data. */
  async function loginAsGuest(): Promise<void> {
    const res = await authService.guest();
    persistToken(res.token);
    persistUser(null);
    persistGuest(true);
  }

  /** Clears all session data and triggers logout across the application. */
  function logout(): void {
    clearSession();
  }

  return {
    token,
    user,
    isGuest,
    isLoggedIn,
    isAdmin,
    isBaseUser,
    homeRouteName,
    hydrateCurrentUser,
    login,
    register,
    loginAsGuest,
    logout,
  };
});
