<script setup>
defineProps({
  user: Object
});
</script>

<template>
  <header v-if="user" class="flex items-center gap-3.5 bg-macSidebar border border-macBorder rounded-xl p-3 shadow-sm">
    <img class="w-10 h-10 rounded-full border border-macBorder object-cover" :src="user.avatar" alt="头像">
    <div class="flex flex-col">
      <div class="flex items-center gap-2">
        <h2 class="text-xs font-semibold text-macTextPrimary">{{ user.name }}</h2>
        <span class="bg-macBlue/10 border border-macBlue/20 text-macBlue text-[9px] px-1.5 py-0.5 rounded">{{ user.schoolName }}</span>
      </div>
      <p class="text-[10px] text-macTextSecondary mt-0.5">{{ user.className }} <span class="text-macBorder mx-1">|</span> 学号: {{ user.studentNum }}</p>
    </div>
  </header>
</template>
