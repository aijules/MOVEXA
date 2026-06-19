<template>
  <div id="app-root">
    <router-view v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <BottomNav v-if="showNav" />
    <OfflineBanner v-if="!appStore.isOnline" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import BottomNav from './components/common/BottomNav.vue';
import OfflineBanner from './components/common/OfflineBanner.vue';
import { useAppStore } from './stores/appStore';

const route = useRoute();
const appStore = useAppStore();

const NO_NAV_ROUTES = ['Onboarding', 'Map'];
const showNav = computed(() => !NO_NAV_ROUTES.includes(route.name));

appStore.fetchAlerts();
</script>

<style>
#app-root {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  position: relative;
}
</style>
