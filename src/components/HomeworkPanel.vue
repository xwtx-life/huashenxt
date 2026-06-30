<script setup>
import { ref, onMounted, watch } from 'vue';

const emit = defineEmits(['log']);

// 属性定义
const props = defineProps({
  user: {
    type: Object,
    default: null
  }
});

// 状态定义
const loading = ref(false);
const coursesHomework = ref([]);
const activeCourse = ref(null); // 当前展开的课程 ID
const activeSubTab = ref('uncompleted'); // 'uncompleted' | 'completed'

// 题目弹窗状态
const showModal = ref(false);
const currentExam = ref(null);
const examDetails = ref(null);
const loadingDetails = ref(false);

// 一键自动答题进度状态
const submittingExamno = ref(null);

// 获取所有课程的作业列表
const fetchHomeworkList = async (silent = false, forceRefresh = false) => {
  if (loading.value) return;
  loading.value = true;
  if (!silent) {
    emit('log', forceRefresh ? '🔄 开始从云端强刷全科作业数据...' : '🔄 开始同步全科作业数据...', 'info');
  }
  
  try {
    if (window.electronAPI && window.electronAPI.getHomeworkList) {
      const result = await window.electronAPI.getHomeworkList({ forceRefresh });
      if (result.success) {
        coursesHomework.value = result.courses || [];
        if (!silent) {
          emit('log', result.fromCache ? '📅 作业数据已从本地缓存加载！' : '✅ 作业数据已从云端同步成功！', 'success');
        }
        // 默认展开第一个有作业的课程
        if (coursesHomework.value.length > 0 && !activeCourse.value) {
          const firstWithHomework = coursesHomework.value.find(c => c.uncompleted.length > 0) || coursesHomework.value[0];
          activeCourse.value = firstWithHomework.classroomno;
        }
      } else {
        if (!silent) {
          emit('log', '❌ 同步作业数据失败: ' + result.message, 'error');
        }
      }
    } else {
      emit('log', '❌ 未检测到 Electron API，请在 Electron 客户端中运行。', 'error');
    }
  } catch (err) {
    if (!silent) {
      emit('log', '❌ 同步作业数据发生异常: ' + err.message, 'error');
    }
  } finally {
    loading.value = false;
  }
};

// 辅助延时函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 一键自动做题 (传入正确的 studentno)
const handleAutoSubmit = async (exam, studentno) => {
  if (submittingExamno.value) return;
  submittingExamno.value = exam.examno;
  emit('log', `🔄 开始为作业【${exam.examName || exam.section}】进行一键自动答题...`, 'info');

  try {
    if (!window.electronAPI || !window.electronAPI.getHomeworkInfo || !window.electronAPI.submitHomework) {
      emit('log', '❌ 客户端 API 未就绪，无法自动做题。', 'error');
      submittingExamno.value = null;
      return;
    }

    // 1. 获取题目详情与标准答案
    const infoResult = await window.electronAPI.getHomeworkInfo(exam.examno);
    if (!infoResult.success || !infoResult.data || !infoResult.data.content) {
      emit('log', `❌ 获取作业题目失败，无法自动答题: ${infoResult.message || '数据为空'}`, 'error');
      submittingExamno.value = null;
      return;
    }

    const questions = infoResult.data.content;
    if (questions.length === 0) {
      emit('log', `❌ 该作业中没有发现任何题目，无法提交。`, 'warning');
      submittingExamno.value = null;
      return;
    }

    // 2. 构造答题载荷
    const answers = questions.map(q => {
      let equalVal = '';
      if (q.answer) {
        equalVal = q.answer.equal || q.answer.text || '';
      }
      return {
        isFrom: 'web',
        examQuestionno: q.examQuestionno,
        answer: {
          equal: equalVal
        }
      };
    });

    // 优先使用传入的课程 studentno，其次使用详情中的 studentno
    const targetStudentno = studentno || exam.studentno || infoResult.data.studentno;
    
    emit('log', `正在为学号 ${targetStudentno} 提交 ${answers.length} 道题目的标准答案...`, 'info');

    // 3. 提交答案
    const submitResult = await window.electronAPI.submitHomework({
      examno: exam.examno,
      studentno: targetStudentno,
      answers
    });

    if (submitResult.success) {
      emit('log', `🎉 作业【${exam.examName || exam.section}】答案已提交，等待云端阅卷（1.5秒后自动刷新）...`, 'info');
      await sleep(1500);
      await fetchHomeworkList(true, true);
      emit('log', `🎉 作业列表已刷新！`, 'success');
    } else {
      emit('log', `❌ 提交作业失败: ${submitResult.message}`, 'error');
    }
  } catch (err) {
    emit('log', `❌ 一键自动答题发生异常: ${err.message}`, 'error');
  } finally {
    submittingExamno.value = null;
  }
};

