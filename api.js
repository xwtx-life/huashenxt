const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const isPackaged = app ? app.isPackaged : false;
const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;
const TOKEN_FILE_PATH = path.join(baseDir, 'token.txt');

function md5(text) {
  if (!text) return '';
  return crypto.createHash('md5').update(text).digest('hex').toLowerCase();
}

const state = {
  accessToken: '',
  userNo: '',
  schoolNo: '',
  loginConfig: {
    enabled: true,
    loginname: "",
    pwd: ""
  }
};

// 在程序启动时尝试从本地加载 Token 缓存
try {
  if (fs.existsSync(TOKEN_FILE_PATH)) {
    state.accessToken = fs.readFileSync(TOKEN_FILE_PATH, 'utf-8').trim();
  }
} catch (e) {}

// 动态获取请求头
function getHeaders() {
  return {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,en-GB;q=0.6,ja;q=0.5',
    'accesstoken': state.accessToken,
    'applocalinfo': '{"AppId":"hsedu_mgr","AppVersion":"1.7.6","Browser":"chrome","BrowserVersion":"149.0.0.0"}',
    'content-type': 'application/json;charset=UTF-8',
    'origin': 'https://witcj.huashenxt.com',
    'priority': 'u=1, i',
    'sec-ch-ua': '"Chromium";v="149", "Microsoft Edge";v="149", "Not/A)Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'solutionno': '2006180000002',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0'
  };
}

// 自动登录获取最新的 AccessToken
async function autoLogin(sendLog) {
  if (!state.loginConfig.enabled) return false;

  const url = 'https://apimh.huashenxt.com/userLogin';
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,en-GB;q=0.6,ja;q=0.5',
    'applocalinfo': '{"AppId":"hsedu_home","AppVersion":"1.7.5","Browser":"chrome","BrowserVersion":"148.0.0.0","Geohash":"wtj3by0rhw5b"}',
    'content-type': 'application/json',
    'origin': 'https://witcj.huashenxt.com',
    'solutionno': '2006180000002',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0'
  };
  const body = {
    loginname: state.loginConfig.loginname,
    pwd: md5(state.loginConfig.pwd),
    ipBlockVerificationCode: "",
    schoolno: state.schoolNo || ""
  };

  try {
    sendLog('正在向云端发起自动登录...', 'info');
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      sendLog(`自动登录失败! HTTP状态码: ${response.status}`, 'error');
      return false;
    }
    const result = await response.json();
    
    if (result && result.code === 200 && result.data && result.data.reports && result.data.reports[0] && result.data.reports[0].accessToken) {
      const report = result.data.reports[0];
      state.accessToken = report.accessToken;

      const detectedUserno = report.userno || report.userNo || report.studentno || (result.data.user && (result.data.user.userno || result.data.user.userNo));
      if (detectedUserno) {
        state.userNo = String(detectedUserno);
      }

      // 持久化到本地文件
      try {
        fs.writeFileSync(TOKEN_FILE_PATH, state.accessToken, 'utf-8');
      } catch (err) {
        sendLog('保存 token.txt 本地缓存失败: ' + err.message, 'warning');
      }

      // 核心：通过 getUserInfo 接口动态获取/修正真实的 userno 和 schoolno
      const userInfoResult = await getUserInfo(sendLog);
      if (userInfoResult && userInfoResult.code === 200 && userInfoResult.data) {
        const uData = userInfoResult.data;
        if (uData.userno) {
          state.userNo = String(uData.userno);
        }
        if (uData.roles && uData.roles[0] && uData.roles[0].schoolno) {
          state.schoolNo = String(uData.roles[0].schoolno);
        }
      }

      return true;
    } else {
      sendLog('自动登录失败，服务器返回数据格式不正确: ' + JSON.stringify(result), 'error');
      return false;
    }
  } catch (error) {
    sendLog('自动登录请求异常: ' + error.message, 'error');
    return false;
  }
}

// 获取当前登录用户的信息
async function getUserInfo(sendLog) {
  const url = 'https://apicj.huashenxt.com/users/systemController/getUserInfo';
  try {
    const response = await fetch(url, { headers: getHeaders() });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    sendLog('获取用户信息异常: ' + error.message, 'error');
    return null;
  }
}

