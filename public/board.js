const socket = io();
const $ = id => document.getElementById(id);
let room = "", key = "", currentFile = null, pdfDoc = null, pageNum = 1, rendering = false, pendingPage = null;

socket.on("connect", () => socket.emit("create-board"));
socket.on("board-created", async data => {
  room = data.code; key = data.key;
  $("roomCode").textContent = room;
  try {
    const response = await fetch(`/api/qr?room=${room}&key=${key}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    $("qrImage").src = data.dataUrl;
    $("qrImage").hidden = false;
    $("qrLoading").hidden = true;
    $("status").textContent = "Telefon bağlantısı için hazır.";
  } catch (e) { $("status").textContent = e.message; }
});
socket.on("phone-connected", () => $("status").textContent = "Telefon bağlandı. Dosya gönderilmeye hazır.");
socket.on("file-ready", showFile);
socket.on("remote-action", ({action}) => {
  if (action === "next") changePage(1);
  if (action === "prev") changePage(-1);
  if (action === "fullscreen") toggleFullscreen();
  if (action === "clear") clearViewer();
});
function clearViewer() {
  currentFile = null; pdfDoc = null;
  $("fileTitle").textContent = "Paylaşım bekleniyor";
  $("viewer").innerHTML = `<div class="empty-state"><div class="big-icon">▣</div><h2>Dosyanızı buraya gönderin</h2><p>Telefonunuzla QR kodu okutun.<br>PDF, fotoğraf veya video seçin.</p></div>`;
  $("pageInfo").textContent = "Henüz dosya yok";
  $("prevBtn").disabled = $("nextBtn").disabled = true;
}
async function showFile(file) {
  currentFile = file; pdfDoc = null; pageNum = 1;
  $("fileTitle").textContent = file.name;
  $("viewer").innerHTML = '<div class="empty-state">Dosya açılıyor…</div>';
  const type = file.type || "";
  if (type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    try {
      const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
      pdfDoc = await pdfjs.getDocument(file.url).promise;
      $("viewer").innerHTML = '<canvas id="pdfCanvas"></canvas>';
      $("pageInfo").textContent = `1 / ${pdfDoc.numPages}`;
      $("prevBtn").disabled = true; $("nextBtn").disabled = pdfDoc.numPages <= 1;
      renderPage(1);
    } catch {
      $("viewer").innerHTML = `<div class="empty-state"><p>PDF önizlemesi açılamadı.</p><a href="${file.url}" target="_blank">PDF dosyasını yeni sekmede aç</a></div>`;
    }
  } else if (type.startsWith("image/")) {
    $("viewer").innerHTML = `<img alt="Paylaşılan görsel" src="${file.url}">`;
    $("pageInfo").textContent = "Görsel";
    $("prevBtn").disabled = $("nextBtn").disabled = true;
  } else if (type.startsWith("video/")) {
    $("viewer").innerHTML = `<video controls autoplay playsinline src="${file.url}"></video>`;
    $("pageInfo").textContent = "Video";
    $("prevBtn").disabled = $("nextBtn").disabled = true;
  } else {
    $("viewer").innerHTML = `<div class="empty-state"><div class="big-icon">⇩</div><h2>${escapeHtml(file.name)}</h2><p>Bu dosya türü tahtanın tarayıcısında doğrudan önizlenemeyebilir.</p><a href="${file.url}" target="_blank" download>Dosyayı indir / aç</a></div>`;
    $("pageInfo").textContent = "Dosya gönderildi";
    $("prevBtn").disabled = $("nextBtn").disabled = true;
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
async function renderPage(n) {
  if (!pdfDoc) return;
  if (rendering) { pendingPage = n; return; }
  rendering = true;
  try {
    const page = await pdfDoc.getPage(n);
    const viewport = page.getViewport({scale: 1.5});
    const canvas = $("pdfCanvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({canvasContext: context, viewport}).promise;
    pageNum = n;
    $("pageInfo").textContent = `${pageNum} / ${pdfDoc.numPages}`;
    $("prevBtn").disabled = pageNum <= 1;
    $("nextBtn").disabled = pageNum >= pdfDoc.numPages;
  } finally {
    rendering = false;
    if (pendingPage !== null) { const p = pendingPage; pendingPage = null; renderPage(p); }
  }
}
function changePage(delta) { if (pdfDoc) renderPage(Math.max(1, Math.min(pdfDoc.numPages, pageNum + delta))); }
$("prevBtn").onclick = () => changePage(-1);
$("nextBtn").onclick = () => changePage(1);
async function toggleFullscreen() {
  const el = $("viewer");
  if (!document.fullscreenElement) await el.requestFullscreen?.();
  else await document.exitFullscreen?.();
}
$("fullscreenBtn").onclick = toggleFullscreen;
document.addEventListener("keydown", e => { if (e.key === "ArrowRight") changePage(1); if (e.key === "ArrowLeft") changePage(-1); });