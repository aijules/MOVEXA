<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminAuthStore } from '../../stores/adminAuth.store.js';

const router = useRouter();
const auth = useAdminAuthStore();
const username = ref('admin');
const password = ref('admin');

const roles = [
  ['admin', 'Administrator', 'Full access'],
  ['dispatch', 'Dispatcher', 'Schedules · buses · incidents'],
  ['supervisor', 'Supervisor', 'Routes · ETA · reports'],
  ['support', 'Support', 'Feedback · USSD'],
];

function fill(u) { username.value = u; password.value = u; }

async function submit() {
  try {
    await auth.login({ username: username.value, password: password.value });
    router.push('/admin');
  } catch { /* error shown via store */ }
}
</script>

<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="auth-brand">
        <span class="auth-mark">
          <svg viewBox="0 0 44 44" fill="none">
            <path d="M9 33V14.5L22 26.5L35 14.5V33" stroke="white" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="9" cy="12" r="3.6" fill="white"/><circle cx="35" cy="12" r="3.6" fill="white"/>
          </svg>
        </span>
        <div>
          <h1>MOVEXA</h1>
          <p class="muted">Staff Operations Dashboard</p>
        </div>
      </div>

      <form @submit.prevent="submit" class="auth-form">
        <label>Staff username</label>
        <input v-model="username" class="input" autocomplete="username" placeholder="admin" />
        <label>Password</label>
        <input v-model="password" type="password" class="input" autocomplete="current-password" placeholder="••••••" />
        <div v-if="auth.error" class="error">{{ auth.error }}</div>
        <button class="btn primary block" :disabled="auth.loading">
          {{ auth.loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <div class="role-hint">
        <div class="role-hint-title">Demo staff roles</div>
        <button v-for="[u, name, scope] in roles" :key="u" class="role-row" @click="fill(u)">
          <span class="role-name">{{ name }}</span>
          <span class="role-scope">{{ scope }}</span>
          <code>{{ u }}/{{ u }}</code>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
.auth-mark {
  width: 46px; height: 46px; border-radius: 13px; flex-shrink: 0;
  background: linear-gradient(150deg, #0D9488, #2563EB);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 20px rgba(13,148,136,0.4);
}
.auth-mark svg { width: 30px; height: 30px; }
.auth-brand h1 { margin: 0; font-size: 22px; letter-spacing: 0.08em; }
.auth-form { display: flex; flex-direction: column; gap: 6px; }
.auth-form label { font-size: 12px; color: var(--admin-muted); margin-top: 8px; font-weight: 600; }
.btn.primary { background: linear-gradient(135deg, #0D9488, #2563EB); color: #fff; border: none; font-weight: 700; }
.btn.block { width: 100%; justify-content: center; margin-top: 16px; padding: 12px; }
.role-hint { margin-top: 22px; border-top: 1px solid var(--admin-border); padding-top: 16px; }
.role-hint-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--admin-muted); margin-bottom: 8px; }
.role-row {
  width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
  background: var(--admin-surface-2); border: 1px solid var(--admin-border);
  border-radius: 8px; padding: 9px 12px; margin-bottom: 6px; cursor: pointer; color: var(--admin-text);
}
.role-row:hover { border-color: var(--admin-cyan); }
.role-name { font-weight: 700; font-size: 13px; }
.role-scope { flex: 1; font-size: 11px; color: var(--admin-muted); }
.role-row code { font-size: 11px; color: var(--admin-cyan); }
</style>
