const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const api = require('./api');

let mainWindow;

const isPackaged = app.isPackaged;
const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;

const GROUP_LIST_PATH = path.join(baseDir, 'groupList.json');
const CACHE_PATH = path.join(baseDir, 'classroom_cache.json');
const HOMEWORK_CACHE_PATH = path.join(baseDir, 'homework_cache.json');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 安全挂机控制参数
const MAX_CONCURRENT_VIDEOS = 1;  
const HEARTBEAT_INTERVAL = 10;    
const TICK_MS = 10000;            
const SERIAL_DELAY = 600;         

// 状态管理
let isBrushing = false;
let globalTasks = [];
let globalCourses = [];
let activeTasks = [];
let brushLoopActive = false;
let startTime = 0;
let elapsedIntervalId = null;

// 发送日志给渲染进程
function sendLog(message, type = 'info') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-message', {
      time: new Date().toLocaleTimeString(),
      text: message,
      type: type // 'info', 'success', 'warning', 'error'
    });
  }
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// 发送状态更新给渲染进程
function sendStatusUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const finishedCount = globalTasks.filter(t => t.completed).length;
    const totalRemainingSec = globalTasks
      .filter(t => !t.completed)
      .reduce((sum, t) => sum + (t.totalVideoSecond - t.currentWatchSecond), 0);
    const estQueueTime = Math.ceil(totalRemainingSec / MAX_CONCURRENT_VIDEOS);

    mainWindow.webContents.send('status-update', {
      isBrushing,
      elapsedTime: isBrushing ? Math.floor((Date.now() - startTime) / 1000) : 0,
      finishedCount,
      totalCount: globalTasks.length,
      estQueueTime,
      activeTasks: activeTasks.map(t => ({
        classroomName: t.classroomName,
        section: t.section,
        percent: ((t.currentWatchSecond / t.totalVideoSecond) * 100).toFixed(1),
        current: t.currentWatchSecond,
        total: t.totalVideoSecond,
        lastStatus: t.lastStatus
      }))
    });
  }
}

// 发送课程数据给渲染进程
function sendCoursesUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const coursesList = globalCourses.map(c => {
      const totalVideos = c.videos.length;
      const completedVideos = c.videos.filter(v => v.completed).length;
      const totalSec = c.videos.reduce((sum, v) => sum + v.totalVideoSecond, 0);
      const watchedSec = c.videos.reduce((sum, v) => sum + v.currentWatchSecond, 0);
      const percent = totalSec > 0 ? ((watchedSec / totalSec) * 100).toFixed(1) : "100.0";

      return {
        classroomno: c.classroomno,
        classroomName: c.classroomName,
        percent,
        completedVideos,
        totalVideos,
        videos: c.videos.map(v => ({
          section: v.section,
          percent: v.totalVideoSecond > 0 ? ((v.currentWatchSecond / v.totalVideoSecond) * 100).toFixed(1) : "100.0",
          completed: v.completed,
          currentWatchSecond: v.currentWatchSecond,
          totalVideoSecond: v.totalVideoSecond,
          lastStatus: v.lastStatus
        }))
      };
    });

    mainWindow.webContents.send('courses-update', coursesList);
  }
}

