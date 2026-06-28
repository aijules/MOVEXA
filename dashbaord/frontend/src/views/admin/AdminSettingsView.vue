<script setup>
import { useAdminAuthStore } from '../../stores/adminAuth.store.js';
const auth = useAdminAuthStore();
const apiBase = import.meta.env.VITE_API_BASE_URL || '(proxy)';
</script>

<template>
  <div class="page-head">
    <div>
      <div class="page-eyebrow">Account</div>
      <h1>Staff Settings</h1>
      <p class="muted">Your profile, role and dashboard configuration</p>
    </div>
  </div>

  <section class="grid two-col">
    <div class="card">
      <h2>Profile</h2>
      <div class="list">
        <div class="list-item"><span>Name</span><b>{{ auth.user?.name }}</b></div>
        <div class="list-item"><span>Username</span><b>{{ auth.user?.username }}</b></div>
        <div class="list-item"><span>Role</span><span class="badge active">{{ auth.role }}</span></div>
      </div>
    </div>
    <div class="card">
      <h2>System</h2>
      <div class="list">
        <div class="list-item"><span>API endpoint</span><code>{{ apiBase }}</code></div>
        <div class="list-item"><span>Access</span><span class="badge active">Read &amp; write</span></div>
        <div class="list-item"><span>Database</span><b>Supabase PostgreSQL</b></div>
        <div class="list-item"><span>Live updates</span><b>polling (Socket.io ready)</b></div>
      </div>
    </div>
  </section>

  <section class="card" style="margin-top:16px">
    <h2>Your Permissions</h2>
    <div class="perm-grid">
      <span v-for="p in auth.permissions" :key="p" class="perm">{{ p }}</span>
    </div>
  </section>
</template>

<style scoped>
.perm-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.perm { background: rgba(20,199,132,0.12); border: 1px solid rgba(20,199,132,0.3); color: #14c784; padding: 5px 11px; border-radius: 8px; font-size: 12px; font-weight: 600; text-transform: capitalize; }
.list-item code { font-size: 12px; color: var(--admin-cyan); }
</style>
