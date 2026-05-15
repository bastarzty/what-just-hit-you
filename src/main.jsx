import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import "./styles.css";

const foldersSeed = [
  { id: "film", name: "Film", color: "#bcd7f1" },
  { id: "writing", name: "Writing", color: "#ffef93" },
  { id: "product", name: "Product", color: "#d7c4ff" },
  { id: "life", name: "Life", color: "#c8edcf" },
];

const initialIdeas = [
  {
    id: "seed-1",
    title: "A tiny ritual app for late-night ideas",
    body: "Capture the feeling before editing it.",
    folderId: "product",
    status: "active",
    mediaType: "text",
    createdAt: Date.now() - 1000 * 60 * 50,
    updates: [
      { id: "u1", text: "Sketch first flow: capture, suggest, save.", at: Date.now() - 1000 * 60 * 35 },
    ],
  },
  {
    id: "seed-2",
    title: "Folder colors as emotional weather",
    body: "Each folder could feel like a mood instead of a category.",
    folderId: "writing",
    status: "idle",
    mediaType: "text",
    createdAt: Date.now() - 1000 * 60 * 180,
    updates: [],
  },
];

const useIdeaStore = create(
  persist(
    (set, get) => ({
      folders: foldersSeed,
      ideas: initialIdeas,
      currentScreen: "capture",
      selectedFolderId: "product",
      selectedIdeaId: "seed-1",
      pendingCapture: null,
      aiSheetOpen: false,
      goTo: (screen, payload = {}) =>
        set({
          currentScreen: screen,
          ...payload,
        }),
      captureIdea: (capture) => {
        const suggestion = suggestFolder(capture.text, get().folders);
        set({
          pendingCapture: {
            ...capture,
            suggestedFolderId: suggestion.id,
            reason: suggestion.reason,
          },
          aiSheetOpen: true,
        });
      },
      savePendingIdea: (folderId) => {
        const pending = get().pendingCapture;
        if (!pending) return;
        const idea = {
          id: crypto.randomUUID(),
          title: makeTitle(pending.text, pending.mediaType),
          body: pending.text || `${pending.mediaType} capture`,
          folderId,
          status: "active",
          mediaType: pending.mediaType,
          mediaUrl: pending.mediaUrl || "",
          createdAt: Date.now(),
          updates: [
            {
              id: crypto.randomUUID(),
              text: "Captured and sorted by idea me.",
              at: Date.now(),
            },
          ],
        };
        set((state) => ({
          ideas: [idea, ...state.ideas],
          selectedFolderId: folderId,
          selectedIdeaId: idea.id,
          pendingCapture: null,
          aiSheetOpen: false,
          currentScreen: "detail",
        }));
      },
      closeAiSheet: () => set({ aiSheetOpen: false, pendingCapture: null }),
      addUpdate: (ideaId, text) => {
        const clean = text.trim();
        if (!clean) return;
        set((state) => ({
          ideas: state.ideas.map((idea) =>
            idea.id === ideaId
              ? {
                  ...idea,
                  status: "active",
                  updates: [{ id: crypto.randomUUID(), text: clean, at: Date.now() }, ...idea.updates],
                }
              : idea,
          ),
        }));
      },
      setIdeaStatus: (ideaId, status) =>
        set((state) => ({
          ideas: state.ideas.map((idea) => (idea.id === ideaId ? { ...idea, status } : idea)),
        })),
    }),
    {
      name: "idea-me-store",
      partialize: (state) => ({
        folders: state.folders,
        ideas: state.ideas,
        selectedFolderId: state.selectedFolderId,
        selectedIdeaId: state.selectedIdeaId,
      }),
    },
  ),
);

function suggestFolder(text, folders) {
  const lower = text.toLowerCase();
  const rules = [
    { id: "film", words: ["film", "scene", "camera", "shot", "video", "movie"], reason: "It sounds visual and cinematic." },
    { id: "writing", words: ["write", "essay", "story", "poem", "sentence", "book"], reason: "It reads like something to develop in words." },
    { id: "product", words: ["app", "tool", "prototype", "feature", "user", "workflow"], reason: "It has product shape and a clear user flow." },
    { id: "life", words: ["home", "friend", "ritual", "feeling", "memory", "daily"], reason: "It feels personal and lived-in." },
  ];
  const match = rules.find((rule) => rule.words.some((word) => lower.includes(word)));
  const id = match?.id || "writing";
  return { id, reason: match?.reason || "It has the strongest creative thread here.", folder: folders.find((folder) => folder.id === id) };
}

function makeTitle(text, mediaType) {
  const clean = text.trim();
  if (!clean) return mediaType === "voice" ? "Voice idea" : mediaType === "photo" ? "Photo idea" : "Untitled idea";
  return clean.length > 54 ? `${clean.slice(0, 54)}...` : clean;
}

