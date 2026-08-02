<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
}>()
const emit = defineEmits<{ close: [] }>()
const titleId = `modal-title-${useId()}`
const closeButton = ref<HTMLButtonElement | null>(null)

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) void nextTick(() => closeButton.value?.focus())
  }
)

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="base-modal">
      <div v-if="open" class="base-modal__backdrop" @mousedown.self="$emit('close')">
        <section class="base-modal" role="dialog" aria-modal="true" :aria-labelledby="titleId">
          <header class="base-modal__header">
            <h2 :id="titleId">{{ title }}</h2>
            <button
              ref="closeButton"
              class="base-modal__close"
              type="button"
              aria-label="关闭弹窗"
              title="关闭"
              @click="$emit('close')"
            >
              ×
            </button>
          </header>
          <div class="base-modal__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="base-modal__footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="less">
@import '../../assets/styles/tokens.less';
@import '../../assets/styles/mixins.less';

.base-modal__backdrop {
  position: fixed;
  z-index: 40;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 32px;
  background: rgba(31, 25, 73, 0.34);
  backdrop-filter: blur(7px);
}

.base-modal {
  width: min(680px, calc(100vw - 64px));
  max-height: min(680px, calc(100vh - 64px));
  overflow: hidden;
  border: 1px solid rgba(104, 81, 204, 0.2);
  border-radius: @radius-lg;
  background: rgba(252, 251, 255, 0.98);
  box-shadow: 0 28px 80px rgba(42, 31, 98, 0.3);
}

.base-modal__header {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 12px 22px;
  border-bottom: 1px solid rgba(94, 74, 180, 0.11);
}

.base-modal__header h2 {
  color: @ink-strong;
  font-size: 17px;
}

.base-modal__close {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  background: transparent;
  color: @ink-soft;
  font-size: 24px;
}

.base-modal__close:hover {
  color: #fff;
  background: @danger;
}

.base-modal__body {
  max-height: calc(100vh - 220px);
  overflow: auto;
  padding: 20px 22px;
  .themed-scrollbar();
}

.base-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 13px 22px 17px;
  border-top: 1px solid rgba(94, 74, 180, 0.11);
  background: rgba(111, 85, 232, 0.025);
}

.base-modal-enter-active,
.base-modal-leave-active {
  transition: opacity 180ms ease;
}

.base-modal-enter-active .base-modal,
.base-modal-leave-active .base-modal {
  transition: transform 220ms @ease-out;
}

.base-modal-enter-from,
.base-modal-leave-to {
  opacity: 0;
}

.base-modal-enter-from .base-modal,
.base-modal-leave-to .base-modal {
  transform: translateY(10px) scale(0.98);
}
</style>
