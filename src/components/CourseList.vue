<script setup>
import { ref } from 'vue';

defineProps({
  courses: Array,
  loading: Boolean
});

const emit = defineEmits(['refresh']);

// 折叠状态管理 (默认折叠)
const collapsedCourses = ref({});

const toggleCollapse = (classroomno) => {
  collapsedCourses.value[classroomno] = !isCollapsed(classroomno);
};

const isCollapsed = (classroomno) => {
  // 默认返回 true (折叠状态)
  return collapsedCourses.value[classroomno] !== false;
};

const getVideoBadgeClass = (video) => {
  let base = 'text-[9px] px-1.5 py-0.5 rounded font-mono border ';
  if (video.completed) {
    return base + 'bg-macGreen/10 text-macGreen border-macGreen/20';
  }
  if (video.lastStatus && video.lastStatus.includes('成功')) {
    return base + 'bg-macBlue/10 text-macBlue border-macBlue/20 animate-pulse';
  }
  return base + 'bg-macYellow/10 text-macYellow border-macYellow/15';
};

const getVideoBadgeText = (video) => {
  if (video.completed) return '已完成';
  if (video.lastStatus && video.lastStatus.includes('成功')) {
    return `挂机中 (${video.percent}%)`;
  }
  return video.lastStatus || '等待中';
};
</script>

<template>
  <section class="flex-1 flex flex-col gap-2.5 overflow-hidden">
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-2">
        <h2 class="text-xs font-semibold text-macTextPrimary tracking-wide">科目进度</h2>
        <button @click="emit('refresh')" :disabled="loading" class="text-[10px] text-macBlue hover:underline flex items-center gap-1 bg-transparent border-none cursor-pointer p-0 select-none disabled:opacity-50 disabled:no-underline">
          🔄 刷新目录
        </button>
      </div>
      <span class="bg-macSidebar border border-macBorder px-2.5 py-0.5 rounded text-[10px] text-macTextSecondary">{{ courses.length }} 门课程</span>
    </div>
    
    <div class="flex-1 flex flex-col gap-2.5 overflow-y-auto pr-1 relative">
      <!-- 极简毛玻璃加载遮罩 -->
      <div v-if="loading" class="absolute inset-0 bg-macBg/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-200 rounded-xl">
        <div class="w-7 h-7 border-[2.5px] border-macBlue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-[11px] text-macTextSecondary font-medium animate-pulse">正在同步课程目录与进度...</span>
      </div>
      <template v-if="courses.length > 0">
        <div v-for="course in courses" :key="course.classroomno" class="bg-macSidebar border border-macBorder rounded-xl p-4 transition-all duration-200 hover:border-white/10">
          <!-- 课程头部信息 (可点击折叠/展开) -->
          <div @click="toggleCollapse(course.classroomno)" class="flex justify-between items-start gap-4 mb-3 cursor-pointer select-none group">
            <div class="max-w-[80%] flex items-center gap-2">
              <span class="text-[9px] text-macTextSecondary transition-colors group-hover:text-macBlue">
                {{ isCollapsed(course.classroomno) ? '▶' : '▼' }}
              </span>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-xs font-semibold text-macTextPrimary leading-snug group-hover:text-macBlue transition-colors">{{ course.classroomName }}</h3>
                <span class="text-[10px] text-macTextSecondary font-normal">(已刷小节: {{ course.completedVideos }}/{{ course.totalVideos }})</span>
              </div>
            </div>
            <span class="text-base font-bold text-macGreen font-mono">{{ course.percent }}%</span>
          </div>

          <!-- 课程进度条 -->
          <div class="h-1 w-full bg-macBorder rounded-full overflow-hidden mb-3">
            <div class="h-full bg-macBlue transition-all duration-500" :style="{ width: course.percent + '%' }"></div>
          </div>

          <!-- 课程小节折叠列表 (条件渲染) -->
          <div v-if="!isCollapsed(course.classroomno)" class="mt-2 pt-2 border-t border-macBorder flex flex-col gap-1.5">
            <div v-for="video in course.videos" :key="video.section" class="flex justify-between items-center text-[10px] py-1 px-2 rounded bg-macItemBg">
              <div class="flex items-center gap-2 text-macTextSecondary max-w-[70%] truncate">
                <span :class="video.completed ? 'text-macGreen' : 'text-macTextSecondary opacity-60'">
                  {{ video.completed ? '●' : '○' }}
                </span>
                <span class="truncate" :title="video.section">{{ video.section }}</span>
              </div>
              <span :class="getVideoBadgeClass(video)">
                {{ getVideoBadgeText(video) }}
              </span>
            </div>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="flex flex-col items-center justify-center py-20 text-macTextSecondary text-center">
          <div class="text-3xl opacity-30 mb-3">📂</div>
          <p class="text-xs max-w-[18rem] leading-relaxed">暂无同步数据。请在左侧填写账号并点击“开始自动挂机”进行课程同步。</p>
        </div>
      </template>
    </div>
  </section>
</template>
