// public/hands.js
// 使用 MediaPipe Hands 进行手势识别
// 暴露全局变量 window.handGesture 供 sketch.js 读取

// 全局手势状态
window.handGesture = {
  type: null, // "finger" | "fist" | null
  x: 0,
  y: 0
};

let videoElement = null;
let hands = null;
let camera = null;

window.initHandGesture = function(videoId) {
  videoElement = document.getElementById(videoId);

  hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5
  });

  hands.onResults(onResults);

  if (videoElement) {
    camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480
    });
    camera.start();
    console.log("Camera started for gestures.");
  }
};

function onResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    window.handGesture.type = null;
    return;
  }

  const landmarks = results.multiHandLandmarks[0];

  // 1. 判断手势类型
  // 简单算法：计算指尖(TIP)到指根(MCP)的距离，判断手指是否弯曲
  
  // 食指：8(TIP) 到 5(MCP)
  const indexExtended = isFingerExtended(landmarks, 8, 5);
  // 中指：12 到 9
  const middleExtended = isFingerExtended(landmarks, 12, 9);
  // 无名指：16 到 13
  const ringExtended = isFingerExtended(landmarks, 16, 13);
  // 小指：20 到 17
  const pinkyExtended = isFingerExtended(landmarks, 20, 17);

  // 逻辑：
  // 拳头：所有手指（除了拇指，拇指比较灵活）都弯曲
  // 单指：食指伸直，其他手指（中、无名、小）弯曲
  
  let gesture = null;

  if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    gesture = "fist";
  } else if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    gesture = "finger";
  } else {
    // 其它情况（如张开手掌）暂不处理，或者视为 null
    gesture = null; 
  }

  // 2. 计算坐标
  // 如果是 Finger，用食指指尖(8)
  // 如果是 Fist，用掌心(9 或 0)
  let targetLm = (gesture === "finger") ? landmarks[8] : landmarks[9];

  // 3. 映射到窗口坐标
  // 注意：摄像头通常是镜像的，所以 x = 1 - x
  if (gesture) {
    window.handGesture.type = gesture;
    window.handGesture.x = (1 - targetLm.x) * window.innerWidth;
    window.handGesture.y = targetLm.y * window.innerHeight;
  } else {
    window.handGesture.type = null;
  }
}

// 辅助：判断手指是否伸直（指尖到手腕距离 > 指关节到手腕距离）
// 或者更简单：指尖y < 指关节y (手掌向上时)。
// 这里用向量长度比较更稳健：
function isFingerExtended(landmarks, tipIdx, mcpIdx) {
  // 简单的几何判断：
  // 如果指尖到手腕(0)的距离 > 指关节(MCP)到手腕的距离，这对于握拳判断通常有效
  const wrist = landmarks[0];
  const tip = landmarks[tipIdx];
  const mcp = landmarks[mcpIdx];

  const dTip = dist(tip.x, tip.y, wrist.x, wrist.y);
  const dMcp = dist(mcp.x, mcp.y, wrist.x, wrist.y);
  
  // 阈值系数，指尖通常比指关节远很多
  return dTip > dMcp * 1.2; 
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2-x1)**2 + (y2-y1)**2);
}