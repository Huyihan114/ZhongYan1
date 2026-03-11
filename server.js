// server.js (FULL)
// - Force-load .env from the same directory as server.js
// - Serve /public static files
// - GET /api/questions
// - POST /api/classify (Moonshot -> JSON; fallback to rule)

import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ---------- Force .env path ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ 强制从项目根目录读取 .env（和 server.js 同层）
dotenv.config({ path: path.join(__dirname, ".env") });

// Debug print (you can keep it until everything works)
console.log("ENV_CHECK", {
  cwd: process.cwd(),
  envPath: path.join(__dirname, ".env"),
  hasKey: Boolean(process.env.MOONSHOT_API_KEY),
  model: process.env.MOONSHOT_MODEL,
  port: process.env.PORT,
});

// ---------- Config ----------
const PORT = process.env.PORT || 5201;
const MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY || "";
const MOONSHOT_MODEL = process.env.MOONSHOT_MODEL || "kimi-k2-turbo-preview";

const EMOTIONS = ["喜悦", "信任", "愤怒", "惊讶", "期待", "悲伤", "恐惧", "厌恶"];

const QUESTIONS = [
  "如果毕业是一扇门，你现在站在门口最强烈的感受是什么？",
  "想到“离开学校后的第一周”，你最担心什么？最希望发生什么？",
  "你想对2026年说什么？",
  "如果只能对未来的自己说一句话，你会说什么？",
];

// ---------- App ----------
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

// Health check
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, msg: "pong" });
});

// Questions
app.get("/api/questions", (req, res) => {
  res.json({ ok: true, questions: QUESTIONS });
});

// ---------- Rule fallback ----------
const RULES = [
  { emo: "喜悦", kws: ["开心", "快乐", "高兴", "爽", "幸福", "满足", "轻松", "释然", "松一口气"] },
  { emo: "信任", kws: ["安心", "可靠", "踏实", "相信", "确定", "稳定", "放心", "有底", "能行"] },
  { emo: "愤怒", kws: ["生气", "愤怒", "烦死", "火大", "讨厌", "气炸", "崩溃", "憋屈", "受不了"] },
  { emo: "惊讶", kws: ["震惊", "意外", "没想到", "居然", "突然", "惊了", "哇", "离谱"] },
  { emo: "期待", kws: ["期待", "希望", "想要", "盼", "等不及", "憧憬", "向往", "准备好了"] },
  { emo: "悲伤", kws: ["难过", "伤心", "失落", "低落", "想哭", "无力", "沮丧", "空", "遗憾"] },
  { emo: "恐惧", kws: ["害怕", "恐惧", "紧张", "担心", "焦虑", "慌", "不安", "压力", "怕"] },
  { emo: "厌恶", kws: ["恶心", "厌恶", "反感", "嫌弃", "抵触", "膈应", "不适", "烦透了"] },
];

function ruleClassify(text = "") {
  const t = String(text).trim();
  if (!t) {
    return {
      emotion: "期待",
      intensity: 0.35,
      keywords: ["空"],
      reason: "未输入文本，默认期待",
    };
  }

  let best = { emotion: "期待", score: 0 };
  for (const r of RULES) {
    let hit = 0;
    for (const k of r.kws) if (t.includes(k)) hit++;
    if (hit > best.score) best = { emotion: r.emo, score: hit };
  }

  const intensity = Math.min(1, Math.max(0.2, best.score * 0.2 + 0.3));
  return {
    emotion: best.score === 0 ? "期待" : best.emotion,
    intensity,
    keywords: best.score === 0 ? ["不确定"] : [best.emotion],
    reason: best.score === 0 ? "未命中关键词，默认期待" : `命中关键词数=${best.score}`,
  };
}

// ---------- JSON extraction & normalization ----------
function extractJsonObject(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeResult(obj, fallback) {
  if (!obj || typeof obj !== "object") return fallback;

  const emotion = EMOTIONS.includes(obj.emotion) ? obj.emotion : fallback.emotion;

  let intensity = Number(obj.intensity);
  if (!Number.isFinite(intensity)) intensity = fallback.intensity;
  intensity = Math.min(1, Math.max(0, intensity));

  const keywords = Array.isArray(obj.keywords)
    ? obj.keywords.slice(0, 5).map(String)
    : fallback.keywords;

  const reason = typeof obj.reason === "string" ? obj.reason.slice(0, 120) : fallback.reason;

  return { emotion, intensity, keywords, reason };
}

// ---------- Moonshot call ----------
async function moonshotClassify(text) {
  if (!MOONSHOT_API_KEY) throw new Error("MOONSHOT_API_KEY missing");

  const system = `你是一个情绪标注器。你的任务是把用户输入的一段中文文本，归类到 8 种情绪之一：
[喜悦, 信任, 愤怒, 惊讶, 期待, 悲伤, 恐惧, 厌恶]。
你必须输出严格的 JSON，不要输出任何多余文字，不要使用 Markdown。`;

  const user = `请根据下面文本判断主导情绪，并给出强度(0到1)、关键词(1到5个)、一句话原因。
输出格式必须严格为：
{"emotion":"喜悦|信任|愤怒|惊讶|期待|悲伤|恐惧|厌恶","intensity":0.0,"keywords":["..."],"reason":"..."}
文本：<<<${text}>>>`;

  const resp = await fetch("https://api.moonshot.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MOONSHOT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MOONSHOT_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Moonshot HTTP ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const parsed = extractJsonObject(content);
  return { parsed, raw: content };
}

// ---------- API: classify ----------
app.post("/api/classify", async (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  const fallback = ruleClassify(text);

  try {
    const { parsed, raw } = await moonshotClassify(text);
    const result = normalizeResult(parsed, fallback);

    console.log(new Date().toISOString(), "TEXT:", text, "=>", result, "| RAW:", raw);

    res.json({ ok: true, method: "moonshot", ...result });
  } catch (e) {
    console.log(new Date().toISOString(), "MOONSHOT_FAIL:", e?.message);
    res.json({ ok: true, method: "rule", ...fallback });
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});