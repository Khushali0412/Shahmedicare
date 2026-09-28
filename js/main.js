/* ==========================================================================
   Shah Medicare — site interactions (vanilla JS, no dependencies)
   Header · mobile menu · scroll progress · reveals · scrollspy · parallax ·
   magnetic buttons · condition tabs · horizontal scrollers · journey line ·
   gallery lightbox · testimonial slider · map facade · floating CTAs
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  if (reduceMotion.matches) root.classList.add('reduced');

  /* ---------- Load state (drives hero entrance) ---------- */
  requestAnimationFrame(() => document.body.classList.add('is-loaded'));

  /* ---------- Scroll-driven UI (single rAF loop) ---------- */
  const header = $('[data-header]');
  const progress = $('.scroll-progress');
  // const floatCta = $('[data-float-cta]');
  const actionBar = $('[data-action-bar]');
  const hero = $('.hero, .page-hero');
  const appointment = $('#appointment');
  const journey = $('[data-journey]');
  const steps = journey ? $$('[data-step]', journey) : [];
  const parallaxEls = $$('[data-parallax]');

  let ticking = false;
  let appointmentVisible = false;

  const updateOnScroll = () => {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;

    if (header) header.classList.toggle('is-scrolled', y > 12);
    if (progress) progress.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : 0);

    const pastHero = hero ? y > hero.offsetHeight * 0.7 : y > 400;
    const showCta = pastHero && !appointmentVisible;
    // if (floatCta) floatCta.classList.toggle('is-visible', showCta);
    if (actionBar) actionBar.classList.toggle('is-visible', y > 240 && !appointmentVisible);

    // Journey connector fill
    if (journey) {
      const r = journey.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (vh * 0.75 - r.top) / (r.height * 0.7)));
      journey.style.setProperty('--p', p.toFixed(3));
      steps.forEach((s, i) => s.classList.toggle('is-reached', p >= (i / Math.max(1, steps.length - 1)) * 0.92));
    }

    // Gentle parallax (desktop, motion allowed)
    if (!reduceMotion.matches && window.innerWidth > 900 && vh < 1600) {
      parallaxEls.forEach((el) => {
        const speed = parseFloat(el.dataset.parallax) || 0;
        const r = el.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) return;
        const offset = (r.top + r.height / 2 - vh / 2) * speed;
        el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
      });
    }
  };
  const requestTick = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(updateOnScroll); }
  };
  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', () => {
    if (window.innerWidth <= 900) parallaxEls.forEach((el) => { el.style.transform = ''; });
    requestTick();
  }, { passive: true });

  if (appointment && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      appointmentVisible = entry.isIntersecting;
      requestTick();
    }, { rootMargin: '0px 0px -30% 0px' }).observe(appointment);
  }
  updateOnScroll();

  /* ---------- Reveal on scroll ---------- */
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- Scrollspy: active nav item ---------- */
  const spyLinks = $$('[data-spy]');
  if (spyLinks.length && 'IntersectionObserver' in window) {
    const map = new Map();
    spyLinks.forEach((a) => {
      const id = a.dataset.spy;
      const target = id === 'top' ? $('.hero') : document.getElementById(id);
      if (target) map.set(target, a);
    });
    const setActive = (link) => {
      spyLinks.forEach((a) => {
        const on = a === link;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
    };
    const visible = new Set();
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
      // Pick the top-most visible tracked section
      let best = null;
      visible.forEach((t) => { if (!best || t.offsetTop > best.offsetTop) best = t; });
      if (best) setActive(map.get(best));
    }, { rootMargin: '-35% 0px -55% 0px' });
    map.forEach((_, target) => spy.observe(target));
  }

  /* ---------- Mobile menu (accessible dialog) ---------- */
  const toggle = $('[data-nav-toggle]');
  const menu = $('[data-mobile-menu]');
  if (toggle && menu) {
    const label = $('[data-nav-toggle-label]', toggle);
    let lastFocus = null;
    const focusables = () => [toggle, ...$$('a, button', menu)];

    const open = () => {
      lastFocus = document.activeElement;
      menu.hidden = false;
      void menu.offsetWidth; // commit display before animating
      menu.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      if (label) label.textContent = 'Close menu';
      header && header.classList.add('menu-open');
      document.body.classList.add('is-locked');
      const first = $('a', menu);
      if (first) first.focus({ preventScroll: true });
    };
    const close = (restoreFocus = true) => {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      if (label) label.textContent = 'Open menu';
      header && header.classList.remove('menu-open');
      document.body.classList.remove('is-locked');
      const done = () => { if (!menu.classList.contains('is-open')) menu.hidden = true; };
      reduceMotion.matches ? done() : setTimeout(done, 580);
      if (restoreFocus && lastFocus) lastFocus.focus({ preventScroll: true });
    };
    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

    toggle.addEventListener('click', () => (isOpen() ? close() : open()));
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) close(false);
    });
    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    window.matchMedia('(min-width: 1025px)').addEventListener('change', (e) => { if (e.matches && isOpen()) close(false); });
  }

  /* ---------- Magnetic CTAs (fine pointers only) ---------- */
  if (finePointer.matches && !reduceMotion.matches) {
    $$('[data-magnetic]').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width - 0.5) * 8;
        const y = ((e.clientY - r.top) / r.height - 0.5) * 6;
        btn.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
  }

  /* ---------- Condition tabs (WAI-ARIA tabs pattern) ---------- */
  $$('[data-tabs]').forEach((tablist) => {
    const tabs = $$('[role="tab"]', tablist);
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
    const select = (index, focus = false) => {
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        const panel = panels[i];
        if (!panel) return;
        panel.hidden = !on;
        if (on) {
          panel.classList.remove('is-entering');
          void panel.offsetWidth;
          panel.classList.add('is-entering');
          $$('[data-reveal]', panel).forEach((el) => el.classList.add('is-in'));
        }
      });
      if (focus) tabs[index].focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', (e) => {
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = tabs.length - 1;
        if (next !== null) { e.preventDefault(); select(next, true); }
      });
    });
    // Initial state without replaying the entrance animation
    tabs.forEach((tab, i) => { if (panels[i]) panels[i].hidden = tab.getAttribute('aria-selected') !== 'true'; });
  });

  /* ---------- Horizontal scroller progress (mobile services) ---------- */
  $$('[data-hscroll]').forEach((track) => {
    const bar = track.parentElement.querySelector('[data-hscroll-bar]');
    if (!bar) return;
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const visibleRatio = track.clientWidth / track.scrollWidth;
      const p = max > 0 ? visibleRatio + (1 - visibleRatio) * (track.scrollLeft / max) : 1;
      bar.style.setProperty('--sp', p.toFixed(3));
    };
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  });

  /* ---------- Lightbox ---------- */
  const lb = $('[data-lightbox-root]');
  const galleryItems = $$('[data-lightbox]');
  if (lb && galleryItems.length) {
    const img = $('[data-lb-img]', lb);
    const cap = $('[data-lb-cap]', lb);
    const count = $('[data-lb-count]', lb);
    const stage = $('[data-lb-stage]', lb);
    const btnClose = $('[data-lb-close]', lb);
    const btnPrev = $('[data-lb-prev]', lb);
    const btnNext = $('[data-lb-next]', lb);
    let index = 0;
    let opener = null;

    const render = (i, animate = true) => {
      index = (i + galleryItems.length) % galleryItems.length;
      const item = galleryItems[index];
      const thumb = $('img', item);
      const apply = () => {
        img.src = item.dataset.src;
        img.alt = thumb ? thumb.alt : '';
        const cat = item.dataset.cat ? `<small>${item.dataset.cat}</small>` : '';
        cap.innerHTML = cat + (item.dataset.caption || '');
        count.textContent = `${index + 1} / ${galleryItems.length}`;
        img.classList.remove('is-swapping');
      };
      if (animate && !reduceMotion.matches) {
        img.classList.add('is-swapping');
        setTimeout(apply, 180);
      } else apply();
    };
    const openLb = (i, trigger) => {
      opener = trigger;
      render(i, false);
      lb.hidden = false;
      void lb.offsetWidth;
      lb.classList.add('is-open');
      document.body.classList.add('is-locked');
      btnClose.focus();
    };
    const closeLb = () => {
      lb.classList.remove('is-open');
      document.body.classList.remove('is-locked');
      setTimeout(() => { lb.hidden = true; }, reduceMotion.matches ? 0 : 380);
      if (opener) opener.focus();
    };

    galleryItems.forEach((item, i) => item.addEventListener('click', () => openLb(i, item)));
    btnClose.addEventListener('click', closeLb);
    btnPrev.addEventListener('click', () => render(index - 1));
    btnNext.addEventListener('click', () => render(index + 1));
    stage.addEventListener('click', (e) => { if (e.target === stage) closeLb(); });

    document.addEventListener('keydown', (e) => {
      if (lb.hidden) return;
      if (e.key === 'Escape') closeLb();
      else if (e.key === 'ArrowLeft') render(index - 1);
      else if (e.key === 'ArrowRight') render(index + 1);
      else if (e.key === 'Tab') {
        const f = [btnClose, btnPrev, btnNext];
        const pos = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(pos + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });

    // Swipe
    let startX = 0, startY = 0, tracking = false;
    stage.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      startX = t.clientX; startY = t.clientY; tracking = true;
    }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) render(index + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  /* ---------- Testimonial slider ---------- */
  $$('[data-slider]').forEach((slider) => {
    if (slider.closest('[hidden]')) return;
    const track = $('[data-slider-track]', slider);
    const slides = Array.from(track.children);
    const dotsWrap = $('[data-slider-dots]', slider);
    if (slides.length < 2) return;
    let i = 0;
    const dots = slides.map((_, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 't-dot';
      b.setAttribute('aria-label', `Show testimonial ${n + 1}`);
      b.addEventListener('click', () => go(n));
      dotsWrap.appendChild(b);
      return b;
    });
    const counter = $('[data-slider-count]', slider);
    const pad = (n) => String(n).padStart(2, '0');
    slides.forEach((s, k) => s.setAttribute('aria-label', `${k + 1} of ${slides.length}`));
    const go = (n) => {
      i = (n + slides.length) % slides.length;
      if (counter) counter.textContent = `${pad(i + 1)} / ${pad(slides.length)}`;
      track.style.transform = `translateX(${-100 * i}%)`;
      slides.forEach((s, k) => { s.setAttribute('aria-hidden', String(k !== i)); s.inert = k !== i; });
      dots.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
    };
    $('[data-slider-prev]', slider).addEventListener('click', () => go(i - 1));
    $('[data-slider-next]', slider).addEventListener('click', () => go(i + 1));
    let sx = 0;
    track.addEventListener('touchstart', (e) => { sx = e.changedTouches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 45) go(i + (dx < 0 ? 1 : -1));
    }, { passive: true });
    slider.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') go(i - 1);
      if (e.key === 'ArrowRight') go(i + 1);
    });
    go(0);
  });

  /* ---------- Map facade: load iframe on request ---------- */
  $$('[data-map]').forEach((wrap) => {
    const btn = $('[data-map-load]', wrap);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = wrap.dataset.mapSrc;
      iframe.title = 'Map showing Shah Medicare Centre & Hospital, Ahmedabad';
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      iframe.allowFullscreen = true;
      wrap.appendChild(iframe);
      const facade = $('.map__facade', wrap);
      if (facade) facade.hidden = true;
      iframe.focus();
    });
  });

  /* ---------- Footer year ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();
