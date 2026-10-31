const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const QRCode = require("qrcode");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 110 * 1024 * 1024 });
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/, "");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR, { fallthrough: false, maxAge: "1h" }));

const rooms = new Map();
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_FILES_PER_ROOM = 30;
const MAX_PHONES_PER_ROOM = 8;
const allowed = new Set([
  "application/pdf",
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword"
]);

function newCode() { return crypto.randomBytes(3).toString("hex").toUpperCase(); }
function newKey() { return crypto.randomBytes(18).toString("hex"); }
function roomFor(code, key) {
  const r = rooms.get(String(code || "").toUpperCase());
  return r && r.key === key ? r : null;
}
function baseUrl(req) { return BASE_URL || `${req.protocol}://${req.get("host")}`; }
function publicFile(file, req) {
  return {
    id: file.filename,
    name: file.originalname,
    url: `${baseUrl(req)}/uploads/${encodeURIComponent(file.filename)}`,
    type: file.mimetype,
    size: file.size,
    uploadedAt: Date.now()
  };
}
function safeFileList(r) {
  return r.files.map(({ id, name, url, type, size, uploadedAt }) => ({ id, name, url, type, size, uploadedAt }));
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).slice(0, 12).toLowerCase())
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (allowed.has(file.mimetype)) cb(null, true);
    else cb(new Error("Bu dosya türü desteklenmiyor."));
  }
});

app.get("/api/qr", async (req, res) => {
  const r = roomFor(req.query.room, req.query.key);
  if (!r) return res.status(403).json({ error: "Bağlantı geçersiz." });
  const joinUrl = `${baseUrl(req)}/join.html?room=${encodeURIComponent(r.code)}&key=${encodeURIComponent(r.key)}`;
  try {
    const dataUrl = await QRCode.toDataURL(joinUrl, { width: 320, margin: 2, errorCorrectionLevel: "M" });
    res.json({ dataUrl, joinUrl });
  } catch {
    res.status(500).json({ error: "QR kod oluşturulamadı." });
  }
});

app.get("/api/files", (req, res) => {
  const r = roomFor(req.query.room, req.query.key);
  if (!r) return res.status(403).json({ error: "Oturum bulunamadı veya süresi doldu." });
  res.json({ files: safeFileList(r) });
});

app.post("/api/upload", (req, res) => {
  const r = roomFor(req.query.room, req.query.key);
  if (!r) return res.status(403).json({ error: "Oturum bulunamadı veya süresi doldu." });
  if (r.files.length >= MAX_FILES_PER_ROOM) return res.status(400).json({ error: `Bir oturumda en fazla ${MAX_FILES_PER_ROOM} dosya tutulabilir. Önce eski dosyaları silin.` });
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Dosya en fazla 100 MB olabilir." : err.message });
    if (!req.file) return res.status(400).json({ error: "Dosya seçilmedi." });
    const item = publicFile(req.file, req);
    r.files.unshift(item);
    r.lastActivity = Date.now();
    io.to(r.code).emit("file-ready", item);
    io.to(r.code).emit("file-list", safeFileList(r));
    res.json({ ok: true, file: item, files: safeFileList(r) });
  });
});

app.post("/api/delete-file", express.json(), (req, res) => {
  const r = roomFor(req.query.room, req.query.key);
  if (!r) return res.status(403).json({ error: "Oturum bulunamadı veya süresi doldu." });
  const index = r.files.findIndex(file => file.id === req.body?.id);
  if (index < 0) return res.status(404).json({ error: "Dosya bu oturumda bulunamadı." });
  const [file] = r.files.splice(index, 1);
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(file.id))); } catch {}
  r.lastActivity = Date.now();
  io.to(r.code).emit("file-removed", { id: file.id });
  io.to(r.code).emit("file-list", safeFileList(r));
  res.json({ ok: true, files: safeFileList(r) });
});

io.on("connection", socket => {
  socket.on("create-board", () => {
    let code;
    do { code = newCode(); } while (rooms.has(code));
    const key = newKey();
    rooms.set(code, { code, key, boardSocket: socket.id, phoneSockets: new Set(), files: [], lastActivity: Date.now() });
    socket.join(code);
    socket.emit("board-created", { code, key });
  });

  socket.on("join-room", ({ room, key } = {}) => {
    const r = roomFor(room, key);
    if (!r) return socket.emit("join-error", "Bağlantı kodu geçersiz veya oturum sona ermiş.");
    if (r.phoneSockets.size >= MAX_PHONES_PER_ROOM && !r.phoneSockets.has(socket.id)) {
      return socket.emit("join-error", "Bu sınıf oturumuna ulaşılabilecek telefon sayısı doldu.");
    }
    socket.join(r.code);
    r.phoneSockets.add(socket.id);
    r.lastActivity = Date.now();
    socket.emit("joined-room", { code: r.code, files: safeFileList(r) });
    io.to(r.code).emit("phone-connected", { count: r.phoneSockets.size });
  });

  socket.on("page-status", ({ room, key, page, total, fileName } = {}) => {
    const r = roomFor(room, key);
    if (!r || r.boardSocket !== socket.id) return;
    socket.to(r.code).emit("page-status", { page, total, fileName });
  });

  socket.on("board-action", ({ room, key, action, fileId } = {}, acknowledge) => {
    const reply = payload => { if (typeof acknowledge === "function") acknowledge(payload); };
    const r = roomFor(room, key);
    const allowedActions = new Set(["next", "prev", "first", "last", "clear", "open-file"]);
    if (!r || !r.phoneSockets.has(socket.id)) return reply({ ok: false, error: "Telefon oturumu doğrulanamadı. QR kodu yeniden okutun." });
    if (!allowedActions.has(action)) return reply({ ok: false, error: "Desteklenmeyen kumanda komutu." });
    if (!r.boardSocket) return reply({ ok: false, error: "Akıllı tahta bağlantısı bulunamadı." });
    let file = null;
    if (action === "open-file") {
      file = r.files.find(item => item.id === fileId);
      if (!file) return reply({ ok: false, error: "Açılacak dosya bu sınıf oturumunda bulunamadı." });
    }
    r.lastActivity = Date.now();
    io.to(r.boardSocket).timeout(8000).emit("remote-action", { action, file }, (err, responses) => {
      if (err) return reply({ ok: false, error: "Tahtadan yanıt alınamadı. Tahta sayfasını Ctrl+F5 ile yenileyip QR kodu tekrar okutun." });
      reply(responses && responses[0] ? responses[0] : { ok: false, error: "Tahtadan geçerli yanıt alınamadı." });
    });
  });

  socket.on("disconnect", () => {
    for (const [code, r] of rooms) {
      if (r.boardSocket === socket.id) {
        rooms.delete(code);
      } else if (r.phoneSockets) {
        r.phoneSockets.delete(socket.id);
        io.to(code).emit("phone-connected", { count: r.phoneSockets.size });
      }
    }
  });
});

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, r] of rooms) if (r.lastActivity < cutoff) rooms.delete(code);
  for (const name of fs.readdirSync(UPLOAD_DIR)) {
    const p = path.join(UPLOAD_DIR, name);
    try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); } catch {}
  }
}, 15 * 60 * 1000).unref();

app.get("/health", (_req, res) => res.json({ ok: true, app: "İsa Öğretmen Akıllı Tahta", version: "3.0" }));
server.listen(PORT, () => console.log(`İsa Öğretmen Akıllı Tahta V3.0 ${PORT} portunda çalışıyor.`));
