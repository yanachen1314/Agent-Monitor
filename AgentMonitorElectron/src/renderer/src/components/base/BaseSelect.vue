<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type { BaseSelectOption } from './base-select'

const props = defineProps<{
  modelValue: string
  options: BaseSelectOption[]
  label: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const open = ref(false)
const activeIndex = ref(0)
const placement = ref<'top' | 'bottom'>('bottom')
const menuStyle = ref<Record<string, string>>({})
const listboxId = `base-select-${useId()}`

const selectedIndex = computed(() => {
  const index = props.options.findIndex((option) => option.value === props.modelValue)
  return index >= 0 ? index : 0
})
const selectedOption = computed(() => props.options[selectedIndex.value])
const activeOptionId = computed(() =>
  open.value ? `${listboxId}-option-${activeIndex.value}` : undefined
)

function optionStyle(option?: BaseSelectOption): Record<string, string> {
  return option?.color ? { '--base-select-option-color': option.color } : {}
}

function openList(): void {
  if (props.disabled || props.options.length === 0) return
  activeIndex.value = selectedIndex.value
  open.value = true
  void nextTick(updateMenuPosition)
}

function closeList(restoreFocus = false): void {
  open.value = false
  if (restoreFocus) void nextTick(() => trigger.value?.focus())
}

function toggleList(): void {
  if (open.value) closeList()
  else openList()
}

function moveActive(offset: number): void {
  if (!open.value) openList()
  if (props.options.length === 0) return
  activeIndex.value = (activeIndex.value + offset + props.options.length) % props.options.length
}

function selectOption(index: number): void {
  const option = props.options[index]
  if (!option) return
  if (option.value !== props.modelValue) emit('update:modelValue', option.value)
  closeList(true)
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActive(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(-1)
  } else if (event.key === 'Home' && open.value) {
    event.preventDefault()
    activeIndex.value = 0
  } else if (event.key === 'End' && open.value) {
    event.preventDefault()
    activeIndex.value = Math.max(0, props.options.length - 1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (open.value) selectOption(activeIndex.value)
    else openList()
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    closeList(true)
  } else if (event.key === 'Tab') {
    closeList()
  }
}

function handleOutsidePointer(event: PointerEvent): void {
  const target = event.target as Node
  if (open.value && !root.value?.contains(target) && !menu.value?.contains(target)) closeList()
}

function updateMenuPosition(): void {
  if (!open.value || !trigger.value || !menu.value) return
  const rect = trigger.value.getBoundingClientRect()
  const width = Math.max(rect.width, 154)
  const menuHeight = menu.value.offsetHeight
  const viewportPadding = 12
  const fitsBelow = rect.bottom + 8 + menuHeight <= window.innerHeight - viewportPadding
  placement.value = fitsBelow ? 'bottom' : 'top'
  const top = fitsBelow ? rect.bottom + 8 : Math.max(viewportPadding, rect.top - menuHeight - 8)
  const left = Math.min(
    Math.max(viewportPadding, rect.right - width),
    window.innerWidth - width - viewportPadding
  )
  menuStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`
  }
}

watch(
  () => props.modelValue,
  () => {
    activeIndex.value = selectedIndex.value
  }
)
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) closeList()
  }
)

onMounted(() => {
  window.addEventListener('pointerdown', handleOutsidePointer)
  window.addEventListener('resize', updateMenuPosition)
  window.addEventListener('scroll', updateMenuPosition, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleOutsidePointer)
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
})
</script>

<template>
  <div ref="root" class="base-select" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <button
      ref="trigger"
      class="base-select__trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="activeOptionId"
      :disabled="disabled"
      :style="optionStyle(selectedOption)"
      @click="toggleList"
      @keydown="handleKeydown"
    >
      <span>{{ selectedOption?.label ?? '请选择' }}</span>
      <i class="base-select__chevron" aria-hidden="true" />
    </button>

    <Teleport to="body">
      <Transition name="base-select-menu">
        <div
          v-if="open"
          :id="listboxId"
          ref="menu"
          class="base-select__menu"
          :data-placement="placement"
          :style="menuStyle"
          role="listbox"
          :aria-label="label"
        >
          <div
            v-for="(option, index) in options"
            :id="`${listboxId}-option-${index}`"
            :key="option.value"
            class="base-select__option"
            :class="{
              'is-active': index === activeIndex,
              'is-selected': option.value === modelValue
            }"
            role="option"
            :aria-selected="option.value === modelValue"
            :style="optionStyle(option)"
            @mouseenter="activeIndex = index"
            @mousedown.prevent
            @click="selectOption(index)"
          >
            <span>{{ option.label }}</span>
            <i v-if="option.value === modelValue" class="base-select__check" aria-hidden="true" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="less">
@import '../../assets/styles/tokens.less';

.base-select {
  position: relative;
}

.base-select__trigger {
  display: flex;
  width: 100%;
  height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 0 15px 0 17px;
  cursor: pointer;
  border: 1px solid rgba(111, 85, 232, 0.25);
  border-radius: 12px;
  outline: none;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(248, 246, 255, 0.88));
  box-shadow:
    0 7px 20px rgba(87, 66, 181, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
  color: var(--base-select-option-color, @violet-deep);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
  transition:
    border-color @fast ease,
    box-shadow @fast ease,
    transform @fast ease;
}

.base-select__trigger:hover {
  border-color: rgba(111, 85, 232, 0.52);
  box-shadow:
    0 9px 24px rgba(87, 66, 181, 0.12),
    inset 0 1px 0 #fff;
  transform: translateY(-1px);
}

.base-select__trigger:focus-visible,
.is-open .base-select__trigger {
  border-color: @violet;
  box-shadow:
    0 0 0 3px rgba(111, 85, 232, 0.13),
    0 10px 26px rgba(87, 66, 181, 0.14);
}

.base-select__trigger:disabled {
  cursor: wait;
  opacity: 0.66;
  transform: none;
}

.base-select__chevron {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-right: 2px solid var(--base-select-option-color, @violet);
  border-bottom: 2px solid var(--base-select-option-color, @violet);
  transform: translateY(-2px) rotate(45deg);
  transition: transform 200ms @ease-out;
}

.is-open .base-select__chevron {
  transform: translateY(2px) rotate(225deg);
}

.base-select__menu {
  position: fixed;
  z-index: 50;
  min-width: 154px;
  overflow: hidden;
  padding: 6px;
  border: 1px solid rgba(104, 81, 204, 0.2);
  border-radius: 14px;
  background: rgba(253, 252, 255, 0.97);
  box-shadow:
    0 20px 48px rgba(53, 39, 124, 0.2),
    0 4px 12px rgba(74, 54, 159, 0.08),
    inset 0 1px 0 #fff;
  backdrop-filter: blur(14px);
  transform-origin: top right;
}

.base-select__menu[data-placement='top'] {
  transform-origin: bottom right;
}

.base-select__option {
  position: relative;
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  cursor: pointer;
  border-radius: 9px;
  color: @ink;
  font-size: 13px;
  font-weight: 520;
  transition:
    color 120ms ease,
    background 120ms ease,
    transform 120ms ease;
}

.base-select__option.is-active {
  color: var(--base-select-option-color, @violet-deep);
  background: color-mix(in srgb, var(--base-select-option-color, @violet) 10%, transparent);
  transform: translateX(1px);
}

.base-select__option.is-selected {
  color: var(--base-select-option-color, @violet-deep);
  font-weight: 680;
}

.base-select__check {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--base-select-option-color, @violet);
  box-shadow: 0 3px 9px rgba(91, 68, 201, 0.24);
}

.base-select__check::after {
  position: absolute;
  top: 4px;
  left: 5px;
  width: 5px;
  height: 3px;
  border-bottom: 1.5px solid #fff;
  border-left: 1.5px solid #fff;
  content: '';
  transform: rotate(-45deg);
}

.base-select-menu-enter-active,
.base-select-menu-leave-active {
  transition:
    opacity 150ms ease,
    transform 190ms @ease-out;
}

.base-select-menu-enter-from,
.base-select-menu-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.97);
}

.base-select__menu[data-placement='top'].base-select-menu-enter-from,
.base-select__menu[data-placement='top'].base-select-menu-leave-to {
  transform: translateY(5px) scale(0.97);
}
</style>
