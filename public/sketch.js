// public/sketch.js
// Life soup (p5.js) — 8 emotions + slow growth + Hand Gestures

let gestureType = null     
let gesturePos = null      
let activePaths = []       

let noiseScale, baseStrength, stepSize, seedSpacing, canvasMargin, sizeMult
let zones = []
let palettes = [
  ["#03071e","#370617","#6a040f","#9d0208","#d00000","#dc2f02","#e85d04","#f48c06","#faa307","#ffba08"],
  ["#e5c679","#000807","#357266","#ed6a5e","#4ce0b3","#cfa5b4","#eae8ff","#b0d7ff","#61f2c2"],
  ["#3d2d1c","#30633d","#123c69","#1d58ab","#72c0ed","#fdefc0","#ffdf7c","#feb640","#d97b38","#a46379"],
  ["#080f0f","#2c4a73","#426c85","#4e6baa","#5c59c9","#c33b1e","#f07d23","#ffcc33","#fff1a1","#f1f5f8"],
  ["#d8f3dc","#b7e4c7","#95d5b2","#74c69d","#52b788","#40916c","#2d6a4f","#1b4332","#081c15"],
  ["#072ac8","#1360e2","#1e96fc","#60b6fb","#a2d6f9","#cfe57d","#fcf300","#fedd00","#ffc600","#ffcb17"],
  ["#ff61ab","#ff6176","#ff8161","#ffb561","#ffea62","#dfff61","#abff61","#76ff61","#61ff81","#61ffb5"],
  ["#006466","#065a60","#0b525b","#144552","#1b3a4b","#212f45","#272640","#312244","#3e1f47","#4d194d"],
  ["#ff5400","#ff6d00","#ff8500","#ff9100","#ff9e00","#00b4d8","#0096c7","#0077b6","#023e8a","#03045e"],
  ["#71093b","#990b52","#cb8b15","#eaaa34","#ffffff","#f1f4f9","#749ed2","#467ec3","#023578","#022450"],
]

let palette
let basePairColors
let colorPool
let colorVariationCache = new Map()

// ======== slow growth controls ========
let currentEmotion = "喜悦"
let pendingPaths = []
let drawCursor = 0
let emotionSeed = 12345

// ✅ 用于“强度 → 密度”控制（默认 1）
let drawFractionMul = 1.0

// ====== semantic state (from Moonshot) ======
let semanticEmotion = null     
let semanticIntensity = 0.5    

// ====== Hand Gesture State & Eraser ======
let fingerPath = []; 
let bgSnapshot = null; // ✅ 新增：用于存储干净的背景截图

function applySemanticBias(emotion, intensity) {
  semanticEmotion = emotion
  semanticIntensity = constrain(Number(intensity ?? 0.5), 0, 1)
  if (emotion) setEmotion(emotion)
}

window.applySemanticFromOutside = (emotion, intensity) => {
  applySemanticBias(emotion, intensity)
}

const HELIXES_PER_FRAME = 1
const TARGET_FPS = 30
const GROW_PAUSE_FRAMES = 0

const PARAM_RANGES = {
  basePairCircleSize: [1.5, 3.5],
  sizeMult: [1.2, 2.5],
  noiseScale: [0.002, 0.04],
  baseStrength: [0.8, 1.8],
  lineLength: [100, 280],
  stepSize: [1.5, 5],
  seedSpacing: [40, 80],
  drawFraction: [0.6, 0.95],
  numZones: [5, 30],
  zoneRadius: [0.15, 0.42],
  zoneStrength: [1.5, 3.5],
  zoneMargin: 0.15,
  canvasMargin: [0.05, 0.1],
  helixSampleStep: [4, 20],
  torsion: [0.015, 0.08],
  helixRadius: [6, 14],
  dashLength: [18, 50],
  gapLength: [2, 10],
  radiusNoiseScale: [0.03, 0.08],
  rungSkipChance: [0.02, 0.1],
  numStrandStrokes: [4, 12],
  strandStrokeOffset: [1, 4],
  strandEndExtrapolation: [5, 40],
  strandEndExtrapolationPoints: [2, 20],
  numSploshCircles: [10, 20],
  sploshOffsetRange: [0.2, 0.9],
  sploshSizeVariation: [0.5, 1.3],
  sploshAlphaRange: [0.06, 0.22],
  backgroundGradientOpacity: [0.35, 0.75],
  frameWidth: [20, 50],
}