// 核心挂机心跳循环
async function startBrushingLoop() {
  if (brushLoopActive) return;
  brushLoopActive = true;
  isBrushing = true;
  startTime = Date.now();
  
  sendLog('🚀 安全挂机心跳循环已启动，当前为单视频串行心跳模式...', 'success');

  // 开启运行时间计时器
  if (elapsedIntervalId) clearInterval(elapsedIntervalId);
  elapsedIntervalId = setInterval(() => {
    sendStatusUpdate();
  }, 1000);

  function replenishActiveQueue() {
    activeTasks = activeTasks.filter(t => !t.completed);
    while (activeTasks.length < MAX_CONCURRENT_VIDEOS) {
      const nextTask = globalTasks.find(t => !t.completed && !activeTasks.includes(t));
      if (!nextTask) break;
      activeTasks.push(nextTask);
    }
  }

  try {
    while (isBrushing) {
      replenishActiveQueue();

      if (activeTasks.length === 0) {
        sendLog('🎉 恭喜！所有课程的待刷视频均已全部挂完！', 'success');
        isBrushing = false;
        break;
      }

      const tickStart = Date.now();

      for (let i = 0; i < activeTasks.length; i++) {
        if (!isBrushing) break;
        
        const task = activeTasks[i];
        task.currentWatchSecond += HEARTBEAT_INTERVAL;
        if (task.currentWatchSecond >= task.totalVideoSecond) {
          task.currentWatchSecond = task.totalVideoSecond;
        }

        const payload = {
          classroomno: task.classroomno,
          missionType: 2,
          chapterSection: task.chapterSection,
          remark: '观看视频',
          postsOffset: 0,
          postsLimit: 20,
          currentWatchSecond: task.currentWatchSecond,
          totalVideoSecond: task.totalVideoSecond,
          studentno: task.studentno
        };

        task.lastStatus = '上报心跳中...';
        sendStatusUpdate();
        sendCoursesUpdate();

        const result = await api.reportProgress(payload, sendLog);

        if (result && result.code === 200) {
          task.lastStatus = `成功 (+${HEARTBEAT_INTERVAL}s)`;
          sendLog(`[心跳] 课程【${task.classroomName}】| 章节【${task.section}】已挂机 ${task.currentWatchSecond}/${task.totalVideoSecond} 秒`, 'info');
          
          // 更新本地缓存中的对应视频进度
          updateCacheVideoProgress(api.state.userNo, task.classroomno, task.chapterSection, Math.floor(task.currentWatchSecond / 60));

          if (task.currentWatchSecond >= task.totalVideoSecond) {
            task.lastStatus = `云端验证中...`;
            sendStatusUpdate();
            sendCoursesUpdate();
            
            const classroomData = await api.getClassroomInfo(task.classroomno, sendLog);
            if (classroomData && classroomData.code === 200 && classroomData.data) {
              const updatedCw = classroomData.data.courseware.find(c => c.chapterSection === task.chapterSection);
              if (updatedCw) {
                if (updatedCw.watchVideoMinute >= task.videoMinute) {
                  task.completed = true;
                  task.lastStatus = `🎉 已完成`;
                  sendLog(`✅【完成】视频《${task.section}》已通过云端验证！`, 'success');
                  
                  // 验证通过后，确保写入最新的云端分钟数到缓存
                  updateCacheVideoProgress(api.state.userNo, task.classroomno, task.chapterSection, updatedCw.watchVideoMinute);
                } else {
                  task.lastStatus = `等待入账 (云端:${updatedCw.watchVideoMinute}/${task.videoMinute}分)`;
                  task.currentWatchSecond = task.totalVideoSecond - HEARTBEAT_INTERVAL;
                }
              } else {
                task.completed = true;
                task.lastStatus = `🎉 已完成(无定位)`;
              }
            } else {
              task.lastStatus = `❌ 验证失败，下周期重试`;
              task.currentWatchSecond = task.totalVideoSecond - HEARTBEAT_INTERVAL;
            }
          }
        } else {
          task.lastStatus = `❌ 失败 (${result ? result.msg || result.code : '无响应'})`;
          task.currentWatchSecond -= HEARTBEAT_INTERVAL; // 回退进度
          sendLog(`❌ [失败] 课程【${task.classroomName}】心跳上报失败: ${result ? result.msg : '无服务器响应'}`, 'error');
        }

        sendStatusUpdate();
        sendCoursesUpdate();

        if (i < activeTasks.length - 1) {
          await sleep(SERIAL_DELAY);
        }
      }

      const elapsedTick = Date.now() - tickStart;
      const sleepTime = Math.max(0, TICK_MS - elapsedTick);
      await sleep(sleepTime);
    }
  } catch (err) {
    sendLog('挂机循环异常终止: ' + err.message, 'error');
  } finally {
    isBrushing = false;
    brushLoopActive = false;
    if (elapsedIntervalId) {
      clearInterval(elapsedIntervalId);
      elapsedIntervalId = null;
    }
    sendStatusUpdate();
    sendLog('⏹️ 挂机已停止。', 'warning');
  }
}

