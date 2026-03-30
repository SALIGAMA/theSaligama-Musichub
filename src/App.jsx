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

// ── Main App ──────────────────────────────────────────────────────────────────
export default function HarishMusicHub() {
  // Navigation
  const [section, setSection]       = useState("home");

  // Detect mobile
  const [isMobile, setIsMobile]     = useState(window.innerWidth <= 932);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= 932); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Lyrics
  const [lyrics, setLyrics]         = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError]     = useState("");

  // Player state
  const [tracks, setTracks]         = useState([]);
  const [currentIdx, setCurrentIdx] = useState(null);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [duration, setDuration]     = useState(0);
  const [elapsed, setElapsed]       = useState(0);
  const [volume, setVolume]         = useState(80);
  const [isMuted, setIsMuted]       = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);

  // Search state
  const [query, setQuery]           = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  // Harish Rocks section
  const [harishTracks, setHarishTracks]   = useState([]);
  const [harishLoading, setHarishLoading] = useState(false);

  // Refs
  const audioRef       = useRef(null);
  const progressRef    = useRef(null);
  const currentIdxRef  = useRef(currentIdx);
  const tracksRef      = useRef(tracks);

  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  // ── Native audio element setup ────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume / 100;

    function onTimeUpdate() {
      setElapsed(audio.currentTime);
      setDuration(audio.duration || 0);
    }
    function onPlay()  { setIsPlaying(true); }
    function onPause() { setIsPlaying(false); }
    function onEnded() { playNext(); }

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play",  onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play",  onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  // ── Fetch audio stream URL from /api/stream then play ────────────────────
  const playTrack = useCallback(async (idx) => {
    const list = tracksRef.current;
    if (!list[idx]) return;
    const videoId = list[idx].id.videoId;

    setCurrentIdx(idx);
    setElapsed(0);
    setDuration(0);
    setStreamLoading(true);

    try {
      const res = await fetch(`/api/stream?id=${videoId}`);
      const data = await res.json();
      if (!data.url) throw new Error("No stream URL");

      const audio = audioRef.current;
      audio.src = data.url;
      audio.load();
      await audio.play();
    } catch (err) {
      console.error("Stream error:", err);
    } finally {
      setStreamLoading(false);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    isPlaying ? audio.pause() : audio.play();
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

  // ── Media Session API (lock-screen controls) ──────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentIdx === null) return;
    const track = tracksRef.current[currentIdx];
    if (!track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  fmt(track.snippet.title),
      artist: track.snippet.channelTitle,
      artwork: [{ src: getBestThumb(track.snippet.thumbnails), sizes: "512x512", type: "image/jpeg" }],
    });
    navigator.mediaSession.setActionHandler("play",          () => audioRef.current?.play());
    navigator.mediaSession.setActionHandler("pause",         () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => playPrev());
    navigator.mediaSession.setActionHandler("nexttrack",     () => playNext());
  }, [currentIdx, playPrev, playNext]);

  // ── Seek ──────────────────────────────────────────────────────────────────
  function handleSeek(e) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect  = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setElapsed(audio.currentTime);
  }

  // ── Volume ────────────────────────────────────────────────────────────────
  function handleVolume(e) {
    const v = Number(e.target.value);
    setVolume(v);
    setIsMuted(v === 0);
    if (audioRef.current) audioRef.current.volume = v / 100;
  }

  function toggleMute() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      audio.muted = false;
      audio.volume = (volume || 80) / 100;
      setIsMuted(false);
    } else {
      audio.muted = true;
      setIsMuted(true);
    }
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

  async function searchTracks() {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const items = await fetchTracks(query + " audio");
      if (!items.length) { setError("No results found."); setSearchResults([]); }
      else {
        setSearchResults(items);
        setTracks(items);
        setCurrentIdx(null);
      }
    } catch {
      setError("Search failed. Check API key or connection.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") { searchTracks(); setSection("search"); }
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
      .replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/ft\..*$/i, "")
      .replace(/feat\..*$/i, "")
      .trim();
    setLyrics("");
    setLyricsError("");
    setLyricsLoading(true);
    fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(cleanTitle)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.lyrics) setLyrics(data.lyrics);
        else setLyricsError("Lyrics not found for this track.");
      })
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
      {/* Native hidden audio element — gets proper OS background audio */}
      <audio ref={audioRef} style={{ display: "none" }} />

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
        </ul>

        <div className="queue-label">
          {section === "harish" ? "Telugu Hits" : "Queue"}
          {tracks.length > 0 && <span className="queue-count">{tracks.length}</span>}
        </div>

        <ul className="queue">
          {tracks.length === 0 && (
            <li className="queue-empty">{section === "harish" ? "Loading Telugu hits…" : "Search to fill the queue"}</li>
          )}
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
            <h1 className="home-greeting">Hello, have a nice day champ! 🎵</h1>
            <div className="share-row">
              <button className="share-btn-home" onClick={handleShare}>{shareCopied ? "✓ Copied!" : "↗ Share"}</button>
              <a className="share-btn-whatsapp" href="https://wa.me/?text=Check%20out%20Harish%20MusicHub%20%F0%9F%8E%B5%20https://the-saligama-musichub.vercel.app" target="_blank" rel="noopener noreferrer" title="Share on WhatsApp">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.852L.057 23.569a.75.75 0 0 0 .921.921l5.717-1.475A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.716 9.716 0 0 1-4.953-1.356l-.355-.211-3.676.948.968-3.542-.232-.368A9.712 9.712 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
              </a>
            </div>

            <div className="search-hero">
              <input className="search-input-hero" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKeyDown} placeholder="What do you want to listen to?" />
              <button className="search-btn-hero" onClick={() => { searchTracks(); setSection("search"); }} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
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
            <div className="search-bar-row">
              <input className="search-input-main" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKeyDown} placeholder="Search songs, artists, albums…" autoFocus />
              <button className="search-btn-main" onClick={searchTracks} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
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
            <button className="ctrl-btn play-pause" onClick={currentTrack ? togglePlay : undefined} disabled={!currentTrack || streamLoading} title={isPlaying ? "Pause" : "Play"}>
              {streamLoading ? "⏳" : isPlaying ? "⏸" : "▶"}
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
      </nav>
    </div>
  );
}
