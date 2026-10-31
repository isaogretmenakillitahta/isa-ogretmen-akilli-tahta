const socket = io();
const $ = id => document.getElementById(id);
let room = "", key = "", currentFile = null, pdfDoc = null, pageNum = 1, rendering = false, pendingPage = null;

socket.on("connect", () => socket.emit("create-board"));
socket.on("board-created", async data => {
  room = data.code; key = data.key;
  $("roomCode").textContent = room;
  try {
    const response = await fetch(`/api/qr?room=${encodeURIComponent(room)}&key=${encodeURIComponent(key)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    $("qrImage").src = data.dataUrl;
    $("qrImage").hidden = false;
    $("qrLoading").hidden = true;
    $("status").textContent = "Sınıfa özel bağlantı hazır. QR kodu yalnızca sınıfınızla paylaşın.";
  } catch (e) { $("status").textContent = e.message; }
});
socket.on("phone-connected", data => {
  const count = data?.count || 1;
  $("status").textContent = count === 1 ? "1 telefon sınıfa bağlandı. Dosya gönderilebilir." : `${count} telefon sınıfa bağlandı.`;
});
socket.on("file-ready", showFile);
socket.on("file-removed", ({ id } = {}) => {
  if (currentFile?.id === id) clearViewer();
});
socket.on("remote-action", async ({ action, file } = {}, acknowledge) => {
  const reply = payload => { if (typeof acknowledge === "function") acknowledge(payload); };
  try {
    if (action === "next" || action === "prev") return reply(await changePage(action === "next" ? 1 : -1));
    if (action === "first" || action === "last") return reply(await goToPage(action));
    if (action === "clear") { clearViewer(); return reply({ ok: true, message: "Tahta temizlendi." }); }
    if (action === "open-file" && file) { await showFile(file); return reply({ ok: true, message: `${file.name} tahtada açıldı.` }); }
    return reply({ ok: false, error: "Bilinmeyen komut." });
  } catch (error) { return reply({ ok: false, error: error.message || "Tahta komutu uygulayamadı." }); }
});

function clearViewer() {
  currentFile = null; pdfDoc = null; pageNum = 1;
  $("fileTitle").textContent = "Paylaşım bekleniyor";
  $("viewer").innerHTML = `<div class="empty-state"><div class="big-icon">▣</div><h2>Dosyanızı buraya gönderin</h2><p>Telefonunuzla QR kodu okutun.<br>PDF, fotoğraf veya video seçin.</p></div>`;
  $("pageInfo").textContent = "Henüz dosya yok";
  $("prevBtn").disabled = $("nextBtn").disabled = $("firstBtn").disabled = $("lastBtn").disabled = true;
  socket.emit("page-status", { room, key, page: 0, total: 0, fileName: "" });
}
async function showFile(file) {
  currentFile = file; pdfDoc = null; pageNum = 1;
  $("fileTitle").textContent = file.name;
  $("viewer").innerHTML = '<div class="empty-state">Dosya açılıyor…</div>';
  const type = file.type || "";
  const name = String(file.name || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    try {
      const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
      pdfDoc = await pdfjs.getDocument(file.url).promise;
      $("viewer").innerHTML = '<canvas id="pdfCanvas"></canvas>';
      await renderPage(1);
    } catch {
      $("viewer").innerHTML = `<div class="empty-state"><p>PDF önizlemesi açılamadı.</p><a href="${escapeAttr(file.url)}" target="_blank" rel="noopener">PDF dosyasını yeni sekmede aç</a></div>`;
      $("pageInfo").textContent = "PDF açılamadı";
      disablePageButtons();
    }
  } else if (type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/.test(name)) {
    $("viewer").innerHTML = `<img alt="Paylaşılan görsel" src="${escapeAttr(file.url)}">`;
    $("pageInfo").textContent = "Görsel gösteriliyor";
    disablePageButtons();
  } else if (type.startsWith("video/") || /\.(mp4|webm|mov)$/.test(name)) {
    $("viewer").innerHTML = `<video controls autoplay playsinline src="${escapeAttr(file.url)}"></video>`;
    $("pageInfo").textContent = "Video gösteriliyor";
    disablePageButtons();
  } else if (/\.(doc|docx|ppt|pptx)$/.test(name)) {
    const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(file.url)}`;
    $("viewer").innerHTML = `<div class="office-frame"><iframe title="Office belge önizlemesi" src="${escapeAttr(officeUrl)}" allowfullscreen></iframe><p>Önizleme açılmazsa <a href="${escapeAttr(file.url)}" target="_blank" rel="noopener">dosyayı indir / aç</a>.</p></div>`;
    $("pageInfo").textContent = "Office belgesi";
    disablePageButtons();
  } else {
    $("viewer").innerHTML = `<div class="empty-state"><div class="big-icon">⇩</div><h2>${escapeHtml(file.name)}</h2><p>Bu dosya türü doğrudan önizlenemiyor.</p><a href="${escapeAttr(file.url)}" target="_blank" rel="noopener" download>Dosyayı indir / aç</a></div>`;
    $("pageInfo").textContent = "Dosya gönderildi";
    disablePageButtons();
  }
}
function disablePageButtons() { $("prevBtn").disabled = $("nextBtn").disabled = $("firstBtn").disabled = $("lastBtn").disabled = true; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function escapeAttr(s) { return escapeHtml(s); }
async function renderPage(n) {
  if (!pdfDoc) return;
  if (rendering) { pendingPage = n; return; }
  rendering = true;
  try {
    const page = await pdfDoc.getPage(n);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = $("pdfCanvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    pageNum = n;
    $("pageInfo").textContent = `${pageNum} / ${pdfDoc.numPages}`;
    $("prevBtn").disabled = $("firstBtn").disabled = pageNum <= 1;
    $("nextBtn").disabled = $("lastBtn").disabled = pageNum >= pdfDoc.numPages;
    socket.emit("page-status", { room, key, page: pageNum, total: pdfDoc.numPages, fileName: currentFile?.name || "" });
  } finally {
    rendering = false;
    if (pendingPage !== null) { const p = pendingPage; pendingPage = null; renderPage(p); }
  }
}
async function changePage(delta) {
  if (!pdfDoc) return { ok: false, error: "Tahtada açık bir PDF bulunamadı." };
  const target = Math.max(1, Math.min(pdfDoc.numPages, pageNum + delta));
  if (target === pageNum) return { ok: true, message: target === 1 ? "İlk sayfadasınız." : "Son sayfadasınız.", page: pageNum, total: pdfDoc.numPages };
  await renderPage(target);
  return { ok: true, message: `Sayfa ${pageNum} / ${pdfDoc.numPages}`, page: pageNum, total: pdfDoc.numPages };
}
async function goToPage(which) {
  if (!pdfDoc) return { ok: false, error: "Tahtada açık bir PDF bulunamadı." };
  const target = which === "first" ? 1 : pdfDoc.numPages;
  await renderPage(target);
  return { ok: true, message: which === "first" ? "İlk sayfaya gidildi." : "Son sayfaya gidildi.", page: pageNum, total: pdfDoc.numPages };
}
$("prevBtn").onclick = () => changePage(-1);
$("nextBtn").onclick = () => changePage(1);
$("firstBtn").onclick = () => goToPage("first");
$("lastBtn").onclick = () => goToPage("last");
async function toggleFullscreen() {
  const el = $("viewer");
  try {
    if (!document.fullscreenElement) await el.requestFullscreen?.();
    else await document.exitFullscreen?.();
  } catch { $("status").textContent = "Tam ekran için tahtadaki tarayıcı izni gerekli."; }
}
$("fullscreenBtn").onclick = toggleFullscreen;
document.addEventListener("keydown", e => {
  if (e.key === "ArrowRight") changePage(1);
  if (e.key === "ArrowLeft") changePage(-1);
  if (e.key.toLowerCase() === "f") toggleFullscreen();
});
