import React, { useCallback, useRef, useState } from "react";
import { Play } from "lucide-react";

export function VideoCanvasElement({ src, width, height }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const play = useCallback(() => {
    videoRef.current?.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, []);
  const pause = useCallback(() => {
    videoRef.current?.pause();
    setPlaying(false);
  }, []);
  const toggle = useCallback((event) => {
    event.stopPropagation();
    event.preventDefault();
    if (playing) pause(); else play();
  }, [pause, play, playing]);
  const stop = useCallback((event) => event.stopPropagation(), []);

  return (
    <div
      className="loomic-video-element"
      style={{ width, height }}
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerMove={stop}
      onWheel={stop}
      onMouseEnter={play}
      onMouseLeave={pause}
      onClick={toggle}
    >
      <video ref={videoRef} src={src} muted loop playsInline preload="metadata" />
      {!playing && <span className="loomic-video-play" aria-hidden="true"><Play /></span>}
    </div>
  );
}