function splineVertex(x, y) { curveVertex(x, y) }

function hexToP5Color(hexStr) { return color(hexStr) }
function colorToHexStr(c) {
  return "#" + hex(int(red(c)), 2) + hex(int(green(c)), 2) + hex(int(blue(c)), 2)
}

function buildColorVariations(hexStr) {
  if (colorVariationCache.has(hexStr)) return colorVariationCache.get(hexStr)
  let variations = []
  let base = hexToP5Color(hexStr)
  let h0 = hue(base), s0 = saturation(base), l0 = lightness(base)
  let n = 28
  for (let i = 0; i < n; i++) {
    let a = random(0.2, 0.7)
    let h = (h0 + random(-25, 25) + 360) % 360
    let s = constrain(s0 + random(-12, 18), 0, 100)
    let l = constrain(l0 + random(-12, 18), 0, 100)
    let c = color(h, s, l, a)
    variations.push(c.toString())
  }
  colorVariationCache.set(hexStr, variations)
  return variations
}

function buildSploshColorVariations(hexStr) {
  let k = hexStr + "_splosh"
  if (colorVariationCache.has(k)) return colorVariationCache.get(k)
  let variations = []
  let base = hexToP5Color(hexStr)
  let h0 = hue(base), s0 = saturation(base), l0 = lightness(base)
  let [alphaMin, alphaMax] = PARAM_RANGES.sploshAlphaRange
  let n = 20
  for (let i = 0; i < n; i++) {
    let a = random(alphaMin, alphaMax)
    let h = (h0 + random(-10, 10) + 360) % 360
    let s = constrain(s0 + random(-10, 10), 0, 100)
    let l = constrain(l0 + random(-10, 10), 0, 100)
    let c = color(h, s, l, a)
    variations.push(c.toString())
  }
  colorVariationCache.set(k, variations)
  return variations
}

function getStrandStrokeColor(baseColor) {
  let hexStr = colorToHexStr(baseColor)
  let variations = buildColorVariations(hexStr)
  return color(random(variations))
}
function getSploshColor(baseColor) {
  let hexStr = colorToHexStr(baseColor)
  let variations = buildSploshColorVariations(hexStr)
  return color(random(variations))
}

const EMOTIONS = ["喜悦","信任","愤怒","惊讶","期待","悲伤","恐惧","厌恶"]
const EMOTION_TO_PALETTE_INDEX = {
  "喜悦": 6, "信任": 8, "愤怒": 0, "惊讶": 5,
  "期待": 1, "悲伤": 3, "恐惧": 7, "厌恶": 4,   
}

function emotionToSeed(name) {
  let s = 0
  for (let i = 0; i < name.length; i++) s = (s * 131 + name.charCodeAt(i)) >>> 0
  return 10000 + (s % 900000)
}

let uiButtons = []
function makeUI() {
  for (let b of uiButtons) b.remove()
  uiButtons = []
  let x = 16, y = 16
  for (let e of EMOTIONS) {
    let btn = createButton(e)
    btn.position(x, y)
    btn.style("padding", "8px 12px")
    btn.style("margin-right", "8px")
    btn.style("border-radius", "10px")
    btn.style("border", "1px solid rgba(0,0,0,0.18)")
    btn.style("background", e === currentEmotion ? "#111" : "#fff")
    btn.style("color", e === currentEmotion ? "#fff" : "#111")
    btn.style("font-size", "14px")
    btn.mousePressed(() => setEmotion(e))
    uiButtons.push(btn)
    x += 72
  }
}

function refreshUIButtonStyles() {
  for (let b of uiButtons) {
    let label = b.elt.innerText
    b.style("background", label === currentEmotion ? "#111" : "#fff")
    b.style("color", label === currentEmotion ? "#fff" : "#111")
  }
}

