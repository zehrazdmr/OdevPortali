import React, { useState, useRef, useEffect } from 'react';
import YouTube from 'react-youtube';

const getYouTubeId = (url) => {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|watch\?v=|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
};

export default function SmartPlayer({ videoUrl, onWatchComplete }) {
  const [canSubmit, setCanSubmit] = useState(false);
  const playerRef = useRef(null);
  const lastTimeRef = useRef(0);
  const intervalRef = useRef(null);

  const videoId = getYouTubeId(videoUrl);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && playerRef.current) {
        playerRef.current.pauseVideo();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!videoId) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
        ⚠️ Geçersiz veya eksik YouTube linki!
      </div>
    );
  }

  const onStateChange = (event) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (event.data !== 1) return; // sadece oynarken izle

    intervalRef.current = setInterval(async () => {
      if (!playerRef.current) return;
      try {
        const currentTime = await playerRef.current.getCurrentTime();
        const duration = await playerRef.current.getDuration();

        // İleri sarma engeli
        if (currentTime > lastTimeRef.current + 3) {
          playerRef.current.seekTo(lastTimeRef.current);
        } else {
          lastTimeRef.current = currentTime;
        }

        if (duration > 0 && currentTime / duration > 0.9 && !canSubmit) {
          setCanSubmit(true);
          onWatchComplete(true);
          clearInterval(intervalRef.current);
        }
      } catch {}
    }, 1000);
  };

  return (
    <div>
      <div className="rounded-xl overflow-hidden aspect-video bg-black">
        <YouTube
          videoId={videoId}
          opts={{ width: '100%', height: '100%', playerVars: { controls: 1, disablekb: 1, rel: 0 } }}
          className="w-full h-full"
          onReady={e => { playerRef.current = e.target; }}
          onStateChange={onStateChange}
        />
      </div>
      {!canSubmit && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          İleri sarma devre dışı — videoyu sonuna kadar izlemeniz gerekiyor.
        </p>
      )}
    </div>
  );
}
