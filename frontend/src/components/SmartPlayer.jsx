import React, { useState, useRef, useEffect } from 'react';
import YouTube from 'react-youtube';

const SmartPlayer = ({ videoUrl, onWatchComplete }) => {
  const [canSubmit, setCanSubmit] = useState(false);
  const playerRef = useRef(null);
  const lastTime = useRef(0);

const getYouTubeId = (url) => {
  if (!url) return null;
  // Her türlü YouTube link varyasyonunu kapsayan en güçlü Regex:
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
};
  console.log("Gelen Video URL:", videoUrl); // Buraya bakacağız


  const videoId = getYouTubeId(videoUrl);
  // --- DEĞİŞİKLİK BURADA BİTTİ ---


  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && playerRef.current) {
        playerRef.current.pauseVideo(); // Sekme değişince durdur
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);
    // Eğer videoId bulunamazsa (link hatalıysa) kullanıcıya uyarı verelim
  if (!videoId) {
    return <p style={{ color: 'red' }}>⚠️ Geçersiz veya eksik YouTube linki!</p>;
  }

  const onStateChange = (event) => {
    const player = event.target;
    
    const interval = setInterval(async () => {
      if (player.getPlayerState() !== 1) return; // Sadece oynarken kontrol et

      const currentTime = await player.getCurrentTime();
      const duration = await player.getDuration();

      // İleri sarma engeli
      if (currentTime > lastTime.current + 2.5) {
        player.seekTo(lastTime.current);
      } else {
        lastTime.current = currentTime;
      }

      // %90 İzleme kontrolü
      if (currentTime / duration > 0.9) {
        setCanSubmit(true);
        onWatchComplete(true); // Puanlama formuna "Kilidi aç" sinyali gönder
        clearInterval(interval);
      }
    }, 1000);
  };

  return (
    <div>
      <YouTube 
        videoId={videoId} 
        onStateChange={onStateChange}
        onReady={(e) => playerRef.current = e.target}
        opts={{ playerVars: { controls: 1, disablekb: 1 } }} 
      />
      {!canSubmit && <p style={{color: 'red'}}>⚠️ Puan vermek için videoyu izlemelisiniz.</p>}
    </div>
  );
};

export default SmartPlayer;