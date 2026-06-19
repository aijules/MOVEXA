<script setup>
defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  loading: Boolean,
  error: String
});
</script>

<template>
  <div v-if="error" class="error">{{ error }}</div>
  <div v-else-if="loading" class="empty">Loading data...</div>
  <div v-else-if="!rows.length" class="empty">No records found</div>
  <div v-else class="table-wrap">
    <table>
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key">{{ column.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row._id || row.id || JSON.stringify(row).slice(0, 40)">
          <td v-for="column in columns" :key="column.key">
            <slot :name="column.key" :row="row" :value="row[column.key]">
              <span v-if="column.badge" class="badge" :class="String(row[column.key] || '').toLowerCase()">{{ row[column.key] || 'unknown' }}</span>
              <span v-else>{{ column.format ? column.format(row[column.key], row) : (row[column.key] ?? '-') }}</span>
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