// =======================================================
// 窗口管理与 IPC 管道
// =======================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 950,
    minHeight: 650,
    frame: false, // 设为无边框窗口
    title: "课程助手",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    backgroundColor: '#1e1e1e'
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 读取本地缓存配置以自动填入界面
  mainWindow.webContents.on('did-finish-load', () => {
    let savedConfig = null;
    if (fs.existsSync(path.join(baseDir, 'config.json'))) {
      try {
        savedConfig = JSON.parse(fs.readFileSync(path.join(baseDir, 'config.json'), 'utf-8'));
      } catch (e) {}
    }
    if (savedConfig) {
      mainWindow.webContents.send('saved-config', savedConfig);
    }
  });

  // 启动 3 秒后静默检查更新
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.error('检查更新失败:', err);
    });
  }, 3000);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // 彻底禁用默认菜单栏，去掉 File/Edit 等顶部栏
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 缓存更新辅助函数
function updateCacheVideoProgress(userno, classroomno, chapterSection, watchVideoMinute) {
  if (!fs.existsSync(CACHE_PATH)) return;
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    if (cache.userno === userno && cache.data && cache.data[classroomno]) {
      const courseware = cache.data[classroomno].courseware || [];
      const video = courseware.find(v => v.chapterSection === chapterSection);
      if (video) {
        video.watchVideoMinute = watchVideoMinute;
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
      }
    }
  } catch (e) {}
}

// 获取课程数据（优先读取本地缓存，缓存10天过期）
async function getClassroomsDataWithCache(classrooms, userno, forceRefresh) {
  let cache = {};
  if (fs.existsSync(CACHE_PATH)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    } catch (e) {}
  }

  const now = Date.now();
  const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

  const isCacheValid = !forceRefresh && 
                       cache.userno === userno && 
                       cache.timestamp && 
                       (now - cache.timestamp < TEN_DAYS_MS) &&
                       cache.data;

  if (isCacheValid) {
    sendLog('📅 发现 10 天内的本地课件目录缓存，已直接载入（可点击“刷新目录”手动更新）。', 'success');
    return cache.data;
  }

  sendLog(forceRefresh ? '🔄 正在强制刷新，重新从云端获取各科课件目录...' : '📅 本地缓存失效或不存在，正在从云端获取各科课件目录...', 'info');

  const fetchedData = {};
  for (let cIdx = 0; cIdx < classrooms.length; cIdx++) {
    const room = classrooms[cIdx];
    sendLog(`[${cIdx + 1}/${classrooms.length}] 正在从云端同步: ${room.roomName}...`, 'info');
    
    const infoResult = await api.getClassroomInfo(room.relationno, sendLog);
    if (!infoResult || infoResult.code !== 200 || !infoResult.data) {
      sendLog(`❌ 课程【${room.roomName}】同步进度失败，跳过。`, 'warning');
      continue;
    }
    fetchedData[room.relationno] = infoResult.data;
    await sleep(200);
  }

  // 保存到本地缓存
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify({
      userno,
      timestamp: now,
      data: fetchedData
    }, null, 2), 'utf-8');
    sendLog('💾 课件目录已成功缓存到本地。', 'success');
  } catch (e) {
    sendLog('保存课件目录缓存失败: ' + e.message, 'warning');
  }

  return fetchedData;
}

