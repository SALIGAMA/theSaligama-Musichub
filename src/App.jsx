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
  const [section, setSection]       = useState("home"); // home | search | harish | lyrics

  // Detect mobile via JS (reliable on all Android/iOS)
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
  const [playerReady, setPlayerReady] = useState(false);
  const [duration, setDuration]     = useState(0);
  const [elapsed, setElapsed]       = useState(0);
  const [volume, setVolume]         = useState(80);
  const [isMuted, setIsMuted]       = useState(false);

  // Search state
  const [query, setQuery]           = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  // Harish Rocks section
  const [harishTracks, setHarishTracks]   = useState([]);
  const [harishLoading, setHarishLoading] = useState(false);

  // Refs
  const playerRef      = useRef(null);
  const containerRef   = useRef(null);
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

  function stopTick() {
    clearInterval(tickRef.current);
  }

  useEffect(() => () => stopTick(), []);

  // ── Seek ──────────────────────────────────────────────────────────────────
  function handleSeek(e) {
    if (!playerRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTo = ratio * duration;
    playerRef.current.seekTo(seekTo, true);
    setElapsed(seekTo);
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
  }, []);

  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    isPlaying ? playerRef.current.pauseVideo() : playerRef.current.playVideo();
  }, [isPlaying]);

  const playNext = useCallback(() => {
    const idx = currentIdxRef.current;
    const list = tracksRef.current;
    if (idx === null || !list.length) return;
    playTrack((idx + 1) % list.length);
  }, [playTrack]);

  const playPrev = useCallback(() => {
    const idx = currentIdxRef.current;
    const list = tracksRef.current;
    if (idx === null || !list.length) return;
    playTrack((idx - 1 + list.length) % list.length);
  }, [playTrack]);

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

  // ── Derived (needed by lyrics effect below) ──────────────────────────────
  const currentTrack = currentIdx !== null ? tracks[currentIdx] : null;
  const progressPct  = duration > 0 ? (elapsed / duration) * 100 : 0;

  // ── Lyrics ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (section !== "lyrics" || !currentTrack) return;
    const title  = fmt(currentTrack.snippet.title);
    const artist = currentTrack.snippet.channelTitle;

    // Strip common noise from YouTube titles: (Official Video), [HD], ft. xyz etc.
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

  // ── Harish Rocks — load Telugu songs ─────────────────────────────────────
  useEffect(() => {
    if (section !== "harish" || harishTracks.length > 0) return;
    setHarishLoading(true);
    const q = TELUGU_QUERIES[Math.floor(Math.random() * TELUGU_QUERIES.length)];
    fetchTracks(q + " audio", { max: 20 })
      .then((items) => {
        setHarishTracks(items);
        setTracks(items);
      })
      .catch(() => {})
      .finally(() => setHarishLoading(false));
  }, [section]);

  // When switching sections, update the active track list
  useEffect(() => {
    if (section === "search" && searchResults.length) setTracks(searchResults);
    if (section === "harish" && harishTracks.length)  setTracks(harishTracks);
  }, [section]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`app ${isMobile ? "is-mobile" : "is-desktop"}`}>
      {/* Hidden audio player */}
      <div ref={containerRef} style={{ display: "none" }} />

      {/* ── Left nav — desktop only ── */}
      {!isMobile && <nav className="nav">
        <div className="nav-logo">
          <span className="nav-logo-icon">♪</span>
          <div className="nav-logo-text">
            <span className="nav-logo-name">Harish</span>
            <span className="nav-logo-sub">MusicHub</span>
          </div>
        </div>

        <ul className="nav-links">
          <li>
            <button
              className={`nav-btn ${section === "home" ? "active" : ""}`}
              onClick={() => setSection("home")}
            >
              <span className="nav-icon">⌂</span> Home
            </button>
          </li>
          <li>
            <button
              className={`nav-btn ${section === "search" ? "active" : ""}`}
              onClick={() => setSection("search")}
            >
              <span className="nav-icon">⌕</span> Search
            </button>
          </li>
          <li>
            <button
              className={`nav-btn harish-btn ${section === "harish" ? "active" : ""}`}
              onClick={() => setSection("harish")}
            >
              <span className="nav-icon">🎶</span>
              <span>Harish Rocks</span>
              <span className="nav-badge">Telugu</span>
            </button>
          </li>
          <li>
            <button
              className={`nav-btn ${section === "lyrics" ? "active" : ""}`}
              onClick={() => setSection("lyrics")}
              disabled={!currentTrack}
              title={!currentTrack ? "Play a track first" : ""}
            >
              <span className="nav-icon">📝</span> Lyrics
            </button>
          </li>
        </ul>

        {/* Queue in sidebar */}
        <div className="queue-label">
          {section === "harish" ? "Telugu Hits" : "Queue"}
          {tracks.length > 0 && <span className="queue-count">{tracks.length}</span>}
        </div>

        <ul className="queue">
          {tracks.length === 0 && (
            <li className="queue-empty">
              {section === "harish" ? "Loading Telugu hits…" : "Search to fill the queue"}
            </li>
          )}
          {tracks.map((track, idx) => {
            const active = idx === currentIdx;
            return (
              <li
                key={track.id.videoId + idx}
                className={`queue-item ${active ? "active" : ""}`}
                onClick={() => playTrack(idx)}
              >
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

        {/* HOME */}
        {section === "home" && (
          <div className="home-section">
            <h1 className="home-greeting">Hello, have a nice day champ! 🎵</h1>

            <div className="search-hero">
              <input
                className="search-input-hero"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What do you want to listen to?"
              />
              <button
                className="search-btn-hero"
                onClick={() => { searchTracks(); setSection("search"); }}
                disabled={loading}
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>

            <div className="home-cards">
              <div className="home-card harish-card" onClick={() => setSection("harish")}>
                <div className="home-card-icon">🎶</div>
                <div>
                  <div className="home-card-title">Harish Rocks</div>
                  <div className="home-card-sub">Telugu hits, handpicked</div>
                </div>
              </div>
              <div className="home-card search-card" onClick={() => setSection("search")}>
                <div className="home-card-icon">⌕</div>
                <div>
                  <div className="home-card-title">Browse Music</div>
                  <div className="home-card-sub">Search any song</div>
                </div>
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

        {/* SEARCH */}
        {section === "search" && (
          <div className="search-section">
            <div className="search-bar-row">
              <input
                className="search-input-main"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search songs, artists, albums…"
                autoFocus
              />
              <button className="search-btn-main" onClick={searchTracks} disabled={loading}>
                {loading ? "Searching…" : "Search"}
              </button>
            </div>
            {error && <p className="search-error">{error}</p>}

            {searchResults.length > 0 && (
              <>
                <div className="results-header">
                  Results for <em>"{query}"</em> — {searchResults.length} tracks
                </div>
                <div className="results-grid">
                  {searchResults.map((track, idx) => (
                    <div
                      key={track.id.videoId}
                      className={`result-card ${idx === currentIdx && tracks === searchResults ? "active" : ""}`}
                      onClick={() => { setTracks(searchResults); playTrack(idx); }}
                    >
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
              <div className="search-empty">
                <div className="search-empty-icon">⌕</div>
                <p>Start typing to search for music</p>
              </div>
            )}
          </div>
        )}

        {/* HARISH ROCKS */}
        {section === "harish" && (
          <div className="harish-section">
            <div className="harish-header">
              <div className="harish-banner">
                <div className="harish-banner-text">
                  <h1>🎶 Harish Rocks</h1>
                  <p>The best of Telugu cinema — for Harish</p>
                </div>
              </div>
            </div>

            {harishLoading && <div className="harish-loading">Loading Telugu hits…</div>}

            {!harishLoading && harishTracks.length > 0 && (
              <div className="harish-list">
                <div className="harish-list-head">
                  <span>#</span>
                  <span>Title</span>
                  <span>Artist / Channel</span>
                </div>
                {harishTracks.map((track, idx) => {
                  const active = idx === currentIdx && tracks === harishTracks;
                  return (
                    <div
                      key={track.id.videoId}
                      className={`harish-row ${active ? "active" : ""}`}
                      onClick={() => { setTracks(harishTracks); playTrack(idx); }}
                    >
                      <span className="harish-num">{active && isPlaying ? "▶" : idx + 1}</span>
                      <img src={getBestThumb(track.snippet.thumbnails)} alt="" className="harish-thumb" />
                      <div className="harish-track-info">
                        <span className="harish-track-title">{fmt(track.snippet.title)}</span>
                      </div>
                      <span className="harish-artist">{track.snippet.channelTitle}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* LYRICS */}
        {section === "lyrics" && (
          <div className="lyrics-section">
            {!currentTrack ? (
              <div className="lyrics-empty">
                <div className="lyrics-empty-icon">📝</div>
                <p>Play a track first to see its lyrics</p>
              </div>
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
                {lyrics && (
                  <pre className="lyrics-body">{lyrics}</pre>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* ── Player bar ── */}
      <footer className="player-bar">
        {/* Left — track info */}
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

        {/* Centre — controls + progress */}
        <div className="player-centre">
          <div className="player-controls">
            <button className="ctrl-btn" onClick={playPrev} disabled={!currentTrack} title="Previous">⏮</button>
            <button
              className="ctrl-btn play-pause"
              onClick={currentTrack ? togglePlay : undefined}
              disabled={!currentTrack || !playerReady}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button className="ctrl-btn" onClick={playNext} disabled={!currentTrack} title="Next">⏭</button>
          </div>

          {/* Progress bar */}
          <div className="progress-row">
            <span className="time-label">{formatTime(elapsed)}</span>
            <div
              className="progress-bar"
              ref={progressRef}
              onClick={handleSeek}
            >
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
              <div className="progress-thumb" style={{ left: `${progressPct}%` }} />
            </div>
            <span className="time-label">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right — volume */}
        <div className="player-right">
          <button className="ctrl-btn volume-icon" onClick={toggleMute} title="Mute">
            {isMuted || volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊"}
          </button>
          <input
            type="range"
            className="volume-slider"
            min="0" max="100"
            value={isMuted ? 0 : volume}
            onChange={handleVolume}
          />
        </div>
      </footer>
      {/* ── Mobile bottom nav ── */}
      <nav className="mobile-nav">
        <button className={`mobile-nav-btn ${section === "home" ? "active" : ""}`} onClick={() => setSection("home")}>
          <span className="mobile-nav-icon">⌂</span>
          Home
        </button>
        <button className={`mobile-nav-btn ${section === "search" ? "active" : ""}`} onClick={() => setSection("search")}>
          <span className="mobile-nav-icon">⌕</span>
          Search
        </button>
        <button className={`mobile-nav-btn ${section === "harish" ? "active" : ""}`} onClick={() => setSection("harish")}>
          <span className="mobile-nav-icon">🎶</span>
          HR
        </button>
        <button
          className={`mobile-nav-btn ${section === "lyrics" ? "active" : ""}`}
          onClick={() => setSection("lyrics")}
          disabled={!currentTrack}
        >
          <span className="mobile-nav-icon">📝</span>
          Lyrics
        </button>
      </nav>
    </div>
  );
}
