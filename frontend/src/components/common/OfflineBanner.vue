<template>
  <div class="offline-banner">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>
    You are offline — showing cached data
  </div>
</template>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  background: var(--color-warning);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 200;
}
.offline-banner svg { width: 16px; height: 16px; flex-shrink: 0; }
</style>
