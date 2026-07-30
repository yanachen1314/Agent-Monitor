<script setup lang="ts">
defineProps<{
  tone: 'success' | 'warning' | 'muted' | 'accent'
}>()
</script>

<template>
  <span class="status-pill" :class="`status-pill--${tone}`"><slot /></span>
</template>
