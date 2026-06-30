<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  isRunning: Boolean,
  isLoading: Boolean,
  savedConfig: Object
});

const emit = defineEmits(['start', 'stop']);

const loginname = ref('');
const pwd = ref('');
const remember = ref(false);
const autoLogin = ref(false);

// 监听保存的配置载入
watch(() => props.savedConfig, (newVal) => {
  if (newVal) {
    loginname.value = newVal.loginname || '';
    remember.value = !!newVal.remember;
    autoLogin.value = !!newVal.autoLogin;
    if (newVal.remember && newVal.pwd) {
      pwd.value = newVal.pwd;
    } else {
      pwd.value = '';
    }
  }
}, { immediate: true });

// 复选框联动
watch(autoLogin, (newVal) => {
  if (newVal) remember.value = true;
});
watch(remember, (newVal) => {
  if (!newVal) autoLogin.value = false;
});

const buttonText = computed(() => {
  if (props.isLoading) return '正在连接...';
  return props.isRunning ? '停止自动挂机' : '开始自动挂机';
});

const buttonClass = computed(() => {
  let base = 'w-full py-2 rounded-md text-xs font-medium shadow-sm transition-all duration-200 active:scale-[0.98] ';
  if (props.isLoading) {
    return base + 'bg-macBorder text-macTextSecondary border border-macBorder cursor-not-allowed';
  }
  if (props.isRunning) {
    return base + 'bg-macRed hover:opacity-90 text-white';
  }
  return base + 'bg-macBlue hover:bg-macBlueHover text-white';
});

const handleSubmit = () => {
  if (props.isRunning) {
    emit('stop');
  } else {
    emit('start', {
      loginname: loginname.value.trim(),
      pwd: pwd.value.trim(),
      remember: remember.value,
      autoLogin: autoLogin.value
    });
  }
};
</script>

<template>
  <div class="bg-macCardBg border border-macBorder rounded-xl p-4 flex flex-col gap-4 shadow-sm">
    <div class="flex items-center gap-2">
      <span class="text-xs font-semibold text-macTextPrimary uppercase tracking-wider">身份登录</span>
    </div>
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <label class="text-[10px] font-medium text-macTextSecondary">学号 / 登录名</label>
        <input v-model="loginname" :disabled="isRunning" class="bg-macInputBg border border-macBorder rounded-md px-2.5 py-1.5 text-xs text-macTextPrimary outline-none transition-all duration-200 focus:border-macBlue focus:ring-1 focus:ring-macBlue/30 disabled:opacity-50" type="text" placeholder="输入学号 / 身份证 / 手机号">
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-[10px] font-medium text-macTextSecondary">登录密码</label>
        <input v-model="pwd" :disabled="isRunning" class="bg-macInputBg border border-macBorder rounded-md px-2.5 py-1.5 text-xs text-macTextPrimary outline-none transition-all duration-200 focus:border-macBlue focus:ring-1 focus:ring-macBlue/30 disabled:opacity-50" type="password" placeholder="请输入密码">
      </div>
      <!-- 记住密码 & 自动登录 -->
      <div class="flex items-center justify-between px-0.5 py-0.5">
        <label class="flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" v-model="remember" :disabled="isRunning" class="w-3.5 h-3.5 rounded border-macBorder bg-macInputBg text-macBlue focus:ring-0 outline-none accent-macBlue cursor-pointer disabled:opacity-50">
          <span class="text-[10px] text-macTextSecondary">记住密码</span>
        </label>
        <label class="flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" v-model="autoLogin" :disabled="isRunning" class="w-3.5 h-3.5 rounded border-macBorder bg-macInputBg text-macBlue focus:ring-0 outline-none accent-macBlue cursor-pointer disabled:opacity-50">
          <span class="text-[10px] text-macTextSecondary">自动登录</span>
        </label>
      </div>
      <button @click="handleSubmit" :disabled="isLoading" :class="buttonClass">
        {{ buttonText }}
      </button>
    </div>
  </div>
</template>