// 内部同步并缓存作业列表逻辑
async function syncHomeworkBackground() {
  let classno = null;
  try {
    if (fs.existsSync(GROUP_LIST_PATH)) {
      const groupListData = JSON.parse(fs.readFileSync(GROUP_LIST_PATH, 'utf-8'));
      const classRoom = groupListData.data.groupList.find(item => item.roomType === 'class');
      if (classRoom) {
        classno = String(classRoom.relationno);
      }
    }
  } catch (e) {}

  if (!classno) return null;

  let examProcessList = [];
  try {
    const statsResult = await api.getExamStatistics(classno, sendLog);
    if (statsResult && statsResult.code === 200 && statsResult.data && statsResult.data.examProcessList) {
      examProcessList = statsResult.data.examProcessList;
    }
  } catch (err) {}

  let classrooms = [];
  if (examProcessList.length > 0) {
    classrooms = examProcessList.map(item => ({
      classroomno: item.classroomno,
      disciplineno: item.disciplineno,
      classroomName: item.classroomName || item.disciplineName || '未知课程',
      studentno: item.studentno
    }));
  } else {
    try {
      if (fs.existsSync(CACHE_PATH)) {
        const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
        if (cache.data) {
          classrooms = Object.keys(cache.data).map(key => ({
            classroomno: key,
            disciplineno: cache.data[key].disciplineno || key,
            classroomName: cache.data[key].name || cache.data[key].desc || '未知课程',
            studentno: cache.data[key].studentno
          }));
        }
      }
    } catch (e) {}
  }

  if (classrooms.length === 0) return null;

  const results = [];
  for (let i = 0; i < classrooms.length; i++) {
    const room = classrooms[i];
    try {
      const studentno = room.studentno || api.state.userNo;
      const homework = await api.getHomeworkListInternal(classno, studentno, room.disciplineno, sendLog);
      results.push({
        classroomno: room.classroomno,
        classroomName: room.classroomName,
        studentno,
        classno,
        uncompleted: homework.uncompleted,
        completed: homework.completed
      });
      await sleep(150);
    } catch (err) {
      results.push({
        classroomno: room.classroomno,
        classroomName: room.classroomName,
        studentno: room.studentno || api.state.userNo,
        classno,
        uncompleted: [],
        completed: [],
        error: err.message
      });
    }
  }

  // 保存到本地缓存
  try {
    fs.writeFileSync(HOMEWORK_CACHE_PATH, JSON.stringify({
      userno: api.state.userNo,
      timestamp: Date.now(),
      courses: results
    }, null, 2), 'utf-8');
  } catch (e) {}

  return { success: true, courses: results };
}

// 获取并发送用户信息给渲染进程
async function fetchAndSendUserInfo() {
  const userInfoResult = await api.getUserInfo(sendLog);
  if (userInfoResult && userInfoResult.code === 200 && userInfoResult.data) {
    const uData = userInfoResult.data;
    if (uData.userno) {
      api.state.userNo = String(uData.userno);
    }
    if (uData.roles && uData.roles[0] && uData.roles[0].schoolno) {
      api.state.schoolNo = String(uData.roles[0].schoolno);
    }
    
    // 发送用户信息给渲染进程
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('user-info', {
        name: uData.studentInfo?.name || '学员',
        schoolName: uData.roles?.[0]?.schoolName || '华神教育学院',
        className: uData.roles?.[0]?.className || '默认班级',
        studentNum: uData.studentInfo?.studentDocInfo?.[0]?.studentNum || '未获取',
        avatar: uData.avatar || 'https://mgr.huashenxt.com/static/assets/img/avatar/default.jpg'
      });
    }
    return true;
  }
  return false;
}