// 折叠展开控制
const toggleCourse = (classroomno) => {
  if (activeCourse.value === classroomno) {
    activeCourse.value = null;
  } else {
    activeCourse.value = classroomno;
  }
};

// 查看作业详情（弹窗显示题目与答案）
const viewExamDetails = async (exam) => {
  currentExam.value = exam;
  showModal.value = true;
  loadingDetails.value = true;
  examDetails.value = null;
  
  try {
    if (window.electronAPI && window.electronAPI.getHomeworkInfo) {
      const result = await window.electronAPI.getHomeworkInfo(exam.examno);
      if (result.success) {
        examDetails.value = result.data;
      } else {
        emit('log', `❌ 获取作业【${exam.examName}】详情失败: ${result.message}`, 'error');
      }
    }
  } catch (err) {
    emit('log', `❌ 获取作业详情异常: ${err.message}`, 'error');
  } finally {
    loadingDetails.value = false;
  }
};

// 关闭弹窗
const closeModal = () => {
  showModal.value = false;
  currentExam.value = null;
  examDetails.value = null;
};

// 辅助函数：判断选项是否为正确答案
const isOptionCorrect = (question, index) => {
  const answer = question.answer;
  if (!answer || !answer.equal) return false;
  
  const optionLetter = String.fromCharCode(65 + index); // 0 -> A, 1 -> B, etc.
  
  // 兼容单选/多选，比如 "A" 或 "A,B" 或 "AB"
  const cleanEqual = String(answer.equal).replace(/[^A-Z]/gi, '').toUpperCase();
  return cleanEqual.includes(optionLetter);
};

// 获取选项的前缀字母
const getOptionLetter = (index) => {
  return String.fromCharCode(65 + index);
};

