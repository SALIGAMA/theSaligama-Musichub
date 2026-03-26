import { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";

const API_KEY = import.meta.env.VITE_YT_API_KEY;

// ── Helpers ──────────────────────────────────────────────────────────────────
function getBestThumb(thumbnails) {
  return (
    thumbnails?.maxres?.url ||
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    ""
  );
}

function formatTitle(raw) {
  return raw.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function MusicHub() {
  const [query, setQuery]           = useState("");
  const [tracks, setTracks]         = useState([]);
  const [currentIdx, setCurrentIdx] = useState(null);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [playerReady, setPlayerReady] = useState(false);

  const playerRef   = useRef(null);   // YT.Player instance
  const containerRef = useRef(null);  // div the player mounts into
  const currentIdxRef = useRef(currentIdx);
  const tracksRef     = useRef(tracks);

  // Keep refs in sync so event handlers always see latest state
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  // ── Load YouTube IFrame API once ──────────────────────────────────────────
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      initPlayer();
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = initPlayer;
  }, []);

  function initPlayer() {
    if (playerRef.current) return;
    playerRef.current = new window.YT.Player(containerRef.current, {
      height: "0",
      width: "0",
      playerVars: { autoplay: 1, controls: 0, disablekb: 1 },
      events: {
        onReady: () => setPlayerReady(true),
        onStateChange: (e) => {
          if (e.data === window.YT.PlayerState.PLAYING) setIsPlaying(true);
          if (e.data === window.YT.PlayerState.PAUSED)  setIsPlaying(false);
          if (e.data === window.YT.PlayerState.ENDED)   playNext();
        },
      },
    });
  }

  // ── Playback controls ─────────────────────────────────────────────────────
  const playTrack = useCallback((idx) => {
    if (!playerRef.current || !tracksRef.current[idx]) return;
    const videoId = tracksRef.current[idx].id.videoId;
    playerRef.current.loadVideoById(videoId);
    setCurrentIdx(idx);
    setIsPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  }, [isPlaying]);

  const playNext = useCallback(() => {
    const idx  = currentIdxRef.current;
    const list = tracksRef.current;
    if (idx === null || !list.length) return;
    const next = (idx + 1) % list.length;
    playTrack(next);
  }, [playTrack]);

  const playPrev = useCallback(() => {
    const idx  = currentIdxRef.current;
    const list = tracksRef.current;
    if (idx === null || !list.length) return;
    const prev = (idx - 1 + list.length) % list.length;
    playTrack(prev);
  }, [playTrack]);

  // ── Search ────────────────────────────────────────────────────────────────
  async function searchTracks() {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query + " audio")}&type=video&videoCategoryId=10&maxResults=20&key=${API_KEY}`
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        setError("No results found. Try a different search.");
        setTracks([]);
      } else {
        setTracks(data.items);
        setCurrentIdx(null);
        setIsPlaying(false);
      }
    } catch (err) {
      setError("Failed to search. Check your API key or connection.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") searchTracks();
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentTrack = currentIdx !== null ? tracks[currentIdx] : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Hidden YouTube player (audio only) */}
      <div ref={containerRef} style={{ display: "none" }} />

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">♪</span>
          <span className="logo-text">MusicHub</span>
        </div>

        <div className="search-box">
          <input
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search songs, artists…"
          />
          <button
            className="search-btn"
            onClick={searchTracks}
            disabled={loading}
          >
            {loading ? "…" : "Search"}
          </button>
        </div>

        {error && <p className="search-error">{error}</p>}

        <div className="playlist-header">
          {tracks.length > 0 ? `${tracks.length} results` : "Your Queue"}
        </div>

        <ul className="playlist">
          {tracks.length === 0 && !loading && (
            <li className="playlist-empty">Search for music to get started</li>
          )}
          {tracks.map((track, idx) => {
            const isActive = idx === currentIdx;
            return (
              <li
                key={track.id.videoId}
                className={`playlist-item ${isActive ? "active" : ""}`}
                onClick={() => playTrack(idx)}
              >
                <img
                  src={getBestThumb(track.snippet.thumbnails)}
                  alt=""
                  className="playlist-thumb"
                />
                <div className="playlist-info">
                  <span className="playlist-title">
                    {formatTitle(track.snippet.title)}
                  </span>
                  <span className="playlist-artist">
                    {track.snippet.channelTitle}
                  </span>
                </div>
                {isActive && isPlaying && (
                  <span className="playing-indicator">▶</span>
                )}
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ── Main area ── */}
      <main className="main">
        {currentTrack ? (
          <div className="now-playing-view">
            <img
              src={getBestThumb(currentTrack.snippet.thumbnails)}
              alt="album art"
              className="album-art"
            />
            <div className="track-meta">
              <h1 className="track-title">
                {formatTitle(currentTrack.snippet.title)}
              </h1>
              <p className="track-artist">{currentTrack.snippet.channelTitle}</p>
            </div>
          </div>
        ) : (
          <div className="welcome">
            <div className="welcome-icon">♫</div>
            <h2>Welcome to MusicHub</h2>
            <p>Search for your favourite songs and start listening</p>
          </div>
        )}
      </main>

      {/* ── Bottom player bar ── */}
      <footer className="player-bar">
        <div className="player-track">
          {currentTrack ? (
            <>
              <img
                src={getBestThumb(currentTrack.snippet.thumbnails)}
                alt=""
                className="player-thumb"
              />
              <div className="player-track-info">
                <span className="player-track-title">
                  {formatTitle(currentTrack.snippet.title)}
                </span>
                <span className="player-track-artist">
                  {currentTrack.snippet.channelTitle}
                </span>
              </div>
            </>
          ) : (
            <span className="player-idle">No track selected</span>
          )}
        </div>

        <div className="player-controls">
          <button
            className="ctrl-btn"
            onClick={playPrev}
            disabled={!currentTrack}
            title="Previous"
          >
            ⏮
          </button>
          <button
            className="ctrl-btn play-pause"
            onClick={currentTrack ? togglePlay : undefined}
            disabled={!currentTrack || !playerReady}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button
            className="ctrl-btn"
            onClick={playNext}
            disabled={!currentTrack}
            title="Next"
          >
            ⏭
          </button>
        </div>

        <div className="player-right">
          <span className="track-count">
            {currentIdx !== null ? `${currentIdx + 1} / ${tracks.length}` : ""}
          </span>
        </div>
      </footer>
    </div>
  );
}
