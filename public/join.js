const params = new URLSearchParams(location.search);
const room = params.get("room"), key = params.get("key");
const socket = io();
const input = document.getElementById("fileInput");
const sendBtn = document.getElementById("sendBtn");
const connection = document.getElementById("connection");
const result = document.getElementById("result");
const fileList = document.getElementById("fileList");
let connected = false;
const remoteButtons = ["firstBtn", "prevBtn", "nextBtn", "lastBtn", "clearBtn"].map(id => document.getElementById(id));

socket.on("connect", () => socket.emit("join-room", { room, key }));
socket.on("joined-room", data => {
  connected = true;
  connection.textContent = "Tahtaya bağlandınız. Kumanda ve dosya yönetimi hazır.";
  sendBtn.disabled = !input.files.length;
  remoteButtons.forEach(button => button.disabled = false);
  renderFiles(data.files || []);
});
socket.on("join-error", msg => { connection.textContent = msg; connection.style.color = "#b33"; });
socket.on("file-list", renderFiles);
socket.on("page-status", data => {
  if (!data || !data.total) return;
  const label = data.fileName ? `${data.fileName} · ` : "";
  document.getElementById("pageStatus").textContent = `${label}Sayfa ${data.page} / ${data.total}`;
});

function showResult(message, ok = true) {
  result.textContent = message;
  result.style.color = ok ? "#16835e" : "#b33";
}
function control(action, fileId) {
  if (!connected) return;
  showResult("Komut tahtaya gönderiliyor…");
  socket.timeout(9000).emit("board-action", { room, key, action, fileId }, (err, response) => {
    if (err) return showResult("Tahtadan yanıt alınamadı. Tahta sayfasını yenileyip QR kodu yeniden okutun.", false);
    if (!response || !response.ok) return showResult(response?.error || "Komut uygulanamadı.", false);
    showResult(response.message || "✓ Komut tahtada uygulandı.");
  });
}
["firstBtn", "prevBtn", "nextBtn", "lastBtn"].forEach(id => {
  const action = id.replace("Btn", "");
  document.getElementById(id).onclick = () => control(action);
});
document.getElementById("clearBtn").onclick = () => {
  if (confirm("Tahtadaki açık dosya kapatılsın mı?")) control("clear");
};

function renderFiles(files) {
  fileList.replaceChildren();
  if (!files.length) {
    const empty = document.createElement("p"); empty.className = "file-empty"; empty.textContent = "Henüz gönderilmiş dosya yok."; fileList.append(empty); return;
  }
  files.forEach(file => {
    const row = document.createElement("div"); row.className = "file-row";
    const info = document.createElement("div"); info.className = "file-info";
    const name = document.createElement("strong"); name.textContent = file.name;
    const meta = document.createElement("small"); meta.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
    info.append(name, meta);
    const actions = document.createElement("div"); actions.className = "file-actions";
    const open = document.createElement("button"); open.type = "button"; open.textContent = "Tahtada aç"; open.onclick = () => control("open-file", file.id);
    const del = document.createElement("button"); del.type = "button"; del.className = "delete-file"; del.textContent = "Sil";
    del.onclick = async () => {
      if (!confirm(`“${file.name}” dosyası silinsin mi?`)) return;
      try {
        const response = await fetch(`/api/delete-file?room=${encodeURIComponent(room)}&key=${encodeURIComponent(key)}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: file.id })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Dosya silinemedi.");
        renderFiles(data.files || []); showResult("Dosya silindi.");
      } catch (error) { showResult(error.message, false); }
    };
    actions.append(open, del); row.append(info, actions); fileList.append(row);
  });
}

input.addEventListener("change", () => {
  const file = input.files[0];
  document.getElementById("fileName").textContent = file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : "Henüz dosya seçilmedi";
  sendBtn.disabled = !connected || !file;
  result.textContent = "";
});
sendBtn.addEventListener("click", async () => {
  const file = input.files[0];
  if (!file || !connected) return;
  sendBtn.disabled = true; sendBtn.textContent = "Gönderiliyor…"; result.textContent = "";
  const body = new FormData(); body.append("file", file);
  try {
    const response = await fetch(`/api/upload?room=${encodeURIComponent(room)}&key=${encodeURIComponent(key)}`, { method: "POST", body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Gönderim başarısız.");
    renderFiles(data.files || []); showResult("✓ Dosya tahtaya gönderildi ve dosya listenize eklendi.");
    input.value = ""; document.getElementById("fileName").textContent = "Henüz dosya seçilmedi";
  } catch (e) { showResult(e.message, false); }
  finally { sendBtn.textContent = "Tahtaya gönder"; sendBtn.disabled = !connected || !input.files.length; }
});