function App() {
  const currentScreen = useIdeaStore((state) => state.currentScreen);
  const aiSheetOpen = useIdeaStore((state) => state.aiSheetOpen);
  const screen = {
    capture: <CaptureScreen />,
    ideas: <MyIdeasScreen />,
    folder: <FolderView />,
    detail: <IdeaDetail />,
  }[currentScreen];

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="idea me mobile prototype">
        <div className="screen-transition" key={currentScreen}>
          {screen}
        </div>
        <BottomNav />
        {aiSheetOpen ? <AiBottomSheet /> : null}
      </section>
    </main>
  );
}

function CaptureScreen() {
  const [text, setText] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState("");
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const captureIdea = useIdeaStore((state) => state.captureIdea);

  const canSave = text.trim() || photoUrl || voiceUrl;

  function submitCapture() {
    if (!canSave) return;
    captureIdea({
      text: text.trim(),
      mediaType: voiceUrl ? "voice" : photoUrl ? "photo" : "text",
      mediaUrl: voiceUrl || photoUrl,
    });
    setText("");
    setPhotoUrl("");
    setVoiceUrl("");
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunks.current = [];
      recorder.ondataavailable = (event) => chunks.current.push(event.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        setVoiceUrl(await fileToDataUrl(blob));
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorder.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setText((value) => value || "Voice idea captured in words.");
    }
  }

  function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    fileToDataUrl(file).then(setPhotoUrl);
  }

  return (
    <section className="screen capture-screen">
      <header className="yellow-header">
        <div>
          <p className="eyebrow">idea me</p>
          <h1>What idea just hit you?</h1>
        </div>
        <button className="save-dot" type="button" onClick={submitCapture} aria-label="Capture idea">
          ✓
        </button>
      </header>

      <div className="capture-body">
        <label className="input-wrap">
          <span className="text-cursor" aria-hidden="true" />
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type anything"
            aria-label="Type anything"
          />
        </label>

        {photoUrl ? <img className="media-preview" src={photoUrl} alt="Captured idea" /> : null}
        {voiceUrl ? <audio className="audio-preview" src={voiceUrl} controls /> : null}
      </div>

      <div className="capture-toolbar" aria-label="Capture tools">
        <button className={recording ? "tool active" : "tool"} type="button" onClick={toggleRecording} aria-label="Record voice">
          <img src="/assets/voice-icon.svg" alt="" />
        </button>
        <label className="tool" aria-label="Upload photo">
          <img src="/assets/image-icon.svg" alt="" />
          <input type="file" accept="image/*" onChange={handlePhoto} />
        </label>
        <label className="tool" aria-label="Open camera">
          <span className="camera-glyph" />
          <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} />
        </label>
      </div>
    </section>
  );
}

function MyIdeasScreen() {
  const folders = useIdeaStore((state) => state.folders);
  const ideas = useIdeaStore((state) => state.ideas);
  const goTo = useIdeaStore((state) => state.goTo);
  const counts = useMemo(
    () => Object.fromEntries(folders.map((folder) => [folder.id, ideas.filter((idea) => idea.folderId === folder.id).length])),
    [folders, ideas],
  );

  return (
    <section className="screen content-screen">
      <ScreenHeader title="My Ideas" subtitle={`${ideas.length} captured sparks`} />
      <div className="folder-grid">
        {folders.map((folder) => (
          <button
            className="folder-tile"
            key={folder.id}
            style={{ "--folder-color": folder.color }}
            type="button"
            onClick={() => goTo("folder", { selectedFolderId: folder.id })}
          >
            <span className="folder-tab" />
            <strong>{folder.name}</strong>
            <small>{counts[folder.id]} ideas</small>
          </button>
        ))}
      </div>
      <h2 className="section-title">Recent ideas</h2>
      <div className="idea-list">
        {ideas.slice(0, 4).map((idea) => (
          <IdeaRow key={idea.id} idea={idea} />
        ))}
      </div>
    </section>
  );
}

function FolderView() {
  const [filter, setFilter] = useState("all");
  const folders = useIdeaStore((state) => state.folders);
  const ideas = useIdeaStore((state) => state.ideas);
  const selectedFolderId = useIdeaStore((state) => state.selectedFolderId);
  const folder = folders.find((item) => item.id === selectedFolderId) || folders[0];
  const filteredIdeas = ideas.filter((idea) => idea.folderId === folder.id && (filter === "all" || idea.status === filter));

  return (
    <section className="screen content-screen">
      <ScreenHeader title={folder.name} subtitle="Track what is moving and what is resting" />
      <div className="tab-row">
        {["all", "active", "idle"].map((tab) => (
          <button className={filter === tab ? "tab active" : "tab"} key={tab} type="button" onClick={() => setFilter(tab)}>
            {tab}
          </button>
        ))}
      </div>
      <div className="idea-card-list">
        {filteredIdeas.map((idea) => (
          <IdeaCard key={idea.id} idea={idea} folderColor={folder.color} />
        ))}
      </div>
    </section>
  );
}

