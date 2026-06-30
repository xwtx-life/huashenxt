<script setup>
import { ref, onMounted } from 'vue';
import TitleBar from './components/TitleBar.vue';
import LoginPanel from './components/LoginPanel.vue';
import MonitorPanel from './components/MonitorPanel.vue';
import UserInfo from './components/UserInfo.vue';
import CourseList from './components/CourseList.vue';
import HomeworkPanel from './components/HomeworkPanel.vue';
import ConsoleLog from './components/ConsoleLog.vue';

// 状态定义
const isRunning = ref(false);
const isLoading = ref(false);
const activeTab = ref('video'); // 'video' | 'homework'

const elapsedTime = ref(0);
const finishedCount = ref(0);
const totalCount = ref(0);
const estQueueTime = ref(0);

const activeVideo = ref(null);
const user = ref(null);
const courses = ref([]);
const logs = ref([
  { time: new Date().toLocaleTimeString(), text: '终端就绪。请输入账号密码启动刷课服务。', type: 'system' }
]);

const savedConfig = ref(null);

// 主题切换
const toggleTheme = () => {
  document.documentElement.classList.toggle('light');
  const isLight = document.documentElement.classList.contains('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
};

// 追加日志
const appendLog = (text, type = 'info') => {
  logs.value.push({
    time: new Date().toLocaleTimeString(),
    text,
    type
  });
};

const clearLogs = () => {
  logs.value = [];
  appendLog('日志已清空。', 'system');
};

// 开始挂机
const handleStart = async ({ loginname, pwd, remember, autoLogin }) => {
  isLoading.value = true;
  const result = await window.electronAPI.startBrushing({
    loginname,
    pwd,
    remember,
    autoLogin
  });
  isLoading.value = false;
  if (result.success) {
    isRunning.value = !result.finished;
  } else {
    isRunning.value = false;
    appendLog(result.message, 'error');
  }
};

// 停止挂机
const handleStop = async () => {
  isLoading.value = true;
  const result = await window.electronAPI.stopBrushing();
  isLoading.value = false;
  if (result.success) {
    isRunning.value = false;
  } else {
    appendLog(result.message, 'error');
  }
};

// 刷新目录（强制重新获取）
const handleRefresh = async () => {
  isLoading.value = true;
  appendLog('🔄 正在强制从云端获取最新课件目录并刷新缓存...', 'info');
  const config = savedConfig.value || {};
  const result = await window.electronAPI.startBrushing({
    loginname: config.loginname || '',
    pwd: config.pwd || '',
    remember: config.remember || false,
    autoLogin: config.autoLogin || false,
    forceRefresh: true
  });
  isLoading.value = false;
  if (result.success) {
    appendLog('课件目录刷新成功！', 'success');
    isRunning.value = !result.finished;
  } else {
    isRunning.value = false;
    appendLog('课件目录刷新失败：' + result.message, 'error');
  }
};

onMounted(() => {
  // 1. 初始化主题
  const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (savedTheme === 'light') {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }

  // 监听系统主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      if (e.matches) {
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.add('light');
      }
    }
  });

  // 2. 监听 IPC 通信事件
  window.electronAPI.onLog((log) => {
    logs.value.push(log);
  });

  window.electronAPI.onStatusUpdate((status) => {
    isRunning.value = status.isBrushing;
    elapsedTime.value = status.elapsedTime;
    finishedCount.value = status.finishedCount;
    totalCount.value = status.totalCount;
    estQueueTime.value = status.estQueueTime;
    
    if (status.activeTasks && status.activeTasks.length > 0) {
      activeVideo.value = status.activeTasks[0];
    } else {
      activeVideo.value = null;
    }
  });

  window.electronAPI.onCoursesUpdate((updatedCourses) => {
    courses.value = updatedCourses;
  });

  window.electronAPI.onUserInfo((userInfo) => {
    user.value = userInfo;
  });

  window.electronAPI.onSavedConfig((config) => {
    savedConfig.value = config;
    appendLog('已自动载入历史配置信息。', 'system');

    if (config.autoLogin && config.remember && config.loginname && config.pwd) {
      appendLog('开启了自动登录，正在为您启动挂机...', 'system');
      setTimeout(() => {
        handleStart({
          loginname: config.loginname,
          pwd: config.pwd,
          remember: config.remember,
          autoLogin: config.autoLogin
        });
      }, 800);
    }
  });

  // 3. 自动更新监听
  if (window.electronAPI.onUpdateAvailable) {
    window.electronAPI.onUpdateAvailable((info) => {
      appendLog(`✨ 发现新版本 v${info.version}，正在后台自动下载中...`, 'success');
    });
  }

  if (window.electronAPI.onUpdateDownloaded) {
    window.electronAPI.onUpdateDownloaded((info) => {
      appendLog(`🎉 新版本 v${info.version} 已下载完成！`, 'success');
      if (confirm(`华莘学堂课程助手新版本 v${info.version} 已下载完成，是否立即重启安装？`)) {
        window.electronAPI.installUpdate();
      }
    });
  }
});
</script>