// IPC 消息处理
ipcMain.handle('start-brushing', async (event, { loginname, pwd, remember, autoLogin: shouldAutoLogin, forceRefresh }) => {
  if (isBrushing) return { success: false, message: '挂机程序已经在运行中。' };

  // 读取本地 config.json 中的旧用户名进行对比
  let oldLoginname = '';
  try {
    const configPath = path.join(baseDir, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      oldLoginname = config.loginname || '';
    }
  } catch (e) {}

  // 如果内存中有记录，则以内存为准（防止单次运行期间重复判定）
  if (api.state.loginConfig.loginname) {
    oldLoginname = api.state.loginConfig.loginname;
  }

  // 仅在旧账号存在且与新账号不同时，判定为账号改变
  const accountChanged = oldLoginname && oldLoginname !== loginname;

  // 更新当前账号密码
  api.state.loginConfig.loginname = loginname;
  api.state.loginConfig.pwd = pwd;

  try {
    // 写入本地配置文件
    const configToSave = {
      loginname,
      pwd: remember ? pwd : '',
      remember: !!remember,
      autoLogin: !!shouldAutoLogin
    };
    fs.writeFileSync(path.join(baseDir, 'config.json'), JSON.stringify(configToSave, null, 2));
  } catch (e) {
    // 忽略写入错误
  }

  // 1. 登录验证
  sendLog('🔑 正在启动登录验证...', 'info');

  if (accountChanged) {
    sendLog('检测到登录账号发生变化，清除旧缓存与 Token...', 'info');
    api.state.accessToken = '';
    api.state.userNo = '';
    api.state.schoolNo = '';
    try {
      if (fs.existsSync(api.TOKEN_FILE_PATH)) {
        fs.unlinkSync(api.TOKEN_FILE_PATH);
      }
    } catch (e) {}
    try {
      if (fs.existsSync(CACHE_PATH)) {
        fs.unlinkSync(CACHE_PATH);
      }
    } catch (e) {}
    try {
      if (fs.existsSync(HOMEWORK_CACHE_PATH)) {
        fs.unlinkSync(HOMEWORK_CACHE_PATH);
      }
    } catch (e) {}
  }

  // 尝试从本地文件加载 Token
  if (!api.state.accessToken && fs.existsSync(api.TOKEN_FILE_PATH)) {
    try {
      api.state.accessToken = fs.readFileSync(api.TOKEN_FILE_PATH, 'utf-8').trim();
    } catch (e) {}
  }

  let loginSuccess = false;

  if (api.state.accessToken) {
    sendLog('发现本地缓存的 AccessToken，正在验证其有效性...', 'info');
    loginSuccess = await fetchAndSendUserInfo();
    if (!loginSuccess) {
      sendLog('本地 Token 已失效，将重新发起密码登录...', 'warning');
      api.state.accessToken = '';
    } else {
      sendLog('缓存 Token 验证有效，免密登录成功！', 'success');
    }
  }

  if (!loginSuccess) {
    loginSuccess = await api.autoLogin(sendLog);
    if (loginSuccess) {
      sendLog('密码登录成功，正在获取用户信息...', 'info');
      await fetchAndSendUserInfo();
    }
  }

  if (!loginSuccess) {
    return { success: false, message: '登录失败，请检查账号密码及网络连接！' };
  }

  // 2. 实时从云端 API 获取最新课程列表
  sendLog('🔄 正在实时同步最新的云端课程列表...', 'info');
  const apiResult = await api.getGroupList(api.state.userNo, sendLog);
  if (!apiResult || apiResult.code !== 200 || !apiResult.data || !apiResult.data.groupList) {
    sendLog('❌ 从云端获取课程列表失败！', 'error');
    return { success: false, message: '获取课程列表失败！' };
  }

  // 备份写入本地
  try {
    fs.writeFileSync(GROUP_LIST_PATH, JSON.stringify(apiResult, null, 2), 'utf-8');
  } catch (err) {}

  // 3. 筛选并同步各科目下未完成的课件进度
  const classrooms = apiResult.data.groupList.filter(item => item.roomType === 'classroom');
  sendLog(`发现共 ${classrooms.length} 门课程，正在获取课件及进度...`, 'info');

  globalTasks = [];
  globalCourses = [];
  let totalVideosCount = 0;

  // 获取所有课程的数据（优先使用缓存）
  const classroomsData = await getClassroomsDataWithCache(classrooms, api.state.userNo, forceRefresh);

  for (let cIdx = 0; cIdx < classrooms.length; cIdx++) {
    const room = classrooms[cIdx];
    const classroomData = classroomsData[room.relationno];
    
    if (!classroomData) {
      continue;
    }

    const coursewares = classroomData.courseware || [];
    const studentno = classroomData.studentno;

    totalVideosCount += coursewares.length;

    const courseObj = {
      classroomno: classroomData.classroomno,
      classroomName: room.roomName,
      videos: []
    };

    for (let wIdx = 0; wIdx < coursewares.length; wIdx++) {
      const item = coursewares[wIdx];
      const videoMinute = item.videoMinute || 0;
      const watchVideoMinute = item.watchVideoMinute || 0;
      const isCompleted = watchVideoMinute >= videoMinute;

      const videoObj = {
        classroomno: classroomData.classroomno,
        classroomName: room.roomName,
        studentno: studentno,
        chapterSection: item.chapterSection,
        chapter: item.chapter,
        section: item.section,
        videoMinute: videoMinute,
        watchVideoMinute: watchVideoMinute,
        currentWatchSecond: watchVideoMinute * 60,
        totalVideoSecond: videoMinute * 60,
        completed: isCompleted,
        lastStatus: isCompleted ? '已完成' : '等待中'
      };

      courseObj.videos.push(videoObj);

      if (!isCompleted) {
        globalTasks.push(videoObj);
      }
    }

    globalCourses.push(courseObj);
  }

  sendLog(`同步完毕。总课件数: ${totalVideosCount} | 待刷视频数: ${globalTasks.length}`, 'info');
  sendCoursesUpdate();

  // 4. 启动后台挂机心跳循环
  startBrushingLoop();

  // 5. 登录完成之后立即异步拉取最新作业并广播给前端
  setTimeout(async () => {
    try {
      sendLog('🔄 [后台同步] 登录成功，正在自动同步最新作业列表...', 'info');
      const homeworkResult = await syncHomeworkBackground();
      if (homeworkResult && homeworkResult.success) {
        sendLog('✅ [后台同步] 最新作业列表同步完成！', 'success');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('homework-update', homeworkResult.courses);
        }
      }
    } catch (e) {
      sendLog('后台同步作业失败: ' + e.message, 'warning');
    }
  }, 500);

  if (globalTasks.length === 0) {
    sendLog('🎉 您的所有视频课件都已播放完毕，不需要进行挂机！', 'success');
    return { success: true, message: '所有课程已完成！无需挂机。', finished: true };
  }

  return { success: true, message: '挂机已启动！' };
});

