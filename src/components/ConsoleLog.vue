<script setup>
import { ref, watch, nextTick } from 'vue';

const props = defineProps({
  logs: Array
});

defineEmits(['clear']);

const logsContainer = ref(null);

// 自动滚动到底部
watch(() => props.logs.length, () => {
  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
    }
  });
});

const getLogClass = (log) => {
  if (log.type === 'success') return 'text-macGreen';
  if (log.type === 'warning') return 'text-macYellow';
  if (log.type === 'error') return 'text-macRed';
  if (log.type === 'system') return 'text-macBlue';
  return 'text-macTextPrimary';
};
</script>

<template>
  <section class="h-44 min-h-[11rem] bg-macConsoleBg border border-macBorder rounded-xl p-3.5 flex flex-col shadow-inner">
    <div class="flex justify-between items-center mb-2 pb-1.5 border-b border-macBorder">
      <div class="flex items-center gap-1.5">
        <h3 class="text-[10px] font-semibold font-mono text-macTextSecondary uppercase tracking-wider">系统终端日志</h3>
      </div>
      <button @click="$emit('clear')" class="px-2 py-0.5 text-[9px] bg-macInputBg border border-macBorder hover:bg-macBg text-macTextPrimary rounded transition-all duration-150">清空日志</button>
    </div>
    <div class="flex-1 overflow-y-auto font-mono text-[9px] leading-relaxed" ref="logsContainer">
      <div v-for="(log, idx) in logs" :key="idx" class="log-line text-[10px] font-mono mb-1 py-0.5 border-b border-macConsoleLineBorder" :class="getLogClass(log)">
        <span class="text-slate-500 mr-2">[{{ log.time }}]</span>
        <span>{{ log.text }}</span>
      </div>
    </div>
  </section>
</template>
