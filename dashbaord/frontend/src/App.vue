<template>
  <router-view v-slot="{ Component }">
    <transition name="route" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<style>
.route-enter-active { transition: opacity .28s ease, transform .28s cubic-bezier(.34,1.2,.64,1); }
.route-leave-active { transition: opacity .16s ease, transform .16s ease; }
.route-enter-from { opacity: 0; transform: translateY(14px); }
.route-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