ipcMain.handle('stop-brushing', async () => {
  if (!isBrushing) return { success: false, message: '当前没有正在运行的挂机任务。' };
  isBrushing = false;
  return { success: true, message: '停止挂机指令已发送。' };
});

// =======================================================
// 📝 作业与答题管理接口
// =======================================================

// IPC 接口：获取所有课程的作业列表
ipcMain.handle('get-homework-list', async (event, { forceRefresh } = {}) => {
  // 1. 解析班级编号 (classno)
  let classno = null;
  try {
    if (fs.existsSync(GROUP_LIST_PATH)) {
      const groupListData = JSON.parse(fs.readFileSync(GROUP_LIST_PATH, 'utf-8'));
      const classRoom = groupListData.data.groupList.find(item => item.roomType === 'class');
      if (classRoom) {
        classno = String(classRoom.relationno);
      }
    }
  } catch (e) {}

  // 如果不强制刷新，且存在本地缓存，优先从本地缓存读取并立即返回
  if (!forceRefresh && fs.existsSync(HOMEWORK_CACHE_PATH)) {
    try {
      const cachedData = JSON.parse(fs.readFileSync(HOMEWORK_CACHE_PATH, 'utf-8'));
      // 校验缓存的用户编号，如果当前已登录且不匹配则不使用缓存
      if (!api.state.userNo || cachedData.userno === api.state.userNo) {
        sendLog('📅 已从本地缓存加载作业列表。', 'success');
        return { success: true, courses: cachedData.courses, fromCache: true };
      } else {
        sendLog('发现不同账号的作业缓存，将重新从云端获取。', 'info');
      }
    } catch (e) {
      sendLog('读取作业缓存失败，将从云端获取。', 'warning');
    }
  }

  if (!classno) {
    return { success: false, message: '未找到班级编号(classno)，请先登录。', notLoggedIn: true };
  }

  sendLog('🔄 正在从云端实时同步作业列表...', 'info');
  const syncResult = await syncHomeworkBackground();
  if (syncResult && syncResult.success) {
    sendLog('✅ 所有课程的作业同步完成！', 'success');
    return syncResult;
  } else {
    return { success: false, message: '同步作业失败，未找到班级或课程。' };
  }
});

