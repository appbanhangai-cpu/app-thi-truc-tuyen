
console.log("Starting server.ts...");
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { fileURLToPath } from 'url';
import { safeJsonParse } from './utils.ts';
import { google } from 'googleapis';
import cookieParser from 'cookie-parser';
import session from 'express-session';

console.log("Imports completed.");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(process.cwd(), "app_data.json");
const activeStudents = new Map();

interface AppState {
  questionBank: any[];
  examResults: any[];
  lessonParsed: any;
  allowTranslation: boolean;
  currentSessionId: string;
  googleDriveFileId: string;
  googleTokens: any;
  googleSheetUrl: string;
}

const DEFAULT_STATE: AppState = {
  questionBank: [],
  examResults: [],
  lessonParsed: null,
  allowTranslation: false,
  currentSessionId: 'Đợt thi mặc định',
  googleDriveFileId: '1CVB9NhOpEJxCfUbpGOVKJCrG51IG-b8n',
  googleTokens: null,
  googleSheetUrl: 'https://script.google.com/macros/s/AKfycbyOawiCl3Zr8Ez7wpXAo2oFW9lC3Xi6WE1vZSgpPelv2UBAL6856Ge8Gvh8i9YZEzhYeg/exec'
};

function loadData(): AppState {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      if (!content || content === 'undefined') return { ...DEFAULT_STATE };
      const data = safeJsonParse(content, { ...DEFAULT_STATE });
      if (!data.currentSessionId) data.currentSessionId = DEFAULT_STATE.currentSessionId;
      if (!data.googleDriveFileId) data.googleDriveFileId = DEFAULT_STATE.googleDriveFileId;
      if (data.googleSheetUrl === undefined) data.googleSheetUrl = DEFAULT_STATE.googleSheetUrl;
      return data;
    } catch (e) { console.error("Error loading data file:", e); }
  }
  return { ...DEFAULT_STATE };
}

function saveData(data: any) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) { console.error("Error saving data file:", e); }
}