function setEmotion(e) {
  currentEmotion = e
  refreshUIButtonStyles()
  regenerateScene()
}

function setup() {
  createCanvas(windowWidth, windowHeight)
  colorMode(HSL, 360, 100, 100, 1)
  frameRate(TARGET_FPS)
  noiseDetail(4, 0.5)
  makeUI()
  regenerateScene()
}

function draw() {
  handleGestures();

  if (drawCursor >= pendingPaths.length) return

  if (GROW_PAUSE_FRAMES > 0) {
    if (frameCount % (GROW_PAUSE_FRAMES + 1) !== 0) return
  }

  let count = 0
  while (count < HELIXES_PER_FRAME && drawCursor < pendingPaths.length) {
    let path = pendingPaths[drawCursor++]
    randomSeed(emotionSeed + drawCursor * 17)
    noiseSeed(emotionSeed + drawCursor * 29)
    drawSinglePath(path)
    count++
  }
}

function drawSinglePath(path) {
  let sampleStep = random(...PARAM_RANGES.helixSampleStep) * sizeMult
  let torsion = random(...PARAM_RANGES.torsion) / sizeMult
  let helixRadius = random(...PARAM_RANGES.helixRadius) * sizeMult
  let pool = colorPool.length ? colorPool : palette
  let strandColor = color(random(pool))

  drawHelix(path, sampleStep, torsion, helixRadius, strandColor)
}

// ✅ 修改：手势处理函数
function handleGestures() {
  if (!window.handGesture) return;

  const { type, x, y } = window.handGesture;

  if (type === "fist") {
    // === 拳头：还原背景（看起来像擦除） ===
    fingerPath = []; 
    
    // 如果有背景截图，就画回对应部分
    if (bgSnapshot) {
      let r = 50 * sizeMult; // 擦除半径
      
      // 保存绘图上下文状态
      drawingContext.save();
      
      // 创建圆形裁剪区域
      drawingContext.beginPath();
      drawingContext.arc(x, y, r, 0, 2 * Math.PI);
      drawingContext.clip();
      
      // 将背景图对应部分画上去
      // image(img, dx, dy, dWidth, dHeight, sx, sy, sWidth, sHeight)
      // 我们只画 x,y 周围 2r 宽高的那一小块图，保持性能
      let d = r * 2;
      image(bgSnapshot, x - r, y - r, d, d, x - r, y - r, d, d);
      
      drawingContext.restore();
    }

  } else if (type === "finger") {
    // === 单指：生长 ===
    fingerPath.push({ x, y });
    if (fingerPath.length > 4) {
      let pLast = fingerPath[fingerPath.length-1];
      let pPrev = fingerPath[fingerPath.length-2];
      
      // 累积一定长度后生成一段 Helixes
      if (fingerPath.length % 5 === 0) {
        let segment = fingerPath.slice(-6); 
        randomSeed(frameCount + x + y);
        drawSinglePath(segment);
      }
    }
  } else {
    if (fingerPath.length > 0) {
       fingerPath = [];
    }
  }
}

function mousePressed() { }

function windowResized() {
  resizeCanvas(windowWidth, windowHeight)
  regenerateScene()
}

