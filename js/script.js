/* ========================================================= 
   SLIDESHOW — waits for video to end; images can auto-advance
   Respect data-autoplay="false" to disable auto scrolling
========================================================= */
(function initSlideshows() {
  const DEFAULT_INTERVAL_MS = 4500;
  const FALLBACK_MAX_MS     = 30000;
  const normalize = (i, len) => (i % len + len) % len;

  document.querySelectorAll('.slideshow').forEach(root => {
    const slides = Array.from(root.querySelectorAll('.slide'));
    if (!slides.length) return;

    const autoplay = String(root.dataset.autoplay ?? 'true') !== 'false';
    const prevBtn  = root.querySelector('.prev');
    const nextBtn  = root.querySelector('.next');
    const dotsWrap = root.querySelector('.dots');

    let dots = [];
    if (dotsWrap) {
      dotsWrap.innerHTML = '';
      slides.forEach((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', `Go to slide ${i + 1}`);
        dotsWrap.appendChild(b);
      });
      dots = Array.from(dotsWrap.querySelectorAll('button'));
    }

    let index = slides.findIndex(s => s.classList.contains('is-active'));
    if (index < 0) { slides[0].classList.add('is-active'); index = 0; }
    else slides.forEach((s, i) => i !== index && s.classList.remove('is-active'));
    if (dots[index]) dots[index].classList.add('is-active');

    let timerId = null;
    let timerMode = 'none';
    const getVideo = (slide) => slide.querySelector('video') || null;

    function clearTimer() {
      if (timerId) {
        if (timerMode === 'interval') clearInterval(timerId);
        if (timerMode === 'timeout')  clearTimeout(timerId);
      }
      timerId = null; timerMode = 'none';
    }
    function pauseVideo(slide) {
      const v = getVideo(slide);
      if (v && !v.paused) { try { v.pause(); } catch {} }
    }
    function playVideo(slide) {
      const v = getVideo(slide);
      if (!v) return false;
      v.muted = true; v.playsInline = true;
      try { v.currentTime = 0; } catch {}
      v.play().catch(() => {});
      return true;
    }

    function scheduleAdvanceForActive() {
      clearTimer();
      if (!autoplay) return;

      const activeSlide = slides[index];
      const v = getVideo(activeSlide);

      if (v) {
        const useFallback = () => {
          const dur = Number.isFinite(v.duration) ? v.duration * 1000 : FALLBACK_MAX_MS;
          timerId = setTimeout(() => next(), Math.min(dur, FALLBACK_MAX_MS));
          timerMode = 'timeout';
        };
        if (!isFinite(v.duration) || v.duration === 0) {
          v.addEventListener('loadedmetadata', function onMeta() {
            v.removeEventListener('loadedmetadata', onMeta);
            if (slides[index] === activeSlide) useFallback();
          }, { once: true });
        } else {
          useFallback();
        }
        return;
      }
      timerId = setInterval(() => next(), DEFAULT_INTERVAL_MS);
      timerMode = 'interval';
    }

    function goTo(i) {
      const nextIdx = normalize(i, slides.length);
      if (nextIdx === index) return;

      slides[index].classList.remove('is-active');
      if (dots[index]) dots[index].classList.remove('is-active');
      pauseVideo(slides[index]);

      index = nextIdx;
      slides[index].classList.add('is-active');
      if (dots[index]) dots[index].classList.add('is-active');

      playVideo(slides[index]);
      scheduleAdvanceForActive();
    }

    const next = () => goTo(index + 1);
    const prev = () => goTo(index - 1);

    prevBtn?.addEventListener('click', () => goTo(index - 1));
    nextBtn?.addEventListener('click', () => goTo(index + 1));
    dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));

    const pauseAll = () => clearTimer();
    const resume   = () => scheduleAdvanceForActive();
    root.addEventListener('mouseenter', pauseAll);
    root.addEventListener('mouseleave', resume);
    root.addEventListener('focusin',  pauseAll);
    root.addEventListener('focusout', resume);

    slides.forEach(slide => {
      const v = getVideo(slide);
      if (!v) return;
      v.addEventListener('ended', () => {
        if (!autoplay) return;
        if (slide.classList.contains('is-active')) {
          clearTimer();
          next();
        }
      });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimer();
      else scheduleAdvanceForActive();
    });

    playVideo(slides[index]);
    scheduleAdvanceForActive();
  });
})();

/* =========================================================
   SINGLE VIDEO PLAYER (Welcome page)
========================================================= */
(function initVideoSlideshow() {
  const wrap = document.getElementById('video-slideshow');
  const player = document.getElementById('vs-player');
  const metaEl = document.getElementById('vs-meta');
  const btnPrev = document.getElementById('vs-prev');
  const btnNext = document.getElementById('vs-next');
  const btnToggle = document.getElementById('vs-toggle');

  if (!wrap || !player) return;

  let playlist = [];
  try { playlist = JSON.parse(wrap.dataset.playlist || '[]'); } catch { playlist = []; }
  if (!Array.isArray(playlist) || playlist.length === 0) return;

  let idx = 0;
  let isPaused = false;

  function setMeta() { metaEl && (metaEl.textContent = `${idx + 1} / ${playlist.length}`); }

  function load(index) {
    idx = (index + playlist.length) % playlist.length;
    while (player.firstChild) player.removeChild(player.firstChild);
    const mp4 = document.createElement('source');
    mp4.src = playlist[idx];
    mp4.type = 'video/mp4';
    player.appendChild(mp4);
    player.load();
    setMeta();
    const p = player.play();
    p && p.catch?.(() => { btnToggle && (btnToggle.textContent = 'Play'); isPaused = true; });
  }

  player.addEventListener('error', () => {
    const e = player.error;
    console.error('Video error:', { src: player.currentSrc, code: e && e.code, mediaError: e });
  });

  player.addEventListener('ended', () => { if (!isPaused) next(); });

  function prev() { load(idx - 1); }
  function next() { load(idx + 1); }

  btnPrev?.addEventListener('click', prev);
  btnNext?.addEventListener('click', next);
  btnToggle?.addEventListener('click', () => {
    if (player.paused) { player.play(); btnToggle.textContent = 'Pause'; isPaused = false; }
    else { player.pause(); btnToggle.textContent = 'Play'; isPaused = true; }
  });

  load(0);
})();

/* =========================================================
   MUSIC volume & mute (Hobbies)
========================================================= */
(function initMusicVolume(){
  const audio  = document.getElementById('bg-music');
  const slider = document.getElementById('music-volume');
  const muteBtn= document.getElementById('music-mute');
  if (!audio || !slider || !muteBtn) return;

  audio.volume = parseFloat(slider.value || '0.35');

  function unlock() {
    audio.play().catch(()=>{});
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  }
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    audio.volume = Number.isFinite(v) ? v : 0.35;
    if (audio.muted && audio.volume > 0) {
      audio.muted = false;
      muteBtn.textContent = 'Mute';
    }
  });

  muteBtn.addEventListener('click', () => {
    audio.muted = !audio.muted;
    muteBtn.textContent = audio.muted ? 'Unmute' : 'Mute';
  });
})();