async function startServer() {
  console.log("Entering startServer()...");
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.get("/ping-server", (req, res) => res.send("PONG"));

  app.use(cors({ 
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: false
  }));
  app.options('*', cors());
  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ limit: '200mb', extended: true }));

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: "Invalid JSON payload", details: err.message });
    }
    next(err);
  });

  app.use(cookieParser());
  app.use(session({
    secret: 'exam-score-secret',
    resave: false,
    saveUninitialized: true,
    proxy: true,
    cookie: { secure: true, sameSite: 'none', httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
  }));

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || (process.env.APP_URL ? `${process.env.APP_URL}/api/auth/google/callback` : undefined)
  );

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      // Log all requests to /api to help debug the HTML response issue
      if (req.originalUrl.startsWith('/api/')) {
        console.log(`[API Request] ${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });

  const apiRouter = express.Router();
  let state = loadData();

  const getGoogleSheetUrl = () => {
    const defaultUrl = "https://script.google.com/macros/s/AKfycbyOawiCl3Zr8Ez7wpXAo2oFW9lC3Xi6WE1vZSgpPelv2UBAL6856Ge8Gvh8i9YZEzhYeg/exec";
    const envUrl = process.env.GOOGLE_SHEET_WEBAPP_URL;
    const stateUrl = state.googleSheetUrl;
    const isValidWebAppUrl = (url: string | undefined) => url && url.trim() && url.startsWith('https://script.google.com/macros/s/');
    if (isValidWebAppUrl(stateUrl)) return stateUrl.trim();
    if (isValidWebAppUrl(envUrl)) return envUrl!.trim();
    return defaultUrl;
  };

  async function syncToDrive() {
    const tokens = state.googleTokens;
    const fileId = state.googleDriveFileId;
    if (!tokens || !fileId) return;
    try {
      oauth2Client.setCredentials(tokens);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      await drive.files.update({
        fileId: fileId,
        media: { mimeType: 'application/json', body: JSON.stringify(state.examResults, null, 2) },
      });
    } catch (error) { console.error('[Drive] Sync Error:', error); }
  }

  const handleResultsSubmission = async (req: express.Request, res: express.Response) => {
    try {
      const result = req.body;
      console.log(`[API] Received submission for student: ${result?.name || 'Unknown'}`);
      
      if (!result) return res.status(400).json({ error: "Missing result data" });
      if (!result.id) result.id = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const exists = state.examResults.some((r: any) => r.id === result.id);
      if (!exists) {
        state.examResults = [result, ...state.examResults];
        saveData(state);
        syncToDrive();
      }
      const googleSheetUrl = getGoogleSheetUrl();
      const rank = result.score >= 9 ? "Xuất sắc" : result.score >= 8 ? "Giỏi" : result.score >= 6.5 ? "Khá" : result.score >= 5 ? "Trung bình" : "Yếu";
      const ts = result.timestamp || Date.now();
      const vnOptions: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Ho_Chi_Minh', hour12: false };
      let displayName = result.name || "N/A";
      let displayClass = result.className || "N/A";
      if (displayName && String(displayName).includes('+')) {
        const parts = String(displayName).split('+');
        displayName = parts[0].trim();
        displayClass = parts[1].trim();
      }
      const sheetData = {
        sheetName: "BangDiem", 
        name: String(displayName), 
        className: String(displayClass),
        subject: String(state.lessonParsed?.title || "Ôn tập"), 
        correctCount: `${result.correctAnswers || 0}/${result.totalQuestions || 0}`,
        score: Number(result.score || 0), 
        rank: String(rank),
        helpCount: Number(result.helpCount || 0),
        date: new Date(ts).toLocaleDateString('vi-VN', vnOptions), 
        time: new Date(ts).toLocaleTimeString('vi-VN', vnOptions)
      };
      let syncResult = "initiated";
      let attempt = 0;
      while (attempt <= 2 && syncResult !== "success") {
        attempt++;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(googleSheetUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheetData), redirect: 'follow', signal: controller.signal });
          clearTimeout(timeoutId);
          const respText = await response.text();
          if (response.ok || respText.toLowerCase().includes("success")) syncResult = "success";
          else syncResult = `failed: ${response.status}`;
        } catch (error: any) {
          syncResult = `error: ${error.message}`;
          if (attempt <= 2) await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
      res.json({ success: syncResult === "success", sheetSync: syncResult });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  };

  apiRouter.get("/health", (req, res) => res.json({ status: "ok", version: "1.0.5" }));
  apiRouter.get("/ping", (req, res) => res.json({ pong: true }));
  apiRouter.get("/bank", (req, res) => res.json({ questionBank: state.questionBank, lessonParsed: state.lessonParsed, allowTranslation: state.allowTranslation, currentSessionId: state.currentSessionId }));
  apiRouter.post("/bank", (req, res) => {
    if (req.body.questionBank !== undefined) state.questionBank = req.body.questionBank;
    if (req.body.lessonParsed !== undefined) state.lessonParsed = req.body.lessonParsed;
    if (req.body.allowTranslation !== undefined) state.allowTranslation = req.body.allowTranslation;
    if (req.body.currentSessionId !== undefined) state.currentSessionId = req.body.currentSessionId;
    saveData(state);
    res.json({ success: true });
  });
  apiRouter.get("/results", (req, res) => res.json(state.examResults));
  apiRouter.post("/submit-results", handleResultsSubmission);
  apiRouter.post("/results", handleResultsSubmission);
  apiRouter.post("/config/sheet", (req, res) => {
    if (req.body.url !== undefined) { state.googleSheetUrl = req.body.url; saveData(state); res.json({ success: true }); }
    else res.status(400).json({ error: "Missing url" });
  });
  apiRouter.get("/config/sheet", (req, res) => res.json({ url: state.googleSheetUrl || "" }));
  apiRouter.post("/start-exam", async (req, res) => {
    const { name, className } = req.body;
    const googleSheetUrl = getGoogleSheetUrl();
    const ts = Date.now();
    const vnOptions: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Ho_Chi_Minh', hour12: false };
    let displayName = name || "N/A";
    let displayClass = className || "N/A";
    if (displayName && String(displayName).includes('+')) {
      const parts = String(displayName).split('+');
      displayName = parts[0].trim();
      displayClass = parts[1].trim();
    }
    const sheetData = {
      sheetName: "BangDiem", name: String(displayName), className: String(displayClass),
      subject: String(state.lessonParsed?.title || "Ôn tập"), correctCount: "Đang thi...", score: "...", rank: "Đang làm bài",
      date: new Date(ts).toLocaleDateString('vi-VN', vnOptions), time: new Date(ts).toLocaleTimeString('vi-VN', vnOptions)
    };
    (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        await fetch(googleSheetUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheetData), redirect: 'follow', signal: controller.signal });
        clearTimeout(timeoutId);
      } catch (e) {}
    })();
    res.json({ success: true });
  });
  apiRouter.post("/test-sheet", async (req, res) => {
    const googleSheetUrl = getGoogleSheetUrl();
    const ts = Date.now();
    const vnOptions: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Ho_Chi_Minh', hour12: false };
    const testData = {
      sheetName: "BangDiem", name: "KIỂM TRA HỆ THỐNG", className: "TEST", subject: "KIỂM TRA KẾT NỐI",
      correctCount: "10/10", score: 10, rank: "Xuất sắc",
      date: new Date(ts).toLocaleDateString('vi-VN', vnOptions), time: new Date(ts).toLocaleTimeString('vi-VN', vnOptions)
    };
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(googleSheetUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(testData), redirect: 'follow', signal: controller.signal });
      clearTimeout(timeoutId);
      const text = await response.text();
      const isSuccess = response.ok || response.status === 302 || text.toLowerCase().includes("success");
      res.json({ success: isSuccess, status: response.status, body: text.substring(0, 200) });
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
  });
  apiRouter.post("/webhook", (req, res) => {
    const { questions, lessonParsed } = req.body;
    if (questions && Array.isArray(questions)) {
      state.questionBank = questions;
      if (lessonParsed) state.lessonParsed = lessonParsed;
      saveData(state);
      res.json({ status: "ok", count: questions.length });
    } else res.status(400).json({ error: "Invalid format" });
  });
  apiRouter.delete("/reset", (req, res) => {
    state = { ...DEFAULT_STATE };
    activeStudents.clear();
    saveData(state);
    res.json({ success: true });
  });
  apiRouter.get('/auth/google/url', (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.status(400).json({ error: 'OAuth not configured' });
    let redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/auth/google/callback`;
    const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'], prompt: 'consent', redirect_uri: redirectUri });
    res.json({ url });
  });
  apiRouter.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      (req.session as any).tokens = tokens;
      state.googleTokens = tokens;
      saveData(state);
      res.send(`<html><body><script>if(window.opener){window.opener.postMessage({type:'GOOGLE_AUTH_SUCCESS'},'*');window.close();}else{window.location.href='/';}</script></body></html>`);
    } catch (e) { res.status(500).send('Auth failed'); }
  });
  apiRouter.get('/auth/google/status', (req, res) => res.json({ authenticated: !!(req.session as any).tokens || !!state.googleTokens }));
  apiRouter.post('/drive/config', (req, res) => {
    if (req.body.fileId) { state.googleDriveFileId = req.body.fileId; saveData(state); res.json({ success: true }); }
    else res.status(400).json({ error: 'Missing fileId' });
  });
  apiRouter.post('/drive/upload', async (req, res) => {
    const tokens = (req.session as any).tokens || state.googleTokens;
    if (!tokens) return res.status(401).json({ error: 'Not authenticated' });
    try {
      oauth2Client.setCredentials(tokens);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      const response = await drive.files.create({ requestBody: { name: req.body.filename, mimeType: 'application/json' }, media: { mimeType: 'application/json', body: JSON.stringify(req.body.content, null, 2) }, fields: 'id' });
      res.json({ success: true, fileId: response.data.id });
    } catch (e) { res.status(500).json({ error: 'Upload failed' }); }
  });

  apiRouter.all("*", (req, res) => res.status(404).json({ error: "API Route not found", path: req.url }));
  app.use("/api", apiRouter);

  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
      app.use(vite.middlewares);
    } catch (e) { console.error("Vite failed:", e); }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) app.use(express.static(distPath));
  }

  app.get("*", (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (process.env.NODE_ENV === "production") {
      const distIndex = path.join(process.cwd(), "dist", "index.html");
      if (fs.existsSync(distIndex)) return res.sendFile(distIndex);
    }
    const rootIndex = path.join(process.cwd(), "index.html");
    if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
    next();
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  const teachers = new Set<WebSocket>();
  setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  setInterval(() => {
    const now = Date.now();
    for (const [id, data] of activeStudents.entries()) {
      if (now - data.lastUpdate > 5 * 60 * 1000) {
        activeStudents.delete(id);
        const msg = JSON.stringify({ type: 'student_left', studentId: id });
        teachers.forEach(t => { if (t.readyState === WebSocket.OPEN) t.send(msg); });
      }
    }
  }, 60000);
  wss.on('connection', (ws: any) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data: any) => {
      try {
        const message = safeJsonParse(data.toString(), null);
        if (!message) return;
        if (message.type === 'student_join' || message.type === 'student_frame') {
          const { studentId, name, className, frame } = message;
          const current = activeStudents.get(studentId);
          activeStudents.set(studentId, { studentId, name, className, lastFrame: frame || current?.lastFrame || null, lastUpdate: Date.now() });
          const broadcastMsg = JSON.stringify({ type: 'monitor_update', studentId, name, className, frame: frame || current?.lastFrame || null });
          teachers.forEach(t => { if (t !== ws && t.readyState === WebSocket.OPEN) t.send(broadcastMsg); });
        } else if (message.type === 'teacher_init') {
          teachers.add(ws);
          ws.send(JSON.stringify({ type: 'monitor_init', students: Array.from(activeStudents.values()) }));
        }
      } catch (e) {}
    });
    ws.on('close', () => teachers.delete(ws));
    ws.on('error', () => teachers.delete(ws));
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
