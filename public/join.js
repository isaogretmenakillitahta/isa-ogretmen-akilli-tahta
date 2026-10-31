const params = new URLSearchParams(location.search);
const room = params.get("room"), key = params.get("key");
const socket = io();
const input = document.getElementById("fileInput");
const sendBtn = document.getElementById("sendBtn");
const connection = document.getElementById("connection");
const result = document.getElementById("result");
let connected = false;
const remoteButtons = ["prevBtn", "nextBtn", "clearBtn"].map(id => document.getElementById(id));

socket.on("connect", () => socket.emit("join-room", {room, key}));
socket.on("joined-room", () => {
  connected = true;
  connection.textContent = "Tahtaya bağlandınız. Kumanda ve dosya gönderimi hazır.";
  sendBtn.disabled = !input.files.length;
  remoteButtons.forEach(button => button.disabled = false);
});
socket.on("join-error", msg => { connection.textContent = msg; connection.style.color = "#b33"; });

function control(action) {
  if (!connected) return;
  result.textContent = "Komut tahtaya gönderiliyor…";
  result.style.color = "#53657d";
  socket.timeout(7000).emit("board-action", {room, key, action}, (err, response) => {
    if (err) {
      result.textContent = "Tahtadan yanıt alınamadı. Tahta sayfasını yenileyip QR kodu yeniden okutun.";
      result.style.color = "#b33";
      return;
    }
    if (!response || !response.ok) {
      result.textContent = response?.error || "Komut uygulanamadı.";
      result.style.color = "#b33";
      return;
    }
    result.textContent = response.message || "✓ Komut tahtada uygulandı.";
    result.style.color = "#16835e";
  });
}
document.getElementById("prevBtn").onclick = () => control("prev");
document.getElementById("nextBtn").onclick = () => control("next");
document.getElementById("clearBtn").onclick = () => {
  if (confirm("Tahtadaki açık dosya kapatılsın mı?")) control("clear");
};

input.addEventListener("change", () => {
  const file = input.files[0];
  document.getElementById("fileName").textContent = file ? `${file.name} (${(file.size/1024/1024).toFixed(1)} MB)` : "Henüz dosya seçilmedi";
  sendBtn.disabled = !connected || !file;
  result.textContent = "";
});
sendBtn.addEventListener("click", async () => {
  const file = input.files[0];
  if (!file || !connected) return;
  sendBtn.disabled = true; sendBtn.textContent = "Gönderiliyor…"; result.textContent = "";
  const body = new FormData(); body.append("file", file);
  try {
    const response = await fetch(`/api/upload?room=${encodeURIComponent(room)}&key=${encodeURIComponent(key)}`, {method:"POST", body});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Gönderim başarısız.");
    result.textContent = "✓ Dosya tahtaya gönderildi.";
    result.style.color = "#16835e";
  } catch (e) {
    result.textContent = e.message; result.style.color = "#b33";
  } finally { sendBtn.textContent = "Tahtaya gönder"; sendBtn.disabled = !connected || !input.files.length; }
});