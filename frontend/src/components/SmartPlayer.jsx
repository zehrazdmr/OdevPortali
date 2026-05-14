import React from 'react';
import YouTube from 'react-youtube';

const getYouTubeId = (url) => {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|watch\?v=|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
};

export default function SmartPlayer({ videoUrl }) {
  const videoId = getYouTubeId(videoUrl);

  if (!videoId) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
        ⚠️ Geçersiz veya eksik YouTube linki!
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden aspect-video bg-black">
      <YouTube
        videoId={videoId}
        opts={{
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 1,
            disablekb: 0,
            fs: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
        }}
        className="w-full h-full"
        title="Proje videosu"
        onReady={(event) => {
          if (typeof event.target.getIframe === 'function') {
            const iframe = event.target.getIframe();
            if (iframe && typeof iframe.setAttribute === 'function') {
              iframe.setAttribute('allowfullscreen', '');
              iframe.setAttribute(
                'allow',
                'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'
              );
            }
          }
        }}
      />
    </div>
  );
}