// 从云端获取课程列表
async function getGroupList(userno, sendLog) {
  const url = `https://apicj.huashenxt.com/users/communicationController/getGroupList?userno=${userno}`;
  try {
    const response = await fetch(url, { headers: getHeaders() });
    
    if (!response.ok) {
      if (response.status === 401) {
        sendLog('[401] 获取课程列表时登录失效，正在尝试重新自动登录...', 'warning');
        const success = await autoLogin(sendLog);
        if (success) {
          return await getGroupList(userno, sendLog);
        }
      }
      return null;
    }
    
    const result = await response.json();
    if (result && result.code === 401) {
      sendLog('获取课程列表时登录失效 (code 401)，正在尝试重新自动登录...', 'warning');
      const success = await autoLogin(sendLog);
      if (success) {
        return await getGroupList(userno, sendLog);
      }
    }
    return result;
  } catch (error) {
    sendLog('获取课程列表请求异常: ' + error.message, 'error');
    return null;
  }
}

// 获取单个课程的详细课件信息
async function getClassroomInfo(classroomno, sendLog) {
  const url = `https://apicj.huashenxt.com/users/teachingprocController/getClassroomInfo?classroomno=${classroomno}`;
  try {
    const response = await fetch(url, { headers: getHeaders() });
    
    if (!response.ok) {
      sendLog(`[同步失败] 课程编号 ${classroomno} 请求失败，HTTP 状态码: ${response.status}`, 'error');
      if (response.status === 401) {
        sendLog(`[401] 同步课件时登录失效，尝试重新自动登录...`, 'warning');
        const success = await autoLogin(sendLog);
        if (success) {
          return await getClassroomInfo(classroomno, sendLog);
        }
      }
      return null;
    }
    
    const result = await response.json();
    if (result && result.code === 401) {
      sendLog(`同步课件时登录失效 (code 401)，尝试重新自动登录...`, 'warning');
      const success = await autoLogin(sendLog);
      if (success) {
        return await getClassroomInfo(classroomno, sendLog);
      }
    }
    return result;
  } catch (error) {
    sendLog(`[同步异常] 课程编号 ${classroomno} 请求发生异常: ${error.message}`, 'error');
    return null;
  }
}

// 上报视频播放进度
async function reportProgress(payload, sendLog) {
  const url = 'https://apicj.huashenxt.com/users/teachingprocController/classroomMissionAdd';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      if (response.status === 401) {
        sendLog(`[401] 心跳上报时登录失效，尝试重新自动登录...`, 'warning');
        const success = await autoLogin(sendLog);
        if (success) {
          return await reportProgress(payload, sendLog);
        }
      }
      return { code: -1, msg: `HTTP 错误 ${response.status}` };
    }

    const result = await response.json();
    if (result && result.code === 401) {
      sendLog(`心跳上报时登录失效 (code 401)，尝试重新自动登录...`, 'warning');
      const success = await autoLogin(sendLog);
      if (success) {
        return await reportProgress(payload, sendLog);
      }
    }
    return result;
  } catch (error) {
    return { code: -1, msg: error.message };
  }
}

