<script setup>
defineEmits(['toggleTheme']);

const minimize = () => window.electronAPI.minimizeWindow();
const maximize = () => window.electronAPI.maximizeWindow();
const close = () => window.electronAPI.closeWindow();
</script>

<template>
  <header class="h-9 min-h-[2.25rem] bg-macSidebar border-b border-macBorder flex items-center justify-between relative select-none" style="-webkit-app-region: drag;">
    <!-- 左侧标题 -->
    <div class="flex items-center gap-2 pl-3 pointer-events-none">
      <span class="text-[11px] text-macTextPrimary font-medium">武汉工程大学（成教）课程助手</span>
    </div>
    
    <!-- 右侧控制区 (不拖拽) -->
    <div class="flex items-center h-full z-10" style="-webkit-app-region: no-drag;">
      <!-- 主题切换按钮 -->
      <button @click="$emit('toggleTheme')" class="px-2.5 py-0.5 mr-2 text-[10px] bg-macInputBg border border-macBorder hover:bg-macBg text-macTextPrimary rounded transition-all duration-150 flex items-center gap-1 font-medium" title="切换主题">
        🌓 切换主题
      </button>
      
      <!-- 最小化 -->
      <button @click="minimize" class="w-11 h-full flex items-center justify-center text-macTextPrimary hover:bg-macBorder/50 transition-colors duration-100" title="最小化">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4"/></svg>
      </button>
      <!-- 最大化 -->
      <button @click="maximize" class="w-11 h-full flex items-center justify-center text-macTextPrimary hover:bg-macBorder/50 transition-colors duration-100" title="最大化">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="1" stroke-width="2.5"/></svg>
      </button>
      <!-- 关闭 -->
      <button @click="close" class="w-11 h-full flex items-center justify-center text-macTextPrimary hover:bg-[#ff453a] hover:text-white transition-colors duration-100 rounded-tr-xl" title="关闭">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  </header>
</template>