// IPC 接口：获取单项作业的详细题目与正确答案
ipcMain.handle('get-homework-info', async (event, examno) => {
  try {
    sendLog(`🔄 正在获取作业题目，作业编号: ${examno}...`, 'info');
    const result = await api.getHomeworkInfoInternal(examno, sendLog);
    if (result && result.code === 200) {
      sendLog(`✅ 作业题目获取成功！`, 'success');
      return { success: true, data: result.data };
    } else {
      sendLog(`❌ 获取作业题目失败: ${result ? result.msg : '未知错误'}`, 'error');
      return { success: false, message: result ? result.msg : '获取作业详情失败' };
    }
  } catch (err) {
    sendLog(`❌ 获取作业题目异常: ${err.message}`, 'error');
    return { success: false, message: err.message };
  }
});

// IPC 接口：一键提交作业答案
ipcMain.handle('submit-homework', async (event, { examno, studentno, answers }) => {
  try {
    sendLog(`🔄 正在提交作业答案，作业编号: ${examno}...`, 'info');
    const result = await api.submitHomework(examno, studentno, answers, sendLog);
    if (result && result.code === 200) {
      sendLog(`✅ 作业答案提交成功！`, 'success');
      return { success: true };
    } else {
      sendLog(`❌ 提交作业答案失败: ${result ? result.msg : '未知错误'}`, 'error');
      return { success: false, message: result ? result.msg : '提交作业答案失败' };
    }
  } catch (err) {
    sendLog(`❌ 提交作业答案异常: ${err.message}`, 'error');
    return { success: false, message: err.message };
  }
});

// 窗口控制 IPC 监听
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});
ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// =======================================================
// 自动更新管理逻辑
// =======================================================
autoUpdater.autoDownload = true; // 自动下载可用更新
autoUpdater.logger = console;

autoUpdater.on('checking-for-update', () => {
  sendLog('🔍 正在检查软件更新...', 'info');
});

autoUpdater.on('update-available', (info) => {
  sendLog(`✨ 发现新版本 v${info.version}，正在后台自动下载中...`, 'success');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', () => {
  sendLog('当前已是最新版本。', 'info');
});

autoUpdater.on('error', (err) => {
  sendLog('检查更新失败: ' + err.message, 'error');
});

autoUpdater.on('download-progress', (progressObj) => {
  const percent = progressObj.percent.toFixed(1);
  const speed = (progressObj.bytesPerSecond / 1024).toFixed(1);
  sendLog(`⏳ 正在下载更新: ${percent}% (${speed} KB/s)`, 'info');
});

autoUpdater.on('update-downloaded', (info) => {
  sendLog(`🎉 新版本 v${info.version} 已下载完成！重启后将自动安装。`, 'success');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});

// 监听前端重启安装的指令
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});