function regenerateScene() {
  emotionSeed = emotionToSeed(currentEmotion)
  randomSeed(emotionSeed)
  noiseSeed(emotionSeed)

  drawFractionMul = 1.0

  let idx = EMOTION_TO_PALETTE_INDEX[currentEmotion] ?? 0
  palette = palettes[idx]

  generateParameters()
  generateZones()

  const t = semanticIntensity ?? 0.5     
  const k = 0.35 + 0.65 * t              

  seedSpacing *= (1.15 - 0.35 * k)       
  drawFractionMul = (0.70 + 0.40 * k)    
  baseStrength *= (0.85 + 0.55 * k)      
  noiseScale *= (0.85 + 0.90 * k)        
  stepSize *= (0.90 + 0.35 * k)          

  for (let z of zones) z.strength *= (0.90 + 0.55 * k)

  drawGradientBackground(palette)
  drawFrame()

  // ✅ 核心修改：生成完背景后，立刻截取保存
  bgSnapshot = get(); 

  let shuffled = [...palette]
  shuffle(shuffled, true)
  let chosen = shuffled.slice(0, min(4, shuffled.length))

  basePairColors =
    chosen.length >= 4
      ? [[color(chosen[0]), color(chosen[1])], [color(chosen[2]), color(chosen[3])]]
      : chosen.length >= 2
        ? [[color(chosen[0]), color(chosen[1])]]
        : [[color(chosen[0]), color(chosen[0])]]

  colorPool = shuffled.slice(min(4, shuffled.length))

  colorVariationCache.clear()
  for (let h of palette) {
    buildColorVariations(h)
    buildSploshColorVariations(h)
  }

  pendingPaths = preparePathsForCurrentEmotion()
  drawCursor = 0
}

function drawFrame() {
  let fw = random(...PARAM_RANGES.frameWidth)
  noStroke()
  fill(0, 0, 100, 1)
  rect(0, 0, width, fw)
  rect(0, height - fw, width, fw)
  rect(0, 0, fw, height)
  rect(width - fw, 0, fw, height)
}

function preparePathsForCurrentEmotion() {
  let marginX = width * canvasMargin
  let marginY = height * canvasMargin
  let seedPoints = []

  for (let x = -marginX; x <= width + marginX; x += seedSpacing) {
    for (let y = -marginY; y <= height + marginY; y += seedSpacing) {
      let jitterX = random(-seedSpacing * 0.3, seedSpacing * 0.3)
      let jitterY = random(-seedSpacing * 0.3, seedSpacing * 0.3)
      seedPoints.push({ x: x + jitterX, y: y + jitterY })
    }
  }

  let lenMin = PARAM_RANGES.lineLength[0] * sizeMult
  let lenMax = PARAM_RANGES.lineLength[1] * sizeMult
  let allPaths = []

  for (let seed of seedPoints) {
    let strandLength = random(lenMin, lenMax)
    let path = buildFullPath(seed, strandLength)
    if (path && path.length >= 2) allPaths.push(path)
  }

  shuffle(allPaths, true)

  let drawFraction =
    random(...PARAM_RANGES.drawFraction) *
    (typeof drawFractionMul === "number" ? drawFractionMul : 1.0)

  drawFraction = constrain(drawFraction, 0.15, 0.98)

  let toDraw = max(1, floor(allPaths.length * drawFraction))
  return allPaths.slice(0, toDraw)
}

function generateParameters() {
  sizeMult = random(...PARAM_RANGES.sizeMult)
  let r = random() ** 2
  noiseScale = map(r, 0, 1, ...PARAM_RANGES.noiseScale)
  baseStrength = random(...PARAM_RANGES.baseStrength)
  stepSize = random(...PARAM_RANGES.stepSize) * sizeMult
  seedSpacing = random(...PARAM_RANGES.seedSpacing) * sizeMult
  canvasMargin = random(...PARAM_RANGES.canvasMargin)
}

