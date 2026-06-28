<template>
  <nav class="bottom-nav">
    <router-link v-for="item in items" :key="item.to" :to="item.to" class="nav-item" :class="{ active: isActive(item) }">
      <span class="nav-icon" v-html="item.icon"></span>
      <span class="nav-label">{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();

const items = [
  { to: '/', label: 'Home', icon: homeIcon, match: ['Home', 'Planner', 'Results', 'JourneyDetail'] },
  { to: '/map', label: 'Map', icon: mapIcon, match: ['Map', 'Nearby', 'StopDetail', 'LineDetail'] },
  { to: '/tickets', label: 'Tickets', icon: ticketIcon, match: ['Tickets'] },
  { to: '/saved', label: 'Saved', icon: savedIcon, match: ['Saved', 'Alerts', 'Profile'] },
];

function isActive(item) {
  return item.match.includes(route.name);
}

const homeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
const mapIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`;
const ticketIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 010-6h20a3 3 0 010 6v2a3 3 0 000 6H2a3 3 0 000-6V9z"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`;
const savedIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>`;
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  height: var(--bottom-nav-height);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: stretch;
  z-index: 100;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.06);
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--color-muted);
  transition: color 0.18s;
  padding: 8px 4px;
  position: relative;
}

.nav-item.active { color: var(--color-primary); }
.nav-item.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 28%;
  right: 28%;
  height: 3px;
  background: var(--grad-aurora);
  border-radius: 0 0 5px 5px;
}

.nav-icon {
  width: 24px;
  height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 11px;
  transition: background 0.2s, transform 0.2s;
}
.nav-icon svg { width: 22px; height: 22px; }
.nav-item.active .nav-icon {
  background: linear-gradient(135deg, rgba(13,148,136,0.16), rgba(79,70,229,0.16));
  transform: translateY(-1px);
}

.nav-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
</style>