// 内部获取作业列表逻辑
async function getHomeworkListInternal(classno, studentno, disciplineno, sendLog) {
  const urlUncompleted = `https://apicj.huashenxt.com/users/teachingprocController/getExamList?exerciseType=2&querySpecialType=1&classno=${classno}&studentno=${studentno}&disciplineno=${disciplineno}&offset=0&limit=50`;
  const urlCompleted = `https://apicj.huashenxt.com/users/teachingprocController/getExamList?exerciseType=2&querySpecialType=2&classno=${classno}&studentno=${studentno}&disciplineno=${disciplineno}&offset=0&limit=50`;
  
  const fetchList = async (url) => {
    const response = await fetch(url, { headers: getHeaders() });
    if (!response.ok) {
      if (response.status === 401) {
        sendLog('[401] 获取作业列表时登录失效，正在尝试重新自动登录...', 'warning');
        const success = await autoLogin(sendLog);
        if (success) {
          return await fetchList(url);
        }
      }
      throw new Error(`HTTP 错误 ${response.status}`);
    }
    const result = await response.json();
    if (result && result.code === 401) {
      sendLog('获取作业列表时登录失效 (code 401)，正在尝试重新自动登录...', 'warning');
      const success = await autoLogin(sendLog);
      if (success) {
        return await fetchList(url);
      }
    }
    return result;
  };

  const [uncompletedRes, completedRes] = await Promise.all([
    fetchList(urlUncompleted),
    fetchList(urlCompleted)
  ]);

  return {
    uncompleted: (uncompletedRes && uncompletedRes.code === 200 && uncompletedRes.data && uncompletedRes.data.examList) || [],
    completed: (completedRes && completedRes.code === 200 && completedRes.data && completedRes.data.examList) || []
  };
}

// 获取作业统计 (包含有作业的科目列表)
async function getExamStatistics(classno, sendLog) {
  const url = `https://apicj.huashenxt.com/users/teachingprocController/getExamStatistics?isHomeworkStatistics=1&classno=${classno}&offset=0&limit=50`;
  const response = await fetch(url, { headers: getHeaders() });
  if (!response.ok) {
    if (response.status === 401) {
      sendLog('[401] 获取作业统计时登录失效，正在尝试重新自动登录...', 'warning');
      const success = await autoLogin(sendLog);
      if (success) {
        return await getExamStatistics(classno, sendLog);
      }
    }
    throw new Error(`HTTP 错误 ${response.status}`);
  }
  const result = await response.json();
  if (result && result.code === 401) {
    sendLog('获取作业统计时登录失效 (code 401)，正在尝试重新自动登录...', 'warning');
    const success = await autoLogin(sendLog);
    if (success) {
      return await getExamStatistics(classno, sendLog);
    }
  }
  return result;
}

// 提交作业答案
async function submitHomework(examno, studentno, answers, sendLog) {
  const url = 'https://apicj.huashenxt.com/users/teachingprocController/addExamAnswer';
  const body = {
    examno,
    studentno,
    answer: answers
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    if (response.status === 401) {
      sendLog('[401] 提交作业时登录失效，正在尝试重新自动登录...', 'warning');
      const success = await autoLogin(sendLog);
      if (success) {
        return await submitHomework(examno, studentno, answers, sendLog);
      }
    }
    throw new Error(`HTTP 错误 ${response.status}`);
  }
  const result = await response.json();
  if (result && result.code === 401) {
    sendLog('提交作业时登录失效 (code 401)，正在尝试重新自动登录...', 'warning');
    const success = await autoLogin(sendLog);
    if (success) {
      return await submitHomework(examno, studentno, answers, sendLog);
    }
  }
  return result;
}

// 内部获取作业详情逻辑
async function getHomeworkInfoInternal(examno, sendLog) {
  const url = `https://apicj.huashenxt.com/users/teachingprocController/getExamInfo?examno=${examno}`;
  
  const response = await fetch(url, { headers: getHeaders() });
  if (!response.ok) {
    if (response.status === 401) {
      sendLog('[401] 获取作业详情时登录失效，正在尝试重新自动登录...', 'warning');
      const success = await autoLogin(sendLog);
      if (success) {
        return await getHomeworkInfoInternal(examno, sendLog);
      }
    }
    throw new Error(`HTTP 错误 ${response.status}`);
  }
  const result = await response.json();
  if (result && result.code === 401) {
    sendLog('获取作业详情时登录失效 (code 401)，正在尝试重新自动登录...', 'warning');
    const success = await autoLogin(sendLog);
    if (success) {
      return await getHomeworkInfoInternal(examno, sendLog);
    }
  }
  return result;
}

module.exports = {
  state,
  TOKEN_FILE_PATH,
  md5,
  getHeaders,
  autoLogin,
  getUserInfo,
  getGroupList,
  getClassroomInfo,
  reportProgress,
  getHomeworkListInternal,
  getHomeworkInfoInternal,
  getExamStatistics,
  submitHomework
};