function createZoneFn(type, cx, cy, radius) {
  switch (type) {
    case "sinusoidal": {
      let freq = random(0.008, 0.025)
      return (x, y) => ({
        x: sin((x - cx) * freq) * 1.5 + cos((y - cy) * freq) * 0.5,
        y: cos((x - cx) * freq) * 0.5 - sin((y - cy) * freq) * 1.5,
      })
    }
    case "linear": {
      let angle = random(TWO_PI)
      return () => ({ x: cos(angle), y: sin(angle) })
    }
    case "vortex": {
      let cw = random() < 0.5 ? 1 : -1
      return (x, y) => {
        let dx = x - cx
        let dy = y - cy
        let rr = sqrt(dx * dx + dy * dy) || 0.001
        rr = max(rr, 10 * sizeMult)
        return { x: cw * (-dy / rr), y: cw * (dx / rr) }
      }
    }
    case "radial": {
      let outward = random() < 0.5 ? 1 : -1
      return (x, y) => {
        let dx = x - cx
        let dy = y - cy
        let rr = sqrt(dx * dx + dy * dy) || 0.001
        return { x: outward * (dx / rr), y: outward * (dy / rr) }
      }
    }
    case "dipole": {
      let poleAngle = random(TWO_PI)
      let poleDirX = cos(poleAngle)
      let poleDirY = sin(poleAngle)
      const centerlineFalloff = 0.15
      let fn = (x, y) => {
        let dx = x - cx
        let dy = y - cy
        let along = dx * poleDirX + dy * poleDirY
        return {
          x: (along > 0 ? -1 : 1) * poleDirX,
          y: (along > 0 ? -1 : 1) * poleDirY,
        }
      }
      let attenuation = (x, y) => {
        if (!radius) return 1
        let dx = x - cx
        let dy = y - cy
        let along = abs(dx * poleDirX + dy * poleDirY)
        let t = along / radius
        return min(1, t / centerlineFalloff)
      }
      return { fn, attenuation }
    }
    case "saddle": {
      return (x, y) => {
        let dx = (x - cx) * 0.01
        let dy = (y - cy) * 0.01
        return { x: dx, y: -dy }
      }
    }
    case "noise": {
      let offset = random(1000)
      return (x, y) => {
        let a = noise((x - cx) * 0.02 + offset, (y - cy) * 0.02 + offset) * TWO_PI * 2
        return { x: cos(a), y: sin(a) }
      }
    }
    case "bands": {
      let bandDir = random() < 0.5 ? 0 : 1
      let bandFreq = random(0.02, 0.06)
      return (x, y) => {
        let v = bandDir === 0 ? sin((y - cy) * bandFreq) : sin((x - cx) * bandFreq)
        if (bandDir === 0) return { x: v > 0 ? 1 : -1, y: 0 }
        return { x: 0, y: v > 0 ? 1 : -1 }
      }
    }
    case "flower": {
      let petals = int(random(3, 8))
      return (x, y) => {
        let dx = x - cx
        let dy = y - cy
        let rr = sqrt(dx * dx + dy * dy) || 0.001
        let theta = atan2(dy, dx)
        let petal = sin(theta * petals)
        return {
          x: (dx / rr) * (petal > 0 ? 1 : -1),
          y: (dy / rr) * (petal > 0 ? 1 : -1),
        }
      }
    }
    case "spiral": {
      let cw = random() < 0.5 ? 1 : -1
      let pitch = random(0.01, 0.08)
      return (x, y) => {
        let dx = x - cx
        let dy = y - cy
        let rr = sqrt(dx * dx + dy * dy) || 0.001
        let theta = atan2(dy, dx)
        let spiralAngle = theta + cw * rr * pitch
        return { x: cos(spiralAngle), y: sin(spiralAngle) }
      }
    }
    case "swirl": {
      let sMix = random(0.3, 0.7)
      let cw = random() < 0.5 ? 1 : -1
      return (x, y) => {
        let dx = x - cx
        let dy = y - cy
        let rr = sqrt(dx * dx + dy * dy) || 0.001
        let radialX = dx / rr
        let radialY = dy / rr
        let tangX = -dy / rr
        let tangY = dx / rr
        return {
          x: sMix * radialX + (1 - sMix) * cw * tangX,
          y: sMix * radialY + (1 - sMix) * cw * tangY,
        }
      }
    }
    default:
      return () => ({ x: 1, y: 0 })
  }
}

const ZONE_TYPES = [
  ["radial", 8], ["linear", 8], ["vortex", 8], ["dipole", 5],
  ["saddle", 5], ["noise", 4], ["sinusoidal", 5], ["bands", 5],
  ["flower", 3], ["spiral", 3], ["swirl", 3],
]

function weightedRandom(array) {
  let total = 0
  for (let i = 0; i < array.length; i++) total += array[i][1]
  let r = random(total)
  for (let i = 0; i < array.length; i++) {
    if (r < array[i][1]) return array[i][0]
    r -= array[i][1]
  }
  return array[array.length - 1][0]
}

