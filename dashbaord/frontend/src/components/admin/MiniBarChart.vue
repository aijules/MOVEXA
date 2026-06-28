<script setup>
const props = defineProps({ data: { type: Array, default: () => [] } });
function height(value) {
  const max = Math.max(1, ...props.data.map((item) => Number(item.value || 0)));
  return `${Math.max(8, (Number(value || 0) / max) * 100)}%`;
}
</script>

<template>
  <div class="chart-bars" role="img" aria-label="Chart">
    <div v-for="item in data" :key="item.label" class="bar" :title="`${item.label}: ${item.value}`" :style="{ height: height(item.value) }"></div>
  </div>
</template>

