const phone = document.querySelector(".phone");
const composer = document.querySelector("#composer");
const entryInput = document.querySelector("#entryInput");
const doneButton = document.querySelector("#doneButton");
const timeLabel = document.querySelector("#timeLabel");
const entries = document.querySelector("#entries");
const imageInput = document.querySelector("#imageInput");
const imageButton = document.querySelector("#imageButton");
const voiceButton = document.querySelector("#voiceButton");
const moodButton = document.querySelector("#moodButton");
const penButton = document.querySelector("#penButton");
const attachmentPreview = document.querySelector("#attachmentPreview");
const previewImage = document.querySelector("#previewImage");
const removeImage = document.querySelector("#removeImage");
const sketchPad = document.querySelector("#sketchPad");
const ctx = sketchPad.getContext("2d");
const STORAGE_KEY = "what-hit-you.entries";

let drawing = false;

function updateTime() {
  const now = new Date();
  timeLabel.textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(now)
    .replace(",", ",")
    .toUpperCase();
}

function setCompact(value) {
  phone.classList.toggle("compact", value);
  composer.classList.toggle("composer-full", !value);
}

function resetPanels(except) {
  if (except !== "pen") sketchPad.hidden = true;
  penButton.classList.toggle("active", except === "pen");
}

function addEntry() {
  const text = entryInput.value.trim();
  const hasImage = Boolean(previewImage.src);
  const hasSketch = !isCanvasBlank();
  if (!text && !hasImage && !hasSketch) return;

  const stamp = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  const parts = [];
  if (hasImage) parts.push("image");
  if (hasSketch) parts.push("sketch");
  const entry = {
    text: text || "Captured",
    meta: `${stamp}${parts.length ? " / " + parts.join(" / ") : ""}`,
  };
  renderEntry(entry);
  saveEntry(entry);

  entryInput.value = "";
  previewImage.removeAttribute("src");
  attachmentPreview.hidden = true;
  clearCanvas();
  resetPanels();
  setCompact(true);
}

function renderEntry(entry) {
  const card = document.createElement("article");
  card.className = "entry-card";
  card.innerHTML = `<small>${escapeHtml(entry.meta)}</small>${escapeHtml(entry.text)}`;
  entries.prepend(card);
}

function saveEntry(entry) {
  const saved = getSavedEntries();
  saved.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 12)));
}

function getSavedEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function restoreEntries() {
  getSavedEntries().reverse().forEach(renderEntry);
  if (entries.children.length > 0) setCompact(true);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function clearCanvas() {
  ctx.clearRect(0, 0, sketchPad.width, sketchPad.height);
}

function isCanvasBlank() {
  const pixels = ctx.getImageData(0, 0, sketchPad.width, sketchPad.height).data;
  return !pixels.some((value) => value !== 0);
}

function pointForEvent(event) {
  const rect = sketchPad.getBoundingClientRect();
  const source = event.touches ? event.touches[0] : event;
  return {
    x: ((source.clientX - rect.left) / rect.width) * sketchPad.width,
    y: ((source.clientY - rect.top) / rect.height) * sketchPad.height,
  };
}

function beginDraw(event) {
  drawing = true;
  const point = pointForEvent(event);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
}

function draw(event) {
  if (!drawing) return;
  event.preventDefault();
  const point = pointForEvent(event);
  ctx.lineTo(point.x, point.y);
  ctx.strokeStyle = "#2e241b";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function stopDraw() {
  drawing = false;
}

entryInput.addEventListener("focus", () => setCompact(false));
doneButton.addEventListener("click", addEntry);

imageButton.addEventListener("click", () => {
  resetPanels();
  imageInput.click();
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  previewImage.src = URL.createObjectURL(file);
  attachmentPreview.hidden = false;
  setCompact(false);
});

removeImage.addEventListener("click", () => {
  previewImage.removeAttribute("src");
  attachmentPreview.hidden = true;
});

voiceButton.addEventListener("click", () => {
  resetPanels();
  composer.classList.add("recording");
  voiceButton.classList.add("active");
  setTimeout(() => {
    composer.classList.remove("recording");
    voiceButton.classList.remove("active");
    entryInput.value = entryInput.value ? `${entryInput.value}\nVoice note captured.` : "Voice note captured.";
    entryInput.focus();
  }, 900);
});

moodButton.addEventListener("click", () => {
  resetPanels();
  moodButton.classList.add("active");
  setTimeout(() => moodButton.classList.remove("active"), 220);
});

penButton.addEventListener("click", () => {
  const next = sketchPad.hidden;
  resetPanels(next ? "pen" : undefined);
  sketchPad.hidden = !next;
});

sketchPad.addEventListener("mousedown", beginDraw);
sketchPad.addEventListener("mousemove", draw);
window.addEventListener("mouseup", stopDraw);
sketchPad.addEventListener("touchstart", beginDraw, { passive: false });
sketchPad.addEventListener("touchmove", draw, { passive: false });
window.addEventListener("touchend", stopDraw);

updateTime();
restoreEntries();
entryInput.focus();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