function generateZones() {
  zones = []
  let m = PARAM_RANGES.zoneMargin
  let minDim = min(width, height)
  let numZones = int(random(...PARAM_RANGES.numZones))

  for (let i = 0; i < numZones; i++) {
    let cx = random(width * m, width * (1 - m))
    let cy = random(height * m, height * (1 - m))
    let radius = minDim * random(...PARAM_RANGES.zoneRadius) * sizeMult
    let strength = random(...PARAM_RANGES.zoneStrength)
    let type = weightedRandom(ZONE_TYPES)
    let fnResult = createZoneFn(type, cx, cy, radius)

    let fn, attenuation
    if (fnResult && typeof fnResult === "object" && fnResult.fn) {
      fn = fnResult.fn
      attenuation = fnResult.attenuation
    } else {
      fn = fnResult
      attenuation = null
    }
    zones.push({ cx, cy, radius, strength, type, fn, attenuation })
  }
}

function zoneWeight(x, y, zone) {
  let dx = x - zone.cx
  let dy = y - zone.cy
  let d = sqrt(dx * dx + dy * dy)
  if (d >= zone.radius) return 0
  let t = d / zone.radius
  return 1 - t * t
}

function getFlowField(x, y) {
  let vx = 0, vy = 0
  let angle = noise(x * noiseScale, y * noiseScale) * TWO_PI * 2
  vx += cos(angle) * baseStrength
  vy += sin(angle) * baseStrength

  for (let zone of zones) {
    let w = zoneWeight(x, y, zone)
    if (w > 0) {
      let att = zone.attenuation ? zone.attenuation(x, y) : 1
      let v = zone.fn(x, y)
      let len = sqrt(v.x * v.x + v.y * v.y) || 1
      vx += (v.x / len) * zone.strength * w * att
      vy += (v.y / len) * zone.strength * w * att
    }
  }

  let len = sqrt(vx * vx + vy * vy)
  if (len < 0.001) { vx = 1; vy = 0 }
  else { vx /= len; vy /= len }
  return { x: vx, y: vy }
}

function traceLine(startX, startY, direction, length) {
  let path = []
  let x = startX, y = startY
  let traveled = 0

  while (traveled < length) {
    path.push({ x, y })
    let flow = getFlowField(x, y)
    x += flow.x * stepSize * direction
    y += flow.y * stepSize * direction
    traveled += stepSize
    let m = max(width, height) * (1 + canvasMargin * 3)
    if (x < -m || x > width + m || y < -m || y > height + m) break
  }
  return path
}

function buildFullPath(seed, strandLength) {
  let halfLen = strandLength / 2
  let pathBwd = traceLine(seed.x, seed.y, -1, halfLen)
  let pathFwd = traceLine(seed.x, seed.y, 1, halfLen)
  if (pathFwd.length < 2) return null

  let path = []
  for (let i = pathBwd.length - 1; i > 0; i--) path.push(pathBwd[i])
  for (let p of pathFwd) path.push(p)
  return path
}

function samplePathForHelix(pts, step) {
  let samples = []
  let totalDist = 0
  let nextSampleAt = 0

  for (let i = 0; i < pts.length - 1; i++) {
    let a = pts[i], b = pts[i + 1]
    let dx = b.x - a.x, dy = b.y - a.y
    let segLen = sqrt(dx * dx + dy * dy) || 0.001
    let ux = dx / segLen, uy = dy / segLen

    let t = max(0, nextSampleAt - totalDist)
    while (t <= segLen) {
      let d = totalDist + t
      samples.push({
        x: a.x + ux * t,
        y: a.y + uy * t,
        tangent: { x: ux, y: uy },
        dist: d,
      })
      nextSampleAt = d + step
      t = nextSampleAt - totalDist
    }
    totalDist += segLen
  }
  return samples
}

