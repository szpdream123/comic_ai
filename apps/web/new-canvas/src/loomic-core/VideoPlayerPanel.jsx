import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Download, Video, X } from "lucide-react";

export function VideoPlayerPanel({ videoUrl, title = "视频", durationSeconds, onClose }) {
  const panelRef = useRef(null);
  useEffect(() => {
    const dismiss = (event) => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !panelRef.current?.contains(event.target))) onClose();
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", dismiss, true);
    };
  }, [onClose]);

  return createPortal(
    <section ref={panelRef} className="loomic-video-player-panel" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <header>
        <div><Video aria-hidden="true" /><strong>{title}</strong>{durationSeconds ? <span>{durationSeconds} 秒</span> : null}</div>
        <button type="button" title="关闭播放器" aria-label="关闭播放器" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <div className="loomic-video-player-stage"><video src={videoUrl} controls autoPlay playsInline /></div>
      <footer><a href={videoUrl} download={`${title}.mp4`} target="_blank" rel="noreferrer"><Download aria-hidden="true" />下载</a></footer>
    </section>,
    document.body,
  );
}