// 格式化时间戳
const formatDate = (timestamp) => {
  if (!timestamp) return '无限制';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// 监听用户登录状态，登录成功后自动触发云端强刷，注销后清空列表
watch(() => props.user, (newUser) => {
  if (newUser) {
    fetchHomeworkList(true, true);
  } else {
    coursesHomework.value = [];
  }
});

onMounted(() => {
  // 1. 组件加载时自动静默从本地缓存拉取作业列表 (0秒极速展现)
  fetchHomeworkList(true, false);

  // 2. 监听主进程的后台作业更新广播，实时更新 UI
  if (window.electronAPI && window.electronAPI.onHomeworkUpdate) {
    window.electronAPI.onHomeworkUpdate((updatedCourses) => {
      coursesHomework.value = updatedCourses || [];
      emit('log', '📅 后台已自动同步并更新最新云端作业数据。', 'success');
      
      if (coursesHomework.value.length > 0 && !activeCourse.value) {
        const firstWithHomework = coursesHomework.value.find(c => c.uncompleted.length > 0) || coursesHomework.value[0];
        activeCourse.value = firstWithHomework.classroomno;
      }
    });
  }
});
</script>

<template>
  <section class="flex-1 flex flex-col gap-2.5 overflow-hidden">
    <!-- 顶部操作栏 -->
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-2">
        <h2 class="text-xs font-semibold text-macTextPrimary tracking-wide">作业答题助手</h2>
        <button 
          @click="fetchHomeworkList(false, true)" 
          :disabled="loading"
          class="text-[10px] text-macBlue hover:underline flex items-center gap-1 bg-transparent border-none cursor-pointer p-0 select-none disabled:opacity-50 disabled:no-underline"
        >
          {{ loading ? '🔄 同步中...' : '🔄 刷新作业' }}
        </button>
      </div>
      <span class="bg-macSidebar border border-macBorder px-2.5 py-0.5 rounded text-[10px] text-macTextSecondary">
        共 {{ coursesHomework.length }} 门课程
      </span>
    </div>

    <!-- 主体列表 -->
    <div class="flex-1 flex flex-col gap-2.5 overflow-y-auto pr-1">
      <template v-if="coursesHomework.length > 0">
        <div 
          v-for="course in coursesHomework" 
          :key="course.classroomno" 
          class="bg-macSidebar border border-macBorder rounded-xl p-4 transition-all duration-200"
          :class="activeCourse === course.classroomno ? 'border-macBlue/30 shadow-lg shadow-black/10' : 'hover:border-white/10'"
        >
          <!-- 课程头部 (点击折叠/展开) -->
          <div 
            @click="toggleCourse(course.classroomno)" 
            class="flex justify-between items-center cursor-pointer select-none group"
          >
            <div class="flex items-center gap-2.5 max-w-[80%]">
              <span class="text-[9px] text-macTextSecondary transition-colors group-hover:text-macBlue">
                {{ activeCourse === course.classroomno ? '▼' : '▶' }}
              </span>
              <h3 class="text-xs font-semibold text-macTextPrimary leading-snug group-hover:text-macBlue transition-colors truncate">
                {{ course.classroomName }}
              </h3>
            </div>
            
            <div class="flex items-center gap-2">
              <span 
                v-if="course.uncompleted.length > 0" 
                class="bg-macRed/10 text-macRed border border-macRed/20 text-[9px] px-1.5 py-0.5 rounded font-mono"
              >
                {{ course.uncompleted.length }} 待办
              </span>
              <span 
                v-else 
                class="bg-macGreen/10 text-macGreen border border-macGreen/20 text-[9px] px-1.5 py-0.5 rounded font-mono"
              >
                已全部完成
              </span>
            </div>
          </div>

          <!-- 课程作业子列表 (展开时显示) -->
          <div v-if="activeCourse === course.classroomno" class="mt-4 pt-3 border-t border-macBorder flex flex-col gap-3">
            <!-- 子标签切换 (未完成 vs 已完成) -->
            <div class="flex gap-2 border-b border-macBorder pb-2">
              <button 
                @click="activeSubTab = 'uncompleted'" 
                class="text-[10px] px-2.5 py-1 rounded-md transition-all font-medium"
                :class="activeSubTab === 'uncompleted' ? 'bg-macBlue text-white shadow-sm' : 'text-macTextSecondary hover:text-macTextPrimary hover:bg-white/5'"
              >
                未完成作业 ({{ course.uncompleted.length }})
              </button>
              <button 
                @click="activeSubTab = 'completed'" 
                class="text-[10px] px-2.5 py-1 rounded-md transition-all font-medium"
                :class="activeSubTab === 'completed' ? 'bg-macBlue text-white shadow-sm' : 'text-macTextSecondary hover:text-macTextPrimary hover:bg-white/5'"
              >
                已完成作业 ({{ course.completed.length }})
              </button>
            </div>

            <!-- 作业卡片列表 -->
            <div class="flex flex-col gap-2">
              <!-- 未完成列表 -->
              <template v-if="activeSubTab === 'uncompleted'">
                <div v-if="course.uncompleted.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div 
                    v-for="exam in course.uncompleted" 
                    :key="exam.examno"
                    class="bg-macItemBg border border-macBorder hover:border-macBlue/30 rounded-xl p-3.5 flex flex-col justify-between gap-3.5 transition-all group"
                  >
                    <div>
                      <div class="flex justify-between items-start gap-2 mb-1.5">
                        <h4 class="text-[11px] font-semibold text-macTextPrimary group-hover:text-macBlue transition-colors line-clamp-1">
                          {{ exam.chapter ? `【${exam.chapter}】` : '' }}{{ exam.section || exam.examName }}
                        </h4>
                        <span class="text-[9px] bg-macYellow/10 text-macYellow border border-macYellow/20 px-1.5 py-0.5 rounded shrink-0 font-medium">待完成</span>
                      </div>
                      <p class="text-[9px] text-macTextSecondary">
                        题目数量: {{ exam.questionNum }} 题 | 总分: {{ exam.totalScore }} 分
                      </p>
                      <p v-if="exam.endTime" class="text-[9px] text-macRed/80 mt-1">
                        截止时间: {{ formatDate(exam.endTime) }}
                      </p>
                    </div>
                    
                    <div class="flex gap-2 w-full">
                      <button 
                        @click="viewExamDetails(exam)"
                        class="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-macTextPrimary border border-macBorder text-[10px] rounded-md font-medium transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        💡 查答案
                      </button>
                      <button 
                        @click="handleAutoSubmit(exam, course.studentno)"
                        :disabled="submittingExamno === exam.examno"
                        class="flex-1 py-1.5 bg-macBlue hover:bg-macBlue-hover disabled:bg-macBlue/50 text-white text-[10px] rounded-md font-medium transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {{ submittingExamno === exam.examno ? '⏳ 提交中' : '🚀 一键满分' }}
                      </button>
                    </div>
                  </div>
                </div>
                <div v-else class="flex flex-col items-center justify-center py-8 text-macTextSecondary/60 text-[10px]">
                  <span>🎉 暂无未完成的作业！</span>
                </div>
              </template>

              <!-- 已完成列表 -->
              <template v-if="activeSubTab === 'completed'">
                <div v-if="course.completed.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div 
                    v-for="exam in course.completed" 
                    :key="exam.examno"
                    class="bg-macItemBg border border-macBorder rounded-xl p-3.5 flex flex-col justify-between gap-3.5 opacity-85 hover:opacity-100 transition-all"
                  >
                    <div>
                      <div class="flex justify-between items-start gap-2 mb-1.5">
                        <h4 class="text-[11px] font-semibold text-macTextPrimary line-clamp-1">
                          {{ exam.chapter ? `【${exam.chapter}】` : '' }}{{ exam.section || exam.examName }}
                        </h4>
                        <span class="text-[9px] bg-macGreen/10 text-macGreen border border-macGreen/20 px-1.5 py-0.5 rounded shrink-0 font-medium">已提交</span>
                      </div>
                      <p class="text-[9px] text-macTextSecondary">
                        得分: <strong class="text-macGreen font-mono text-xs">{{ exam.point ?? '已提交' }}</strong> / {{ exam.totalScore }} 分
                      </p>
                      <p class="text-[9px] text-macTextSecondary">
                        题目数量: {{ exam.questionNum }} 题
                      </p>
                    </div>

                    <div class="flex gap-2 w-full">
                      <button 
                        @click="viewExamDetails(exam)"
                        class="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-macTextPrimary border border-macBorder text-[10px] rounded-md font-medium transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        🔍 看解析
                      </button>
                      <button 
                        @click="handleAutoSubmit(exam, course.studentno)"
                        :disabled="submittingExamno === exam.examno"
                        class="flex-1 py-1.5 bg-macGreen/10 hover:bg-macGreen/20 text-macGreen border border-macGreen/20 disabled:opacity-50 text-[10px] rounded-md font-medium transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {{ submittingExamno === exam.examno ? '⏳ 提交中' : '🔄 一键重做' }}
                      </button>
                    </div>
                  </div>
                </div>
                <div v-else class="flex flex-col items-center justify-center py-8 text-macTextSecondary/60 text-[10px]">
                  <span>暂无已完成的作业记录。</span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="flex flex-col items-center justify-center py-20 text-macTextSecondary text-center">
          <div class="text-3xl opacity-30 mb-3">📝</div>
          <p class="text-xs max-w-[18rem] leading-relaxed">
            暂无作业数据。请先在左侧成功登录，然后点击上方“刷新作业”进行同步。
          </p>
        </div>
      </template>
    </div>

    <!-- 题目与答案展示弹窗 -->
    <div 
      v-if="showModal" 
      class="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300"
      @click.self="closeModal"
    >
      <div 
        class="bg-macSidebar border border-macBorder w-full max-w-2xl h-[80vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        @click.stop
      >
        <!-- 弹窗头部 -->
        <div class="px-5 py-4 border-b border-macBorder flex justify-between items-center bg-white/5">
          <div>
            <span class="text-[9px] bg-macBlue/10 text-macBlue border border-macBlue/20 px-2 py-0.5 rounded-full font-semibold mr-2 uppercase">
              {{ currentExam?.exerciseType === 2 ? '课后作业' : '在线考试' }}
            </span>
            <h3 class="text-xs font-semibold text-macTextPrimary inline-block">
              {{ currentExam?.examName }} - {{ currentExam?.chapter || '题目解析' }}
            </h3>
          </div>
          <button 
            @click="closeModal" 
            class="text-macTextSecondary hover:text-macTextPrimary bg-transparent border-none cursor-pointer text-lg font-bold p-1 select-none transition-colors"
          >
            ✕
          </button>
        </div>

        <!-- 弹窗内容区 -->
        <div class="flex-1 overflow-y-auto p-5 space-y-5">
          <!-- 加载中 -->
          <div v-if="loadingDetails" class="flex flex-col items-center justify-center py-20 space-y-3">
            <div class="w-8 h-8 border-2 border-macBlue border-t-transparent rounded-full animate-spin"></div>
            <span class="text-[10px] text-macTextSecondary">正在从云端获取作业答案，请稍候...</span>
          </div>

          <!-- 详情展示 -->
          <template v-else-if="examDetails && examDetails.content">
            <div 
              v-for="(item, qIdx) in examDetails.content" 
              :key="item.examQuestionno" 
              class="border border-macBorder bg-macItemBg rounded-xl p-4 space-y-3 hover:border-white/5 transition-all"
            >
              <!-- 题干 -->
              <div class="flex gap-2.5 items-start">
                <span class="bg-macBlue/10 text-macBlue font-mono text-[10px] px-2 py-0.5 rounded shrink-0 font-bold">
                  Q{{ qIdx + 1 }}
                </span>
                <p class="text-xs font-medium text-macTextPrimary leading-relaxed">
                  {{ item.question?.select?.text || '暂无题目内容' }}
                </p>
              </div>

              <!-- 选项列表 (选择题) -->
              <div v-if="item.question?.options && item.question.options.length > 0" class="pl-8 space-y-1.5">
                <div 
                  v-for="(opt, oIdx) in item.question.options" 
                  :key="oIdx"
                  class="flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-all border"
                  :class="isOptionCorrect(item, oIdx) 
                    ? 'bg-macGreen/10 border-macGreen/30 text-macGreen font-medium shadow-sm shadow-macGreen/5' 
                    : 'bg-black/5 border-transparent text-macTextSecondary'"
                >
                  <span 
                    class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono border"
                    :class="isOptionCorrect(item, oIdx)
                      ? 'bg-macGreen/20 border-macGreen/30 text-macGreen'
                      : 'bg-black/10 border-macBorder text-macTextSecondary'"
                  >
                    {{ getOptionLetter(oIdx) }}
                  </span>
                  <span class="flex-1 leading-normal">{{ opt.text }}</span>
                  <span v-if="isOptionCorrect(item, oIdx)" class="text-xs">✓ 正确答案</span>
                </div>
              </div>

              <!-- 非选择题/填空题答案显示 -->
              <div v-else class="pl-8 pt-1">
                <div class="bg-macGreen/10 border border-macGreen/20 text-macGreen px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between">
                  <span>正确答案：{{ item.answer?.equal || item.answer?.text || '请参考解析' }}</span>
                  <span>✓</span>
                </div>
              </div>
            </div>
          </template>

          <div v-else class="flex flex-col items-center justify-center py-20 text-macTextSecondary/60 text-[10px]">
            <span>无法加载作业内容或该作业暂无题目。</span>
          </div>
        </div>

        <!-- 弹窗底部操作栏 -->
        <div class="px-5 py-3 border-t border-macBorder bg-white/5 flex justify-end gap-3.5">
          <span class="text-[9px] text-macTextSecondary self-center">
            提示：本界面已为您自动高亮显示正确答案，请照此在平台进行答题。
          </span>
          <button 
            @click="closeModal" 
            class="px-4 py-1.5 bg-macBlue hover:bg-macBlue-hover text-white text-[10px] rounded-md font-medium transition-all shadow-sm cursor-pointer"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
