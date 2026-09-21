<script setup lang="ts">
/** Authentication view for login, registration flow, and guest access. */
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/types/api';
import appLogo from '@/assets/images/kompozer-logo.png';

const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();

type Mode = 'login' | 'register';
const mode = ref<Mode>('login');
const error = ref('');
const loading = ref(false);
const showRegistrationSuccess = ref(false);

const login = reactive({ identifier: '', password: '' });
const register = reactive({ username: '', name: '', surname: '', email: '', password: '' });

/** Maps login API failures to user-facing localized messages. */
function mapLoginError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return t('auth.errors.login');
  }

  if (err.code === 'RESOURCE_NOT_FOUND') {
    return t('auth.errors.userNotFound');
  }

  if (err.code === 'INVALID_PASSWORD') {
    return t('auth.errors.wrongPassword');
  }

  return t('auth.errors.invalidCredentials');
}

/** Maps registration failures and surfaces password validation details when available. */
function mapRegisterError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return t('auth.errors.register');
  }

  if (err.code === 'VALIDATION_ERROR') {
    const passwordReasons = Array.isArray(err.details)
      ? err.details
          .filter((detail): detail is { field?: unknown; reason?: unknown } => typeof detail === 'object' && detail !== null)
          .filter((detail) => detail.field === 'password' && typeof detail.reason === 'string')
          .map((detail) => detail.reason)
      : [];

    if (passwordReasons.length > 0) {
      return t('auth.errors.passwordTooShort', { min: 8, detail: passwordReasons.join(' ') });
    }
  }

  return err.message;
}

/** Submits login credentials and redirects to the role-specific home route. */
async function handleLogin(): Promise<void> {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(login.identifier, login.password);
    await router.push({ name: auth.homeRouteName });
  } catch (e) {
    error.value = mapLoginError(e);
  } finally {
    loading.value = false;
  }
}

/** Registers a new user and returns the flow to login mode with success feedback. */
async function handleRegister(): Promise<void> {
  error.value = '';
  loading.value = true;
  try {
    await auth.register(
      register.username,
      register.name,
      register.surname,
      register.email,
      register.password,
    );
    auth.logout();
    login.identifier = register.username;
    login.password = '';
    register.password = '';
    mode.value = 'login';
    showRegistrationSuccess.value = true;
  } catch (e) {
    error.value = mapRegisterError(e);
  } finally {
    loading.value = false;
  }
}

/** Closes registration success modal and restores login state. */
function handleRegistrationSuccessAcknowledge(): void {
  showRegistrationSuccess.value = false;
  error.value = '';
  mode.value = 'login';
}

/** Starts a guest session and navigates to the default guest landing page. */
async function handleGuest(): Promise<void> {
  error.value = '';
  loading.value = true;
  try {
    await auth.loginAsGuest();
    await router.push({ name: auth.homeRouteName });
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : t('auth.errors.guest');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-view">
    <div class="auth-card">
      <img :src="appLogo" alt="KompozeR" class="auth-logo" />
      <p class="auth-subtitle">{{ t('auth.subtitle') }}</p>

      <div class="auth-tabs">
        <button :class="['auth-tab', { 'auth-tab--active': mode === 'login' }]" @click="mode = 'login'">{{ t('auth.tabs.login') }}</button>
        <button :class="['auth-tab', { 'auth-tab--active': mode === 'register' }]" @click="mode = 'register'">{{ t('auth.tabs.register') }}</button>
      </div>

      <form v-if="mode === 'login'" class="auth-form" @submit.prevent="handleLogin">
        <label class="field">
          <span class="field__label">{{ t('auth.fields.usernameOrEmail') }}</span>
          <input
            v-model="login.identifier"
            class="field__input"
            type="text"
            required
            autocomplete="username"
          />
        </label>
        <label class="field">
          <span class="field__label">{{ t('auth.fields.password') }}</span>
          <input v-model="login.password" class="field__input" type="password" required autocomplete="current-password" />
        </label>
        <p v-if="error" class="auth-error" role="alert" aria-live="assertive">{{ error }}</p>
        <button class="btn btn--primary" type="submit" :disabled="loading">
          {{ loading ? t('auth.actions.loggingIn') : t('auth.actions.login') }}
        </button>
      </form>

      <form v-else class="auth-form" @submit.prevent="handleRegister">
        <label class="field">
          <span class="field__label">{{ t('auth.fields.username') }}</span>
          <input v-model="register.username" class="field__input" type="text" required autocomplete="username" />
        </label>
        <label class="field">
          <span class="field__label">{{ t('auth.fields.name') }}</span>
          <input v-model="register.name" class="field__input" type="text" required autocomplete="given-name" />
        </label>
        <label class="field">
          <span class="field__label">{{ t('auth.fields.surname') }}</span>
          <input v-model="register.surname" class="field__input" type="text" required autocomplete="family-name" />
        </label>
        <label class="field">
          <span class="field__label">{{ t('auth.fields.email') }}</span>
          <input v-model="register.email" class="field__input" type="email" required autocomplete="email" />
        </label>
        <label class="field">
          <span class="field__label">{{ t('auth.fields.password') }}</span>
          <input v-model="register.password" class="field__input" type="password" required autocomplete="new-password" />
        </label>
        <p v-if="error" class="auth-error" role="alert" aria-live="assertive">{{ error }}</p>
        <button class="btn btn--primary" type="submit" :disabled="loading">
          {{ loading ? t('auth.actions.registering') : t('auth.actions.register') }}
        </button>
      </form>

      <div class="auth-divider">{{ t('auth.divider') }}</div>

      <button class="btn btn--secondary" :disabled="loading" @click="handleGuest">
        {{ t('auth.actions.guest') }}
      </button>
    </div>

    <div v-if="showRegistrationSuccess" class="auth-modal-backdrop" role="presentation">
      <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="registration-success-title">
        <h2 id="registration-success-title" class="auth-modal__title">{{ t('auth.registrationSuccess.title') }}</h2>
        <button class="btn btn--primary" type="button" @click="handleRegistrationSuccessAcknowledge">
          {{ t('auth.registrationSuccess.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-view {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: var(--color-background);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-10) var(--space-8);
  box-shadow: var(--shadow-md);
}

.auth-logo {
  display: block;
  width: min(220px, 70%);
  margin: 0 auto var(--space-3);
}

.auth-subtitle {
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-8);
}

.auth-tabs {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}

.auth-tab {
  flex: 1;
  padding: var(--space-2);
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.auth-tab--active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.field { display: flex; flex-direction: column; gap: var(--space-1); }
.field__label { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); }
.field__input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  background: var(--color-background);
  transition: border-color var(--transition-fast);
}
.field__input:focus { border-color: var(--color-accent); outline: none; }

.auth-error {
  font-size: var(--font-size-sm);
  color: var(--color-error);
}

.auth-divider {
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  margin: var(--space-4) 0;
}

.btn {
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn--primary { background: var(--color-accent); color: #fff; }
.btn--primary:hover:not(:disabled) { background: var(--color-accent-hover); }
.btn--secondary { background: var(--color-surface-raised); color: var(--color-text-primary); border: 1px solid var(--color-border); }
.btn--secondary:hover:not(:disabled) { background: var(--color-border-subtle); }

.auth-modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: rgb(15 23 42 / 0.45);
}

.auth-modal {
  width: min(360px, 100%);
  padding: var(--space-8);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
}

.auth-modal__title {
  margin: 0 0 var(--space-6);
  text-align: center;
  font-size: var(--font-size-xl);
  color: var(--color-text-primary);
}
</style>
