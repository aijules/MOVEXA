<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LayoutDashboard, Map, Route, MapPin, CalendarClock, Bus, Truck, Gauge, Sparkles, AlertTriangle, MessageSquare, Phone, BarChart3, Settings, LogOut, RefreshCw, CreditCard, ScanLine } from 'lucide-vue-next';
import { useAdminAuthStore } from '../stores/adminAuth.store.js';

const auth = useAdminAuthStore();
const route = useRoute();
const router = useRouter();

const groups = [
  { label: 'Operations', items: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, permission: 'overview' },
    { to: '/admin/live-map', label: 'Live Monitoring', icon: Map, permission: 'live-map' },
    { to: '/admin/trips', label: 'Trips', icon: Bus, permission: 'trips' },
    { to: '/admin/eta', label: 'ETA Monitoring', icon: Gauge, permission: 'eta' },
    { to: '/admin/adaptive', label: 'Adaptive Scheduling', icon: Sparkles, permission: 'adaptive' },
    { to: '/admin/incidents', label: 'Incidents', icon: AlertTriangle, permission: 'incidents' },
  ] },
  { label: 'Network', items: [
    { to: '/admin/routes', label: 'Routes', icon: Route, permission: 'routes' },
    { to: '/admin/stops', label: 'Stops', icon: MapPin, permission: 'stops' },
    { to: '/admin/schedules', label: 'Schedules', icon: CalendarClock, permission: 'schedules' },
    { to: '/admin/buses', label: 'Buses', icon: Truck, permission: 'buses' },
  ] },
  { label: 'Passengers', items: [
    { to: '/admin/payments', label: 'MoMo Payments', icon: CreditCard, permission: 'payments' },
    { to: '/admin/verify-ticket', label: 'Verify Ticket', icon: ScanLine, permission: 'verify' },
    { to: '/admin/feedback', label: 'Feedback', icon: MessageSquare, permission: 'feedback' },
    { to: '/admin/ussd', label: 'USSD Logs', icon: Phone, permission: 'ussd' },
  ] },
  { label: 'System', items: [
    { to: '/admin/reports', label: 'Reports', icon: BarChart3, permission: 'reports' },
    { to: '/admin/settings', label: 'Settings', icon: Settings, permission: 'settings' },
  ] },
];

const visibleGroups = computed(() => groups
  .map((g) => ({ ...g, items: g.items.filter((i) => auth.hasPermission(i.permission)) }))
  .filter((g) => g.items.length));

function logout() { auth.logout(); router.push('/admin/login'); }
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">
          <svg viewBox="0 0 44 44" fill="none">
            <path d="M9 33V14.5L22 26.5L35 14.5V33" stroke="white" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="9" cy="12" r="3.6" fill="white"/><circle cx="35" cy="12" r="3.6" fill="white"/>
          </svg>
        </span>
        <div>
          <div class="brand-title">MOVEXA</div>
          <div class="brand-subtitle">Operations Control</div>
        </div>
      </div>
      <div v-for="group in visibleGroups" :key="group.label" class="nav-group">
        <div class="nav-label">{{ group.label }}</div>
        <router-link v-for="item in group.items" :key="item.to" :to="item.to" class="nav-item" :class="{ active: route.path === item.to }">
          <component :is="item.icon" size="18" />
          <span>{{ item.label }}</span>
        </router-link>
      </div>
      <div class="sidebar-foot">
        <div class="role-chip">{{ auth.role }}</div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-title">{{ route.name || 'Dashboard' }}</div>
        <span class="live-pill"><span class="live-dot"></span> Live · connected</span>
        <button class="btn" @click="$router.go(0)" title="Refresh"><RefreshCw size="16" /></button>
        <span class="muted">{{ auth.user?.name }}</span>
        <button class="btn" @click="logout" title="Logout"><LogOut size="16" /></button>
      </header>
      <section class="content" :class="{ full: route.meta.fullWidth }">
        <router-view />
      </section>
    </main>
  </div>
</template>

<style scoped>
.brand-mark {
  width: 38px; height: 38px; border-radius: 11px;
  background: linear-gradient(150deg, #0D9488, #2563EB);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 16px rgba(13,148,136,0.35); flex-shrink: 0;
}
.brand-mark svg { width: 26px; height: 26px; }
.nav-item.active { background: rgba(41,182,246,0.14); color: #fff; }
.sidebar-foot { margin-top: auto; padding-top: 12px; }
.role-chip {
  display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--admin-cyan);
  background: rgba(41,182,246,0.12); border: 1px solid rgba(41,182,246,0.25);
  padding: 5px 10px; border-radius: 8px;
}
.topbar-title { font-weight: 700; font-size: 15px; margin-right: auto; }
.live-pill { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: #0a7d56; background: rgba(14,165,113,.12); border: 1px solid rgba(14,165,113,.28); padding: 5px 11px; border-radius: 20px; }
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: #0ea571; box-shadow: 0 0 0 0 rgba(14,165,113,.5); animation: liveL 1.6s ease-out infinite; }
</style>
