<script setup lang="ts">
defineProps<{
  name:
    | 'home'
    | 'settings'
    | 'pulse'
    | 'bell'
    | 'music'
    | 'list'
    | 'refresh'
    | 'wrench'
    | 'info'
    | 'folder'
    | 'arrow-left'
    | 'upload'
    | 'speaker'
    | 'trash'
    | 'check'
}>()
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true" class="ui-icon">
    <template v-if="name === 'home'">
      <path d="M3 11.2 12 4l9 7.2" />
      <path d="M5.5 10v9h5v-5h3v5h5v-9" />
    </template>
    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"
      />
    </template>
    <template v-else-if="name === 'pulse'">
      <path d="M2 12h4l2-6 4 13 3-10 2 6h5" />
    </template>
    <template v-else-if="name === 'bell'">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8Z" />
      <path d="M10 20h4" />
    </template>
    <template v-else-if="name === 'music'">
      <path d="M9 18V5l10-2v13" />
      <ellipse cx="6" cy="18" rx="3" ry="2" />
      <ellipse cx="16" cy="16" rx="3" ry="2" />
    </template>
    <template v-else-if="name === 'list'">
      <path d="M9 6h12M9 12h12M9 18h12" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </template>
    <template v-else-if="name === 'wrench'">
      <path d="M14 6a4 4 0 0 0-5 5L3 17l4 4 6-6a4 4 0 0 0 5-5l-3 3-3-3 2-4Z" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </template>
    <template v-else-if="name === 'arrow-left'">
      <path d="m15 5-7 7 7 7M8 12h13" />
    </template>
    <template v-else-if="name === 'upload'">
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M5 14v5h14v-5" />
    </template>
    <template v-else-if="name === 'speaker'">
      <path class="speaker-body" d="M4 10v4h4l5 4V6l-5 4H4Z" />
      <path class="speaker-wave speaker-wave--inner" d="M16 9a4 4 0 0 1 0 6" />
      <path class="speaker-wave speaker-wave--outer" d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m5 12 4 4L19 6" />
    </template>
    <template v-else>
      <path d="M3 7h7l2 2h9v10H3z" />
      <path d="M3 7V5h7l2 2" />
    </template>
  </svg>
</template>
