<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

interface OperationNoticeValue {
  tone: 'success' | 'warning'
  text: string
}

const props = withDefaults(
  defineProps<{
    notice: OperationNoticeValue | null
    duration?: number
  }>(),
  {
    duration: 3_500
  }
)

const emit = defineEmits<{ dismiss: [] }>()
let dismissTimer: number | undefined

function clearDismissTimer(): void {
  if (!dismissTimer) return
  window.clearTimeout(dismissTimer)
  dismissTimer = undefined
}

watch(
  () => props.notice,
  (notice) => {
    clearDismissTimer()
    if (!notice || props.duration <= 0) return
    dismissTimer = window.setTimeout(() => {
      emit('dismiss')
      dismissTimer = undefined
    }, props.duration)
  },
  { immediate: true }
)

onBeforeUnmount(clearDismissTimer)
</script>

<template>
  <Transition name="operation-notice">
    <div
      v-if="notice"
      class="operation-notice"
      :class="`operation-notice--${notice.tone}`"
      role="status"
      aria-live="polite"
    >
      <span class="operation-notice__icon" aria-hidden="true">
        {{ notice.tone === 'success' ? '✓' : '!' }}
      </span>
      <span>{{ notice.text }}</span>
    </div>
  </Transition>
</template>

<style scoped lang="less">
@import '../assets/styles/tokens.less';

.operation-notice {
  position: fixed;
  z-index: 30;
  top: calc(var(--titlebar-height) + var(--navigation-height) + 14px);
  right: 30px;
  display: flex;
  max-width: min(520px, calc(100vw - 60px));
  min-height: 44px;
  align-items: center;
  gap: 10px;
  padding: 10px 15px;
  border: 1px solid transparent;
  border-radius: @radius-md;
  box-shadow: 0 14px 36px rgba(47, 35, 103, 0.18);
  font-size: 13px;
  font-weight: 600;
  backdrop-filter: blur(14px);
}

.operation-notice__icon {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.operation-notice--success {
  border-color: rgba(32, 166, 99, 0.2);
  background: rgba(239, 252, 246, 0.94);
  color: #167b4a;
}

.operation-notice--success .operation-notice__icon {
  background: @green;
}

.operation-notice--warning {
  border-color: rgba(211, 138, 36, 0.24);
  background: rgba(255, 249, 237, 0.95);
  color: #9a6016;
}

.operation-notice--warning .operation-notice__icon {
  background: @amber;
}

.operation-notice-enter-active,
.operation-notice-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms @ease-out;
}

.operation-notice-enter-from,
.operation-notice-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
</style>