function drawSploshCircle(cx, cy, baseColor, baseSize) {
  let n = floor(random(...PARAM_RANGES.numSploshCircles))
  let offsetMax = random(...PARAM_RANGES.sploshOffsetRange) * baseSize
  let [sizeMin, sizeMax] = PARAM_RANGES.sploshSizeVariation
  noStroke()
  for (let i = 0; i < n; i++) {
    let ox = random(-offsetMax, offsetMax)
    let oy = random(-offsetMax, offsetMax)
    let r = baseSize * random(sizeMin, sizeMax) * 0.5
    fill(getSploshColor(baseColor))
    circle(cx + ox, cy + oy, r * 2)
  }
}

function extrapolateStrandEnds(points) {
  if (points.length < 2) return points
  let totalExtent = random(...PARAM_RANGES.strandEndExtrapolation) * sizeMult
  let nExtrap = floor(random(...PARAM_RANGES.strandEndExtrapolationPoints))
  nExtrap = max(2, nExtrap)
  let result = [...points]

  let dx0 = points[1].x - points[0].x
  let dy0 = points[1].y - points[0].y
  let len0 = sqrt(dx0 * dx0 + dy0 * dy0) || 0.001
  let step0 = totalExtent / nExtrap
  let perp0x = -dy0 / len0
  let perp0y = dx0 / len0
  for (let i = nExtrap; i >= 1; i--) {
    let d = step0 * i
    let wander = random(-2, 2) * sizeMult
    result.unshift({
      x: points[0].x - (dx0 / len0) * d + perp0x * wander,
      y: points[0].y - (dy0 / len0) * d + perp0y * wander,
    })
  }

  let dx1 = points[points.length - 1].x - points[points.length - 2].x
  let dy1 = points[points.length - 1].y - points[points.length - 2].y
  let len1 = sqrt(dx1 * dx1 + dy1 * dy1) || 0.001
  let step1 = totalExtent / nExtrap
  let perp1x = -dy1 / len1
  let perp1y = dx1 / len1
  let last = points[points.length - 1]
  for (let i = 1; i <= nExtrap; i++) {
    let d = step1 * i
    let wander = random(-2, 2) * sizeMult
    result.push({
      x: last.x + (dx1 / len1) * d + perp1x * wander,
      y: last.y + (dy1 / len1) * d + perp1y * wander,
    })
  }
  return result
}

function makeRandomDash() {
  let dash = []
  for (let i = 0; i < 10; i++) {
    let n = random(2, 5) * sizeMult
    dash.push(i % 2 === 0 ? n * random(2, 3) : n)
  }
  return dash
}

function makeDottedDash() {
  let n = floor(random(2, 5))
  let dash = []
  for (let i = 0; i < n; i++) {
    dash.push(random(0.8, 2.5) * sizeMult)
    dash.push(random(2, 6) * sizeMult)
  }
  return dash
}

function drawStylizedStrand(points, baseColor) {
  if (points.length < 2) return
  points = extrapolateStrandEnds(points)

  let numStrokes = floor(random(...PARAM_RANGES.numStrandStrokes))
  let maxOffset = random(...PARAM_RANGES.strandStrokeOffset) * sizeMult

  for (let i = 0; i < numStrokes; i++) {
    let strokeOffset = random(-maxOffset, maxOffset)
    let rOffsetX = random(-maxOffset, maxOffset) / 2
    let rOffsetY = random(-maxOffset, maxOffset) / 2

    let offsetPoints = []
    for (let j = 0; j < points.length; j++) {
      let prev = points[max(0, j - 1)]
      let next = points[min(points.length - 1, j + 1)]
      let tx = next.x - prev.x
      let ty = next.y - prev.y
      let len = sqrt(tx * tx + ty * ty) || 0.001
      let perpX = -ty / len
      let perpY = tx / len
      offsetPoints.push({
        x: points[j].x + perpX * strokeOffset + random(-0.5, 0.5) * sizeMult + rOffsetX,
        y: points[j].y + perpY * strokeOffset + random(-0.5, 0.5) * sizeMult + rOffsetY,
      })
    }

    stroke(getStrandStrokeColor(baseColor))
    strokeWeight(max(0.3, random(0.5, 1.2) * sizeMult))
    drawingContext.setLineDash(makeRandomDash())
    drawingContext.lineCap = "round"

    beginShape()
    curveVertex(offsetPoints[0].x, offsetPoints[0].y)
    for (let p of offsetPoints) splineVertex(p.x, p.y)
    curveVertex(offsetPoints[offsetPoints.length - 1].x, offsetPoints[offsetPoints.length - 1].y)
    endShape()
  }
}

