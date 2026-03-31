import { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";

const API_KEY = import.meta.env.VITE_YT_API_KEY;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getBestThumb(thumbnails) {
  return (
    thumbnails?.maxres?.url ||
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    ""
  );
}

function fmt(raw = "") {
  return raw.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const TELUGU_QUERIES = [
  "Pushpa 2 Telugu songs 2024",
  "Kalki 2898 AD Telugu hits",
  "Ala Vaikunthapurramuloo songs",
  "RRR Telugu songs",
  "Srivalli Telugu song",
  "Buttabomma Telugu song",
  "Samajavaragamana Telugu song",
];

// Tiny silent mp3 (0.1s) as a data URI — keeps OS audio session alive
const SILENT_MP3 = "data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

// ── Main App ──────────────────────────────────────────────────────────────────
export default function HarishMusicHub() {
  const [section, setSection]       = useState("home");
  const [isMobile, setIsMobile]     = useState(window.innerWidth <= 932);

  // Name & greeting
  const [userName, setUserName]     = useState(() => localStorage.getItem("musicHubUserName") || "");
  const [nameInput, setNameInput]   = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("musicHubUserName")) setShowNamePrompt(true);
  }, []);

  function getGreeting() {
    const h = new Date().getHours();
    if (h >= 5  && h < 12) return "Good Morning";
    if (h >= 12 && h < 17) return "Good Afternoon";
    if (h >= 17 && h < 21) return "Good Evening";
    return "Good Night";
  }

  function saveName() {
    const n = nameInput.trim();
    if (!n) return;
    localStorage.setItem("musicHubUserName", n);
    setUserName(n);
    setShowNamePrompt(false);
  }

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= 932); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [lyrics, setLyrics]         = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError]     = useState("");

  // AI Chat state
  const [chatMessages, setChatMessages] = useState([
    { role: "ai", text: "Hi! Tell me what you want to listen to. Try something like \"I'm feeling happy\" or \"play something like Srivalli\" 🎵" }
  ]);
  const [chatInput, setChatInput]   = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef                  = useRef(null);

  const [tracks, setTracks]         = useState([]);
  const [currentIdx, setCurrentIdx] = useState(null);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [duration, setDuration]     = useState(0);
  const [elapsed, setElapsed]       = useState(0);
  const [volume, setVolume]         = useState(80);
  const [isMuted, setIsMuted]       = useState(false);

  const [query, setQuery]           = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const suggestDebounceRef          = useRef(null);

  const [harishTracks, setHarishTracks]   = useState([]);
  const [harishLoading, setHarishLoading] = useState(false);

  // Voice assistant state
  const [isListening, setIsListening]     = useState(false);
  const [voiceMode, setVoiceMode]         = useState(null); // 'chat' | 'command'
  const recognitionRef                    = useRef(null);

  // ── Speech synthesis (announce song) ─────────────────────────────────────
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1; utter.pitch = 1; utter.volume = 1;
    window.speechSynthesis.speak(utter);
  }

  // ── Speech recognition setup ──────────────────────────────────────────────
  function startListening(mode) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported in this browser. Try Chrome."); return; }
    if (recognitionRef.current) recognitionRef.current.abort();

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    setVoiceMode(mode);
    setIsListening(true);

    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript.trim();
      setIsListening(false);
      setVoiceMode(null);
      if (mode === "chat") {
        setChatInput(transcript);
        setTimeout(() => handleChatSendWithText(transcript), 100);
      } else if (mode === "command") {
        handleVoiceCommand(transcript);
      }
    };
    rec.onerror = () => { setIsListening(false); setVoiceMode(null); };
    rec.onend   = () => { setIsListening(false); setVoiceMode(null); };
    rec.start();
  }

  function stopListening() {
    recognitionRef.current?.abort();
    setIsListening(false);
    setVoiceMode(null);
  }

  // ── Voice commands ────────────────────────────────────────────────────────
  function handleVoiceCommand(text) {
    const t = text.toLowerCase();
    if (t.includes("next"))                        { playNext(); speak("Next song"); }
    else if (t.includes("previous") || t.includes("prev") || t.includes("back")) { playPrev(); speak("Previous song"); }
    else if (t.includes("pause") || t.includes("stop"))  { playerRef.current?.pauseVideo(); speak("Paused"); }
    else if (t.includes("play") && !t.includes("play something") && !t.includes("play like")) {
      playerRef.current?.playVideo(); speak("Playing");
    }
    else if (t.includes("volume up"))   { const v = Math.min(100, volume + 20); setVolume(v); playerRef.current?.setVolume(v); speak("Volume up"); }
    else if (t.includes("volume down")) { const v = Math.max(0,   volume - 20); setVolume(v); playerRef.current?.setVolume(v); speak("Volume down"); }
    else {
      // Treat as AI music request
      speak("Looking for music for you");
      handleChatSendWithText(text);
      setSection("ai");
    }
  }

  const playerRef      = useRef(null);
  const containerRef   = useRef(null);
  const silentAudioRef = useRef(null);
  const progressRef    = useRef(null);
  const tickRef        = useRef(null);
  const currentIdxRef  = useRef(currentIdx);
  const tracksRef      = useRef(tracks);

  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  // ── YouTube IFrame API ────────────────────────────────────────────────────
  useEffect(() => {
    if (window.YT?.Player) { initPlayer(); return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = initPlayer;
  }, []);

  function initPlayer() {
    if (playerRef.current) return;
    playerRef.current = new window.YT.Player(containerRef.current, {
      height: "0", width: "0",
      playerVars: { autoplay: 1, controls: 0, disablekb: 1 },
      events: {
        onReady: (e) => {
          setPlayerReady(true);
          e.target.setVolume(80);
        },
        onStateChange: (e) => {
          const YT = window.YT.PlayerState;
          if (e.data === YT.PLAYING) {
            setIsPlaying(true);
            setDuration(playerRef.current.getDuration());
            startTick();
            // Start silent audio to keep OS audio session alive
            silentAudioRef.current?.play().catch(() => {});
          }
          if (e.data === YT.PAUSED)  { setIsPlaying(false); stopTick(); }
          if (e.data === YT.ENDED)   { stopTick(); playNext(); }
        },
      },
    });
  }

  // ── Progress ticker ───────────────────────────────────────────────────────
  function startTick() {
    stopTick();
    tickRef.current = setInterval(() => {
      if (playerRef.current?.getCurrentTime) {
        setElapsed(playerRef.current.getCurrentTime());
        setDuration(playerRef.current.getDuration());
      }
    }, 500);
  }

  function stopTick() { clearInterval(tickRef.current); }
  useEffect(() => () => stopTick(), []);

  // ── Resume playback if browser paused it on screen lock ──────────────────
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible" && isPlaying) {
        const state = playerRef.current?.getPlayerState?.();
        if (state === 2) playerRef.current.playVideo(); // 2 = PAUSED
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isPlaying]);

  // ── Media Session API (lock-screen controls) ──────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator) || currentIdx === null) return;
    const track = tracksRef.current[currentIdx];
    if (!track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  fmt(track.snippet.title),
      artist: track.snippet.channelTitle,
      artwork: [{ src: getBestThumb(track.snippet.thumbnails), sizes: "512x512", type: "image/jpeg" }],
    });
    navigator.mediaSession.setActionHandler("play",          () => playerRef.current?.playVideo());
    navigator.mediaSession.setActionHandler("pause",         () => playerRef.current?.pauseVideo());
    navigator.mediaSession.setActionHandler("previoustrack", () => playPrev());
    navigator.mediaSession.setActionHandler("nexttrack",     () => playNext());
  }, [currentIdx]);

  // ── Seek ──────────────────────────────────────────────────────────────────
  function handleSeek(e) {
    if (!playerRef.current || !duration) return;
    const rect  = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    playerRef.current.seekTo(ratio * duration, true);
    setElapsed(ratio * duration);
  }

  // ── Volume ────────────────────────────────────────────────────────────────
  function handleVolume(e) {
    const v = Number(e.target.value);
    setVolume(v);
    setIsMuted(v === 0);
    playerRef.current?.setVolume(v);
  }

  function toggleMute() {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute();
      playerRef.current.setVolume(volume || 80);
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  }

  // ── Playback ──────────────────────────────────────────────────────────────
  const playTrack = useCallback((idx) => {
    if (!playerRef.current || !tracksRef.current[idx]) return;
    playerRef.current.loadVideoById(tracksRef.current[idx].id.videoId);
    setCurrentIdx(idx);
    setIsPlaying(true);
    setElapsed(0);
    setDuration(0);
    // Announce song
    const track = tracksRef.current[idx];
    const title  = fmt(track.snippet.title).replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "").trim();
    const artist = track.snippet.channelTitle;
    setTimeout(() => speak(`Now playing: ${title} by ${artist}`), 500);
  }, []);

  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    isPlaying ? playerRef.current.pauseVideo() : playerRef.current.playVideo();
  }, [isPlaying]);

  const playNext = useCallback(() => {
    const idx  = currentIdxRef.current;
    const list = tracksRef.current;
    if (idx === null || !list.length) return;
    playTrack((idx + 1) % list.length);
  }, [playTrack]);

  const playPrev = useCallback(() => {
    const idx  = currentIdxRef.current;
    const list = tracksRef.current;
    if (idx === null || !list.length) return;
    playTrack((idx - 1 + list.length) % list.length);
  }, [playTrack]);

  // ── AI Chat ───────────────────────────────────────────────────────────────
  async function handleChatSendWithText(msg) {
    if (!msg || chatLoading) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChatMessages((prev) => [...prev, { role: "ai", text: data.message }]);
      speak(data.message);
      const items = await fetchTracks(data.query + " audio");
      if (items.length) {
        setTracks(items);
        setCurrentIdx(null);
        playTrack(0);
        const trackTitle = fmt(items[0].snippet.title);
        setChatMessages((prev) => [
          ...prev,
          { role: "ai", text: `Playing: "${trackTitle}" and ${items.length - 1} more tracks 🎵` },
        ]);
      }
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: "ai", text: "Sorry, something went wrong. Try again!" }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  async function handleChatSend() {
    handleChatSendWithText(chatInput.trim());
  }

  function handleChatKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
  }

  // ── Search ────────────────────────────────────────────────────────────────
  async function fetchTracks(q, opts = {}) {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoCategoryId=10&maxResults=${opts.max || 20}&key=${API_KEY}`
    );
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return data.items || [];
  }

  async function searchTracks(overrideQuery) {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    setSuggestions([]);
    setShowSuggestions(false);
    setLoading(true);
    setError("");
    try {
      const items = await fetchTracks(q + " audio");
      if (!items.length) { setError("No results found."); setSearchResults([]); }
      else { setSearchResults(items); setTracks(items); setCurrentIdx(null); }
    } catch {
      setError("Search failed. Check API key or connection.");
    } finally {
      setLoading(false);
    }
  }

  function handleQueryChange(e) {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(suggestDebounceRef.current);
    if (!val.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    suggestDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(val)}&type=video&videoCategoryId=10&maxResults=6&key=${API_KEY}`
        );
        const data = await res.json();
        const items = (data.items || []).map((item) => fmt(item.snippet.title));
        setSuggestions(items);
        setShowSuggestions(items.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 400);
  }

  function handleSuggestionClick(s) {
    setQuery(s);
    setSuggestions([]);
    setShowSuggestions(false);
    searchTracks(s);
    setSection("search");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") { searchTracks(); setSection("search"); }
    if (e.key === "Escape") { setSuggestions([]); setShowSuggestions(false); }
  }

  // ── Share ─────────────────────────────────────────────────────────────────
  const [shareCopied, setShareCopied] = useState(false);

  async function handleShare() {
    const shareData = {
      title: "Harish MusicHub",
      text: "Check out Harish MusicHub — listen to music & Telugu hits!",
      url: "https://the-saligama-musichub.vercel.app",
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await navigator.clipboard.writeText(shareData.url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  }

  const currentTrack = currentIdx !== null ? tracks[currentIdx] : null;
  const progressPct  = duration > 0 ? (elapsed / duration) * 100 : 0;

  // ── Lyrics ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (section !== "lyrics" || !currentTrack) return;
    const title  = fmt(currentTrack.snippet.title);
    const artist = currentTrack.snippet.channelTitle;
    const cleanTitle = title
      .replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "")
      .replace(/ft\..*$/i, "").replace(/feat\..*$/i, "").trim();
    setLyrics(""); setLyricsError(""); setLyricsLoading(true);
    fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(cleanTitle)}`)
      .then((r) => r.json())
      .then((data) => { if (data.lyrics) setLyrics(data.lyrics); else setLyricsError("Lyrics not found for this track."); })
      .catch(() => setLyricsError("Could not fetch lyrics. Try again later."))
      .finally(() => setLyricsLoading(false));
  }, [section, currentTrack]);

  // ── Harish Rocks ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (section !== "harish" || harishTracks.length > 0) return;
    setHarishLoading(true);
    const q = TELUGU_QUERIES[Math.floor(Math.random() * TELUGU_QUERIES.length)];
    fetchTracks(q + " audio", { max: 20 })
      .then((items) => { setHarishTracks(items); setTracks(items); })
      .catch(() => {})
      .finally(() => setHarishLoading(false));
  }, [section]);

  useEffect(() => {
    if (section === "search" && searchResults.length) setTracks(searchResults);
    if (section === "harish" && harishTracks.length)  setTracks(harishTracks);
  }, [section]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`app ${isMobile ? "is-mobile" : "is-desktop"}`}>
      {/* Hidden YouTube player */}
      <div ref={containerRef} style={{ display: "none" }} />

      {/* Silent looping audio — keeps OS audio session alive so YouTube keeps playing on lock */}
      <audio
        ref={silentAudioRef}
        src={SILENT_MP3}
        loop
        style={{ display: "none" }}
      />

      {/* ── Left nav — desktop only ── */}
      {!isMobile && <nav className="nav">
        <div className="nav-logo">
          <span className="nav-logo-icon">♪</span>
          <div className="nav-logo-text">
            <span className="nav-logo-name">Harish</span>
            <span className="nav-logo-sub">MusicHub</span>
          </div>
          <button className="share-btn" onClick={handleShare} title="Share app">↗</button>
        </div>

        <ul className="nav-links">
          <li><button className={`nav-btn ${section === "home"   ? "active" : ""}`} onClick={() => setSection("home")}><span className="nav-icon">⌂</span> Home</button></li>
          <li><button className={`nav-btn ${section === "search" ? "active" : ""}`} onClick={() => setSection("search")}><span className="nav-icon">⌕</span> Search</button></li>
          <li>
            <button className={`nav-btn harish-btn ${section === "harish" ? "active" : ""}`} onClick={() => setSection("harish")}>
              <span className="nav-icon">🎶</span><span>Harish Rocks</span><span className="nav-badge">Telugu</span>
            </button>
          </li>
          <li>
            <button className={`nav-btn ${section === "lyrics" ? "active" : ""}`} onClick={() => setSection("lyrics")} disabled={!currentTrack} title={!currentTrack ? "Play a track first" : ""}>
              <span className="nav-icon">📝</span> Lyrics
            </button>
          </li>
          <li><button className={`nav-btn ${section === "about" ? "active" : ""}`} onClick={() => setSection("about")}><span className="nav-icon">ℹ</span> About</button></li>
          <li><button className={`nav-btn ai-btn ${section === "ai" ? "active" : ""}`} onClick={() => setSection("ai")}><span className="nav-icon">🤖</span> AI Assistant</button></li>
        </ul>

        <div className="queue-label">
          {section === "harish" ? "Telugu Hits" : "Queue"}
          {tracks.length > 0 && <span className="queue-count">{tracks.length}</span>}
        </div>
        <ul className="queue">
          {tracks.length === 0 && <li className="queue-empty">{section === "harish" ? "Loading Telugu hits…" : "Search to fill the queue"}</li>}
          {tracks.map((track, idx) => {
            const active = idx === currentIdx;
            return (
              <li key={track.id.videoId + idx} className={`queue-item ${active ? "active" : ""}`} onClick={() => playTrack(idx)}>
                <span className="queue-num">{active && isPlaying ? "▶" : idx + 1}</span>
                <img src={getBestThumb(track.snippet.thumbnails)} alt="" className="queue-thumb" />
                <div className="queue-info">
                  <span className="queue-title">{fmt(track.snippet.title)}</span>
                  <span className="queue-artist">{track.snippet.channelTitle}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>}

      {/* ── Main content ── */}
      <main className="main">

        {section === "home" && (
          <div className="home-section">
            <h1 className="home-greeting">{getGreeting()}, {userName || "there"}! Have a nice day 🎵</h1>
            <div className="share-row">
              <button className="share-btn-home" onClick={handleShare}>{shareCopied ? "✓ Copied!" : "↗ Share"}</button>
              <a className="share-btn-whatsapp" href="https://wa.me/?text=Check%20out%20Harish%20MusicHub%20%F0%9F%8E%B5%20https://the-saligama-musichub.vercel.app" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.852L.057 23.569a.75.75 0 0 0 .921.921l5.717-1.475A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.716 9.716 0 0 1-4.953-1.356l-.355-.211-3.676.948.968-3.542-.232-.368A9.712 9.712 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
              </a>
            </div>
            <div className="search-hero" style={{ position: "relative" }}>
              <input className="search-input-hero" value={query} onChange={handleQueryChange} onKeyDown={handleKeyDown} placeholder="What do you want to listen to?" autoComplete="off" />
              <button className="search-btn-hero" onClick={() => { searchTracks(); setSection("search"); }} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
              {showSuggestions && suggestions.length > 0 && (
                <ul className="suggestions-dropdown">
                  {suggestions.map((s) => (
                    <li key={s} className="suggestion-item" onMouseDown={() => handleSuggestionClick(s)}>
                      <span className="suggestion-icon">⌕</span> {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="home-cards">
              <div className="home-card harish-card" onClick={() => setSection("harish")}>
                <div className="home-card-icon">🎶</div>
                <div><div className="home-card-title">Harish Rocks</div><div className="home-card-sub">Telugu hits, handpicked</div></div>
              </div>
              <div className="home-card search-card" onClick={() => setSection("search")}>
                <div className="home-card-icon">⌕</div>
                <div><div className="home-card-title">Browse Music</div><div className="home-card-sub">Search any song</div></div>
              </div>
            </div>
            {currentTrack && (
              <div className="home-now-playing">
                <img src={getBestThumb(currentTrack.snippet.thumbnails)} alt="" className="home-np-art" />
                <div>
                  <div className="home-np-label">Now Playing</div>
                  <div className="home-np-title">{fmt(currentTrack.snippet.title)}</div>
                  <div className="home-np-artist">{currentTrack.snippet.channelTitle}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {section === "search" && (
          <div className="search-section">
            <div className="search-bar-row" style={{ position: "relative" }}>
              <input className="search-input-main" value={query} onChange={handleQueryChange} onKeyDown={handleKeyDown} placeholder="Search songs, artists, albums…" autoFocus autoComplete="off" />
              {query && (
                <button className="search-clear-btn" onClick={() => { setQuery(""); setSuggestions([]); setShowSuggestions(false); setSearchResults([]); setError(""); }} title="Clear">✕</button>
              )}
              <button className="search-btn-main" onClick={() => searchTracks()} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
              {showSuggestions && suggestions.length > 0 && (
                <ul className="suggestions-dropdown">
                  {suggestions.map((s) => (
                    <li key={s} className="suggestion-item" onMouseDown={() => handleSuggestionClick(s)}>
                      <span className="suggestion-icon">⌕</span> {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {error && <p className="search-error">{error}</p>}
            {searchResults.length > 0 && (
              <>
                <div className="results-header">Results for <em>"{query}"</em> — {searchResults.length} tracks</div>
                <div className="results-grid">
                  {searchResults.map((track, idx) => (
                    <div key={track.id.videoId} className={`result-card ${idx === currentIdx && tracks === searchResults ? "active" : ""}`} onClick={() => { setTracks(searchResults); playTrack(idx); }}>
                      <img src={getBestThumb(track.snippet.thumbnails)} alt="" className="result-thumb" />
                      <div className="result-info">
                        <span className="result-title">{fmt(track.snippet.title)}</span>
                        <span className="result-artist">{track.snippet.channelTitle}</span>
                      </div>
                      <button className="result-play-btn">▶</button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {searchResults.length === 0 && !loading && !error && (
              <div className="search-empty"><div className="search-empty-icon">⌕</div><p>Start typing to search for music</p></div>
            )}
          </div>
        )}

        {section === "harish" && (
          <div className="harish-section">
            <div className="harish-header">
              <div className="harish-banner">
                <div className="harish-banner-text"><h1>🎶 Harish Rocks</h1><p>The best of Telugu cinema — for Harish</p></div>
              </div>
            </div>
            {harishLoading && <div className="harish-loading">Loading Telugu hits…</div>}
            {!harishLoading && harishTracks.length > 0 && (
              <div className="harish-list">
                <div className="harish-list-head"><span>#</span><span>Title</span><span>Artist / Channel</span></div>
                {harishTracks.map((track, idx) => {
                  const active = idx === currentIdx && tracks === harishTracks;
                  return (
                    <div key={track.id.videoId} className={`harish-row ${active ? "active" : ""}`} onClick={() => { setTracks(harishTracks); playTrack(idx); }}>
                      <span className="harish-num">{active && isPlaying ? "▶" : idx + 1}</span>
                      <img src={getBestThumb(track.snippet.thumbnails)} alt="" className="harish-thumb" />
                      <div className="harish-track-info"><span className="harish-track-title">{fmt(track.snippet.title)}</span></div>
                      <span className="harish-artist">{track.snippet.channelTitle}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {section === "lyrics" && (
          <div className="lyrics-section">
            {!currentTrack ? (
              <div className="lyrics-empty"><div className="lyrics-empty-icon">📝</div><p>Play a track first to see its lyrics</p></div>
            ) : (
              <>
                <div className="lyrics-header">
                  <img src={getBestThumb(currentTrack.snippet.thumbnails)} alt="" className="lyrics-art" />
                  <div>
                    <div className="lyrics-track-title">{fmt(currentTrack.snippet.title)}</div>
                    <div className="lyrics-track-artist">{currentTrack.snippet.channelTitle}</div>
                  </div>
                </div>
                {lyricsLoading && <div className="lyrics-loading">Fetching lyrics…</div>}
                {lyricsError   && <div className="lyrics-error">{lyricsError}</div>}
                {lyrics && <pre className="lyrics-body">{lyrics}</pre>}
              </>
            )}
          </div>
        )}

        {section === "ai" && (
          <div className="ai-section">
            <div className="ai-header">
              <div className="ai-header-icon">🤖</div>
              <div>
                <div className="ai-header-title">AI Music Assistant</div>
                <div className="ai-header-sub">Tell me what you want to listen to</div>
              </div>
            </div>
            <div className="chat-messages">
              {chatMessages.map((m, i) => (
                <div key={i} className={`chat-bubble ${m.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}`}>
                  {m.role === "ai" && <span className="chat-avatar">🤖</span>}
                  <span className="chat-text">{m.text}</span>
                </div>
              ))}
              {chatLoading && (
                <div className="chat-bubble chat-bubble-ai">
                  <span className="chat-avatar">🤖</span>
                  <span className="chat-typing"><span /><span /><span /></span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input-row">
              <input
                className="chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="e.g. I'm feeling happy, play gym songs, something like Srivalli…"
                disabled={chatLoading}
              />
              <button
                className={`chat-mic-btn ${isListening && voiceMode === "chat" ? "listening" : ""}`}
                onClick={() => isListening ? stopListening() : startListening("chat")}
                title="Speak to AI"
              >
                {isListening && voiceMode === "chat" ? "⏹" : "🎤"}
              </button>
              <button className="chat-send-btn" onClick={handleChatSend} disabled={chatLoading || !chatInput.trim()}>
                {chatLoading ? "⏳" : "➤"}
              </button>
            </div>
          </div>
        )}

        {section === "about" && (
          <div className="about-section">
            <div className="about-hero">
              <div className="about-hero-glow" />
              <div className="about-hero-inner">
                <div className="about-app-icon">♪</div>
                <h1 className="about-app-name">Harish MusicHub</h1>
                <div className="about-badges">
                  <span className="about-badge purple">v1.0.0</span>
                  <span className="about-badge green">Live</span>
                  <span className="about-badge gray">March 2026</span>
                </div>
                <p className="about-tagline">Built with ❤️ for Telugu music lovers</p>
              </div>
            </div>
            <div className="about-dev-card">
              <div className="about-dev-avatar">HS</div>
              <div className="about-dev-info">
                <div className="about-dev-name">Harish Saligama</div>
                <div className="about-dev-role">Developer & Creator</div>
                <a className="about-dev-github" href="https://github.com/SALIGAMA" target="_blank" rel="noopener noreferrer">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  github.com/SALIGAMA
                </a>
              </div>
            </div>
            <div className="about-stats">
              <div className="about-stat"><div className="about-stat-value">4</div><div className="about-stat-label">Sections</div></div>
              <div className="about-stat-divider" />
              <div className="about-stat"><div className="about-stat-value">7</div><div className="about-stat-label">Features</div></div>
              <div className="about-stat-divider" />
              <div className="about-stat"><div className="about-stat-value">∞</div><div className="about-stat-label">Songs</div></div>
              <div className="about-stat-divider" />
              <div className="about-stat"><div className="about-stat-value">Free</div><div className="about-stat-label">Always</div></div>
            </div>
            <div className="about-features-grid">
              {[
                { icon: "🎵", title: "Global Search",    desc: "Search any song or artist worldwide" },
                { icon: "🎶", title: "Harish Rocks",     desc: "Curated Telugu cinema hits" },
                { icon: "📝", title: "Live Lyrics",      desc: "Fetch lyrics for any track instantly" },
                { icon: "⏯",  title: "Full Controls",    desc: "Play, pause, skip, seek & volume" },
                { icon: "📱", title: "All Devices",      desc: "Mobile, tablet & desktop ready" },
                { icon: "↗",  title: "Easy Sharing",     desc: "Share via WhatsApp or any app" },
              ].map((f) => (
                <div key={f.title} className="about-feature-card">
                  <span className="about-feature-icon">{f.icon}</span>
                  <div className="about-feature-title">{f.title}</div>
                  <div className="about-feature-desc">{f.desc}</div>
                </div>
              ))}
            </div>
            <div className="about-tech">
              <div className="about-tech-title">Built with</div>
              <div className="about-tech-pills">
                {["React 19", "Vite 6", "YouTube API", "lyrics.ovh", "Vercel"].map((t) => (
                  <span key={t} className="about-tech-pill">{t}</span>
                ))}
              </div>
            </div>
            <div className="about-footer">© 2026 Harish Saligama · All rights reserved</div>
          </div>
        )}
      </main>

      {/* ── Player bar ── */}
      <footer className="player-bar">
        <div className="player-track">
          {currentTrack ? (
            <>
              <img src={getBestThumb(currentTrack.snippet.thumbnails)} alt="" className="player-thumb" />
              <div className="player-track-info">
                <span className="player-track-title">{fmt(currentTrack.snippet.title)}</span>
                <span className="player-track-artist">{currentTrack.snippet.channelTitle}</span>
              </div>
            </>
          ) : (
            <span className="player-idle">No track selected</span>
          )}
        </div>
        <div className="player-centre">
          <div className="player-controls">
            <button className="ctrl-btn" onClick={playPrev} disabled={!currentTrack} title="Previous">⏮</button>
            <button className="ctrl-btn play-pause" onClick={currentTrack ? togglePlay : undefined} disabled={!currentTrack || !playerReady} title={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button className="ctrl-btn" onClick={playNext} disabled={!currentTrack} title="Next">⏭</button>
          </div>
          <div className="progress-row">
            <span className="time-label">{formatTime(elapsed)}</span>
            <div className="progress-bar" ref={progressRef} onClick={handleSeek}>
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
              <div className="progress-thumb" style={{ left: `${progressPct}%` }} />
            </div>
            <span className="time-label">{formatTime(duration)}</span>
          </div>
        </div>
        <div className="player-right">
          <button className="ctrl-btn volume-icon" onClick={toggleMute} title="Mute">
            {isMuted || volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊"}
          </button>
          <input type="range" className="volume-slider" min="0" max="100" value={isMuted ? 0 : volume} onChange={handleVolume} />
        </div>
      </footer>

      {/* ── Mobile bottom nav ── */}
      <nav className="mobile-nav">
        <button className={`mobile-nav-btn ${section === "home"   ? "active" : ""}`} onClick={() => setSection("home")}><span className="mobile-nav-icon">⌂</span>Home</button>
        <button className={`mobile-nav-btn ${section === "search" ? "active" : ""}`} onClick={() => setSection("search")}><span className="mobile-nav-icon">⌕</span>Search</button>
        <button className={`mobile-nav-btn ${section === "harish" ? "active" : ""}`} onClick={() => setSection("harish")}><span className="mobile-nav-icon">🎶</span>HR</button>
        <button className={`mobile-nav-btn ${section === "lyrics" ? "active" : ""}`} onClick={() => setSection("lyrics")} disabled={!currentTrack}><span className="mobile-nav-icon">📝</span>Lyrics</button>
        <button className={`mobile-nav-btn ${section === "about"  ? "active" : ""}`} onClick={() => setSection("about")}><span className="mobile-nav-icon">ℹ</span>About</button>
        <button className={`mobile-nav-btn ${section === "ai"  ? "active" : ""}`} onClick={() => setSection("ai")}><span className="mobile-nav-icon">🤖</span>AI</button>
      </nav>

      {/* ── Floating voice command button ── */}
      {!showNamePrompt && (
        <button
          className={`voice-fab ${isListening && voiceMode === "command" ? "listening" : ""}`}
          onClick={() => isListening ? stopListening() : startListening("command")}
          title="Voice command"
        >
          {isListening && voiceMode === "command" ? "⏹" : "🎙️"}
        </button>
      )}

      {/* ── Name prompt modal ── */}
      {showNamePrompt && (
        <div className="name-modal-overlay">
          <div className="name-modal">
            <div className="name-modal-icon">🎵</div>
            <h2 className="name-modal-title">Welcome to Harish MusicHub!</h2>
            <p className="name-modal-sub">What's your name?</p>
            <input
              className="name-modal-input"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              placeholder="Enter your name…"
              autoFocus
            />
            <button className="name-modal-btn" onClick={saveName} disabled={!nameInput.trim()}>
              Let's Go 🎶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