function IdeaDetail() {
  const [updateText, setUpdateText] = useState("");
  const folders = useIdeaStore((state) => state.folders);
  const ideas = useIdeaStore((state) => state.ideas);
  const selectedIdeaId = useIdeaStore((state) => state.selectedIdeaId);
  const addUpdate = useIdeaStore((state) => state.addUpdate);
  const setIdeaStatus = useIdeaStore((state) => state.setIdeaStatus);
  const idea = ideas.find((item) => item.id === selectedIdeaId) || ideas[0];
  const folder = folders.find((item) => item.id === idea?.folderId);

  if (!idea) return <section className="screen content-screen"><ScreenHeader title="No idea yet" subtitle="Capture one first" /></section>;

  function submitUpdate() {
    addUpdate(idea.id, updateText);
    setUpdateText("");
  }

  return (
    <section className="screen content-screen detail-screen">
      <ScreenHeader title={idea.title} subtitle={folder?.name || "Idea"} />
      <div className="detail-card">
        <p>{idea.body}</p>
        {idea.mediaUrl && idea.mediaType === "photo" ? <img src={idea.mediaUrl} alt="" /> : null}
        {idea.mediaUrl && idea.mediaType === "voice" ? <audio src={idea.mediaUrl} controls /> : null}
        <div className="status-switch">
          <button className={idea.status === "active" ? "active" : ""} type="button" onClick={() => setIdeaStatus(idea.id, "active")}>active</button>
          <button className={idea.status === "idle" ? "active" : ""} type="button" onClick={() => setIdeaStatus(idea.id, "idle")}>idle</button>
        </div>
      </div>

      <div className="update-box">
        <input value={updateText} onChange={(event) => setUpdateText(event.target.value)} placeholder="Add an update" />
        <button type="button" onClick={submitUpdate}>Add</button>
      </div>

      <div className="timeline">
        <TimelineItem text="Idea captured" at={idea.createdAt} />
        {idea.updates.map((update) => (
          <TimelineItem key={update.id} text={update.text} at={update.at} />
        ))}
      </div>
    </section>
  );
}

function AiBottomSheet() {
  const folders = useIdeaStore((state) => state.folders);
  const pendingCapture = useIdeaStore((state) => state.pendingCapture);
  const savePendingIdea = useIdeaStore((state) => state.savePendingIdea);
  const closeAiSheet = useIdeaStore((state) => state.closeAiSheet);
  const suggested = folders.find((folder) => folder.id === pendingCapture?.suggestedFolderId) || folders[0];
  const [selected, setSelected] = useState(suggested.id);

  return (
    <div className="sheet-backdrop">
      <section className="ai-sheet">
        <div className="grabber" />
        <p className="eyebrow">AI suggestion</p>
        <h2>Save this to {suggested.name}?</h2>
        <p>{pendingCapture?.reason}</p>
        <div className="folder-pills">
          {folders.map((folder) => (
            <button
              className={selected === folder.id ? "pill active" : "pill"}
              key={folder.id}
              type="button"
              onClick={() => setSelected(folder.id)}
              style={{ "--folder-color": folder.color }}
            >
              {folder.name}
            </button>
          ))}
        </div>
        <div className="sheet-actions">
          <button type="button" onClick={closeAiSheet}>Not now</button>
          <button type="button" onClick={() => savePendingIdea(selected)}>Save idea</button>
        </div>
      </section>
    </div>
  );
}

function BottomNav() {
  const currentScreen = useIdeaStore((state) => state.currentScreen);
  const goTo = useIdeaStore((state) => state.goTo);
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <button className={currentScreen === "capture" ? "active" : ""} type="button" onClick={() => goTo("capture")}>Capture</button>
      <button className={currentScreen === "ideas" ? "active" : ""} type="button" onClick={() => goTo("ideas")}>Ideas</button>
    </nav>
  );
}

function ScreenHeader({ title, subtitle }) {
  return (
    <header className="screen-header">
      <p className="eyebrow">idea me</p>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}

function IdeaRow({ idea }) {
  const folders = useIdeaStore((state) => state.folders);
  const goTo = useIdeaStore((state) => state.goTo);
  const folder = folders.find((item) => item.id === idea.folderId);
  return (
    <button className="idea-row" type="button" onClick={() => goTo("detail", { selectedIdeaId: idea.id })}>
      <span style={{ background: folder?.color }} />
      <div>
        <strong>{idea.title}</strong>
        <small>{idea.status} / {relativeTime(idea.createdAt)}</small>
      </div>
    </button>
  );
}

function IdeaCard({ idea, folderColor }) {
  const goTo = useIdeaStore((state) => state.goTo);
  return (
    <button className="idea-card" type="button" onClick={() => goTo("detail", { selectedIdeaId: idea.id })}>
      <span className="status-dot" style={{ background: folderColor }} />
      <strong>{idea.title}</strong>
      <p>{idea.body}</p>
      <small>{idea.status} / {idea.updates.length} updates</small>
    </button>
  );
}

function TimelineItem({ text, at }) {
  return (
    <article className="timeline-item">
      <span />
      <div>
        <small>{relativeTime(at)}</small>
        <p>{text}</p>
      </div>
    </article>
  );
}

function relativeTime(time) {
  const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

createRoot(document.getElementById("root")).render(<App />);
