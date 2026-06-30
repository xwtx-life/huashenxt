<script setup>
import { computed } from 'vue';

const props = defineProps({
  isRunning: Boolean,
  elapsedTime: Number,
  finishedCount: Number,
  totalCount: Number,
  estQueueTime: Number,
  activeVideo: Object
});

// 格式化时间为 HH:MM:SS
const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
};

const formatElapsedTime = computed(() => formatTime(props.elapsedTime));
const formatRemainingTime = computed(() => formatTime(props.estQueueTime));

const statusDotClass = computed(() => {
  if (props.isRunning) return 'bg-macGreen shadow-[0_0_8px_rgba(52,199,89,0.4)] animate-pulse';
  return 'bg-slate-500';
});

const statusText = computed(() => props.isRunning ? '正在挂机' : '未运行');
</script>

<template>
  <div class="bg-macCardBg border border-macBorder rounded-xl p-4 flex flex-col gap-4 shadow-sm">
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold text-macTextPrimary uppercase tracking-wider">运行监控</span>
      <div class="flex items-center gap-2 bg-macInputBg px-2 py-1 rounded border border-macBorder">
        <span class="w-2 h-2 rounded-full transition-all duration-300" :class="statusDotClass"></span>
        <span class="text-[10px] font-medium text-macTextSecondary">{{ statusText }}</span>
      </div>
    </div>
    
    <div class="flex flex-col gap-2.5">
      <div class="flex justify-between items-center bg-macInputBg/50 p-2 rounded border border-macBorder/60">
        <span class="text-[10px] text-macTextSecondary">运行时间</span>
        <span class="text-xs font-medium font-mono text-macTextPrimary">{{ formatElapsedTime }}</span>
      </div>
      <div class="flex justify-between items-center bg-macInputBg/50 p-2 rounded border border-macBorder/60">
        <span class="text-[10px] text-macTextSecondary">已刷进度</span>
        <span class="text-xs font-medium font-mono text-macTextPrimary">{{ finishedCount }} / {{ totalCount }}</span>
      </div>
      <div class="flex justify-between items-center bg-macInputBg/50 p-2 rounded border border-macBorder/60">
        <span class="text-[10px] text-macTextSecondary">预计剩余时间</span>
        <span class="text-xs font-medium font-mono text-macBlue">{{ formatRemainingTime }}</span>
      </div>

      <!-- 当前心跳视频 -->
      <div v-if="activeVideo" class="mt-1 bg-macBlue/5 border border-macBlue/20 p-2.5 rounded-lg flex flex-col gap-2">
        <div class="flex items-center gap-1.5 text-[11px] font-medium text-macBlue">
          <span class="w-1.5 h-1.5 rounded-full bg-macBlue animate-ping"></span>
          <span class="truncate max-w-[200px]" :title="activeVideo.classroomName">{{ activeVideo.classroomName }}</span>
        </div>
        <div class="text-[10px] text-macTextSecondary truncate">{{ activeVideo.section }}</div>
        <div class="flex flex-col gap-1">
          <div class="h-1 w-full bg-macBorder rounded-full overflow-hidden">
            <div class="h-full bg-macBlue transition-all duration-500" :style="{ width: activeVideo.percent + '%' }"></div>
          </div>
          <div class="flex justify-between items-center text-[9px] text-macTextSecondary font-mono mt-0.5">
            <span>{{ activeVideo.current }}/{{ activeVideo.total }}秒</span>
            <span class="bg-macBlue/10 text-macBlue border border-macBlue/20 px-1 rounded-[3px] text-[8px]">{{ activeVideo.lastStatus }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