<template>
  <div class="flex flex-col h-screen w-screen bg-macBg text-macTextPrimary overflow-hidden font-sans select-none antialiased">
    <!-- 顶部标题栏 -->
    <TitleBar @toggleTheme="toggleTheme" />

    <div class="flex flex-1 overflow-hidden">
      <!-- 左边栏：控制与状态 -->
      <aside class="w-80 min-w-[20rem] bg-macSidebar border-r border-macBorder flex flex-col p-5 gap-5 overflow-y-auto">
        <!-- 登录面板 -->
        <LoginPanel
          :isRunning="isRunning"
          :isLoading="isLoading"
          :savedConfig="savedConfig"
          @start="handleStart"
          @stop="handleStop"
        />

        <!-- 监控面板 -->
        <MonitorPanel
          :isRunning="isRunning"
          :elapsedTime="elapsedTime"
          :finishedCount="finishedCount"
          :totalCount="totalCount"
          :estQueueTime="estQueueTime"
          :activeVideo="activeVideo"
        />
      </aside>

      <!-- 主面板：用户信息、课程进度与日志 -->
      <main class="flex-1 flex flex-col p-5 gap-4 overflow-hidden">
        <!-- 顶部用户信息栏 -->
        <UserInfo :user="user" />

        <!-- Tab 切换栏 -->
        <div class="flex border-b border-macBorder pb-1 gap-5">
          <button 
            @click="activeTab = 'video'" 
            class="pb-2 text-xs font-semibold relative transition-colors cursor-pointer bg-transparent border-none"
            :class="activeTab === 'video' ? 'text-macBlue' : 'text-macTextSecondary hover:text-macTextPrimary'"
          >
            📺 视频挂机
            <div v-if="activeTab === 'video'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-macBlue rounded-full"></div>
          </button>
          <button 
            @click="activeTab = 'homework'" 
            class="pb-2 text-xs font-semibold relative transition-colors cursor-pointer bg-transparent border-none"
            :class="activeTab === 'homework' ? 'text-macBlue' : 'text-macTextSecondary hover:text-macTextPrimary'"
          >
            📝 作业答题
            <div v-if="activeTab === 'homework'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-macBlue rounded-full"></div>
          </button>
        </div>

        <!-- 课程进度展示区 / 作业展示区 -->
        <CourseList v-show="activeTab === 'video'" :courses="courses" :loading="isLoading" @refresh="handleRefresh" />
        <HomeworkPanel v-show="activeTab === 'homework'" :user="user" @log="appendLog" />

        <!-- 底部控制台日志 -->
        <ConsoleLog :logs="logs" @clear="clearLogs" />
      </main>
    </div>
  </div>
</template>