function drawHelix(path, sampleStep, torsion, helixRadius, strandColor) {
  let samples = samplePathForHelix(path, sampleStep)
  if (samples.length < 2) return

  let radiusNoiseScale = random(...PARAM_RANGES.radiusNoiseScale)
  let radiusNoiseOffset = random(1000)
  let strand1 = []
  let strand2 = []

  for (let s of samples) {
    let perpX = -s.tangent.y
    let perpY = s.tangent.x
    let phase = s.dist * torsion * TWO_PI
    let radiusMul = 0.8 + 0.4 * noise(s.dist * radiusNoiseScale + radiusNoiseOffset)
    let offset = helixRadius * radiusMul * cos(phase)
    strand1.push({ x: s.x + perpX * offset, y: s.y + perpY * offset })
    strand2.push({ x: s.x - perpX * offset, y: s.y - perpY * offset })
  }

  noFill()
  drawStylizedStrand(strand1, strandColor)
  drawStylizedStrand(strand2, strandColor)

  let circleSize = random(...PARAM_RANGES.basePairCircleSize) * sizeMult
  let rungSkipChance = random(...PARAM_RANGES.rungSkipChance)

  for (let i = 0; i < strand1.length; i++) {
    if (i === 0 || i === strand1.length - 1) continue
    if (random() < rungSkipChance) continue
    let pair = basePairColors[i % basePairColors.length]
    drawSploshCircle(strand1[i].x, strand1[i].y, pair[0], circleSize)
    drawSploshCircle(strand2[i].x, strand2[i].y, pair[1], circleSize)
  }

  push()
  colorMode(RGB, 255, 255, 255, 255)
  drawingContext.lineCap = "round"
  drawingContext.setLineDash(makeDottedDash())
  rungSkipChance = random(...PARAM_RANGES.rungSkipChance)

  for (let i = 0; i < strand1.length; i++) {
    if (i === 0 || i === strand1.length - 1) continue
    if (random() < rungSkipChance) continue
    let pair = basePairColors[i % basePairColors.length]
    let rungColor = random([pair[0], pair[1]])
    stroke(red(rungColor), green(rungColor), blue(rungColor), 130)
    strokeWeight(1 * sizeMult)
    line(strand1[i].x, strand1[i].y, strand2[i].x, strand2[i].y)
  }
  pop()
}

function drawGradientBackground(pal) {
  background(0, 0, 88, 1)

  let n = floor(random(1, 5))
  let shuffled = [...pal]
  shuffle(shuffled, true)

  let ctx = drawingContext
  for (let i = 0; i < n; i++) {
    let numColors = max(2, min(floor(random(3, 7)), shuffled.length))
    let picked = shuffle([...shuffled], true).slice(0, numColors)

    let colors = []
    for (let j = 0; j < numColors; j++) {
      let base = hexToP5Color(picked[j])
      let h = hue(base)
      let s = constrain(saturation(base) - random(10, 30), 0, 100)
      let l = constrain(lightness(base) + random(10, 25), 0, 100)
      let a = random(...PARAM_RANGES.backgroundGradientOpacity)
      colors.push(color(h, s, l, a).toString())
    }

    let angle = random(TWO_PI)
    let d = max(width, height) * 1.5
    let x0 = width / 2 + cos(angle) * d
    let y0 = height / 2 + sin(angle) * d
    let x1 = width / 2 - cos(angle) * d
    let y1 = height / 2 - sin(angle) * d

    let grad = ctx.createLinearGradient(x0, y0, x1, y1)
    for (let j = 0; j < colors.length; j++) {
      grad.addColorStop(j / (colors.length - 1), colors[j])
    }
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  }
}