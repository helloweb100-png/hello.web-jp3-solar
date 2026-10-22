/* ==========================================================================
   JP3 SOLAR | app.js
   --------------------------------------------------------------------------
   Índice
    1. Configuración (WhatsApp y supuestos de la calculadora)
    2. Utilidades y detección de preferencias
    3. Enlaces de WhatsApp
    4. Texto dividido en palabras (animación de titulares)
    5. Loader
    6. Scroll suave (Lenis), barra de progreso y navegación
    7. Revelado al entrar en pantalla, contadores, marquee, spotlight, magnético
    8. Hero: partículas de energía e inclinación por puntero
    9. Escenas de scroll (GSAP + ScrollTrigger)
   10. Calculadora de ahorro
   11. Formulario hacia WhatsApp
   12. Visor de equipos (lightbox)
   13. Botón flotante y arranque
   --------------------------------------------------------------------------
   Si las librerías de la CDN no cargan, la página sigue siendo 100% usable:
   se omiten las escenas fijadas y todo el contenido queda visible.
   ========================================================================== */
(() => {
    'use strict';

    /* ----------------------------------------------------------------------
       1. CONFIGURACIÓN
       ---------------------------------------------------------------------- */
    const CONFIG = {
        whatsapp: '528131222982', // +52 81 3122 2982
        calc: {
            // Supuestos de la estimación. Ajusta aquí si el cliente quiere otros valores.
            tariff: { hogar: 3.2, negocio: 4.6 }, // MXN por kWh (promedio orientativo)
            sunHours: 5.2,   // horas de sol pico al día
            performance: .78, // eficiencia global del sistema
            panelWatts: 550,  // potencia por panel
            coverage: .9,     // porcentaje del consumo que se busca cubrir
            nightShare: .4,   // fracción del consumo diario que se guarda en baterías
            years: 10
        }
    };

    /* ----------------------------------------------------------------------
       2. UTILIDADES
       ---------------------------------------------------------------------- */
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;

    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const hasGSAP = Boolean(window.gsap && window.ScrollTrigger);
    const hasLenis = Boolean(window.Lenis);

    if (!reduceMotion) root.classList.add('anim');

    /** Bucle de animación compartido: solo corre mientras haya tareas activas. */
    const Ticker = (() => {
        const fns = new Set();
        let id = 0;
        let last = 0;
        const loop = (t) => {
            const dt = Math.min((t - last) / 1000, .05);
            last = t;
            fns.forEach((fn) => fn(dt, t));
            id = fns.size ? requestAnimationFrame(loop) : 0;
        };
        return {
            add(fn) { fns.add(fn); if (!id) { last = performance.now(); id = requestAnimationFrame(loop); } },
            remove(fn) { fns.delete(fn); }
        };
    })();

    /** Ejecuta fn en cada frame solo mientras el elemento esté visible. */
    function whenVisible(el, fn) {
        if (!('IntersectionObserver' in window)) { Ticker.add(fn); return; }
        let on = false;
        new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && !on) { on = true; Ticker.add(fn); }
            else if (!entry.isIntersecting && on) { on = false; Ticker.remove(fn); }
        }, { rootMargin: '120px' }).observe(el);
    }

    /** Anima un número con easing suave. */
    function tweenNumber(from, to, duration, onUpdate, onDone) {
        if (reduceMotion || duration <= 0) { onUpdate(to); if (onDone) onDone(); return; }
        const start = performance.now();
        const step = (now) => {
            const p = clamp((now - start) / duration, 0, 1);
            const e = 1 - Math.pow(1 - p, 4);
            onUpdate(lerp(from, to, e));
            if (p < 1) requestAnimationFrame(step); else if (onDone) onDone();
        };
        requestAnimationFrame(step);
    }

    /* ----------------------------------------------------------------------
       3. ENLACES DE WHATSAPP
       ---------------------------------------------------------------------- */
    const waUrl = (msg) => `https://wa.me/${CONFIG.whatsapp}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;

    function initWhatsAppLinks() {
        $$('[data-wa]').forEach((a) => { a.href = waUrl(a.dataset.wa); });
    }

    /* ----------------------------------------------------------------------
       4. TEXTO DIVIDIDO EN PALABRAS (máscara de revelado)
       ---------------------------------------------------------------------- */
    function initSplit() {
        if (reduceMotion) return;
        $$('[data-split]').forEach((el) => {
            let index = 0;
            const makeWord = (text) => {
                const w = document.createElement('span');
                const wi = document.createElement('span');
                w.className = 'w';
                wi.className = 'wi';
                wi.style.setProperty('--i', index++);
                wi.textContent = text;
                w.append(wi);
                return w;
            };
            const walk = (node) => {
                Array.from(node.childNodes).forEach((child) => {
                    if (child.nodeType === 3) {
                        const frag = document.createDocumentFragment();
                        child.textContent.split(/(\s+)/).forEach((part) => {
                            if (!part) return;
                            frag.append(/^\s+$/.test(part) ? document.createTextNode(part) : makeWord(part));
                        });
                        child.replaceWith(frag);
                    } else if (child.nodeType === 1) {
                        if (child.classList.contains('grad')) {
                            // Los fragmentos con degradado se animan como una sola unidad
                            const w = document.createElement('span');
                            w.className = 'w' + (el.classList.contains('hero__title') ? ' w--block' : '');
                            child.replaceWith(w);
                            child.classList.add('wi');
                            child.style.setProperty('--i', index++);
                            w.append(child);
                        } else {
                            walk(child);
                        }
                    }
                });
            };
            walk(el);
        });
    }

    /* ----------------------------------------------------------------------
       5. LOADER
       ---------------------------------------------------------------------- */
    function runLoader() {
        return new Promise((resolve) => {
            const loader = $('#loader');
            if (!loader) { resolve(); return; }
            if (reduceMotion) { loader.classList.add('is-gone'); resolve(); return; }

            const arc = $('.loader__arc', loader);
            const pctEl = $('[data-loader-pct]', loader);
            const MIN_MS = 2300;
            const startAt = performance.now();
            let loaded = false;
            let shown = 0;
            let finished = false;

            const pageReady = new Promise((r) => {
                if (document.readyState === 'complete') r(); else window.addEventListener('load', r, { once: true });
            });
            const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
            Promise.all([pageReady, fontsReady]).then(() => { loaded = true; });
            setTimeout(() => { loaded = true; }, 7000); // red de seguridad

            const finish = () => {
                finished = true;
                if (arc) arc.style.strokeDashoffset = 0;
                if (pctEl) pctEl.textContent = '100';
                setTimeout(() => {
                    loader.classList.add('is-done');
                    setTimeout(resolve, 650);
                    setTimeout(() => loader.classList.add('is-gone'), 1500);
                }, 260);
            };

            const tick = (now) => {
                if (finished) return;
                const t = clamp((now - startAt) / MIN_MS, 0, 1);
                const eased = 1 - Math.pow(1 - t, 3);
                const target = (loaded ? 1 : .92) * eased * 100;
                shown += (target - shown) * .14;
                const v = clamp(shown, 0, 100);
                if (arc) arc.style.strokeDashoffset = 100 - v;
                if (pctEl) pctEl.textContent = String(Math.round(v)).padStart(2, '0');
                if (loaded && t >= 1 && v > 98.5) finish(); else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }

    /* ----------------------------------------------------------------------
       6. SCROLL SUAVE, PROGRESO Y NAVEGACIÓN
       ---------------------------------------------------------------------- */
    let lenis = null;

    function initLenis() {
        if (reduceMotion || !hasLenis) return;
        lenis = new window.Lenis({ lerp: .085, wheelMultiplier: .92, smoothWheel: true });
        if (hasGSAP) {
            lenis.on('scroll', window.ScrollTrigger.update);
            window.gsap.ticker.add((t) => lenis.raf(t * 1000));
            window.gsap.ticker.lagSmoothing(0);
        } else {
            const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
            requestAnimationFrame(raf);
        }
        lenis.stop(); // se libera cuando termina el loader
    }

    function scrollToTarget(target) {
        if (lenis) lenis.scrollTo(target, { offset: -64, duration: 1.7, easing: (t) => 1 - Math.pow(1 - t, 4) });
        else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }

    function initAnchors() {
        $$('a[href^="#"]').forEach((a) => {
            a.addEventListener('click', (e) => {
                const id = a.getAttribute('href');
                if (!id || id.length < 2) return;
                const target = $(id);
                if (!target) return;
                e.preventDefault();
                closeMenu();
                scrollToTarget(target);
                history.replaceState(null, '', id);
            });
        });
    }

    /** Observa el scroll con ScrollTrigger si existe; si no, un listener pasivo ligero. */
    function onScrollProgress(cb) {
        if (hasGSAP && !reduceMotion) {
            window.ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => cb(self.scroll(), self.progress, self.direction) });
            return;
        }
        let last = window.scrollY;
        let queued = false;
        window.addEventListener('scroll', () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => {
                const y = window.scrollY;
                const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
                cb(y, y / max, y > last ? 1 : -1);
                last = y;
                queued = false;
            });
        }, { passive: true });
    }

    const nav = $('[data-nav]');
    const menu = $('#menu');
    const burger = $('.nav__burger');

    function initNav() {
        const bar = $('[data-progress]');
        onScrollProgress((y, progress, dir) => {
            if (bar) bar.style.transform = `scaleX(${progress})`;
            if (nav && !(menu && menu.classList.contains('is-open'))) nav.classList.toggle('is-hidden', dir === 1 && y > 260);
        });

        // Enlace activo según la sección visible
        const links = $$('.nav__links a');
        const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach((en) => {
                    if (!en.isIntersecting) return;
                    links.forEach((l) => l.classList.remove('is-active'));
                    const link = map.get(en.target.id);
                    if (link) link.classList.add('is-active');
                });
            }, { rootMargin: '-45% 0px -50% 0px' });
            map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
        }
    }

    function openMenu() {
        menu.classList.add('is-open');
        menu.setAttribute('aria-hidden', 'false');
        burger.setAttribute('aria-expanded', 'true');
        burger.setAttribute('aria-label', 'Cerrar menú');
        if (lenis) lenis.stop(); else document.body.style.overflow = 'hidden';
        if (nav) nav.classList.remove('is-hidden');
    }

    function closeMenu() {
        if (!menu || !menu.classList.contains('is-open')) return;
        menu.classList.remove('is-open');
        menu.setAttribute('aria-hidden', 'true');
        burger.setAttribute('aria-expanded', 'false');
        burger.setAttribute('aria-label', 'Abrir menú');
        if (lenis) lenis.start(); else document.body.style.overflow = '';
    }

    function initMenu() {
        if (!burger || !menu) return;
        burger.addEventListener('click', () => (menu.classList.contains('is-open') ? closeMenu() : openMenu()));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
        window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) closeMenu(); });
    }

    /* ----------------------------------------------------------------------
       7. REVELADO, CONTADORES, MARQUEE, SPOTLIGHT, MAGNÉTICO
       ---------------------------------------------------------------------- */
    function initReveal() {
        // Escalonado automático entre hermanos
        const groups = new Map();
        $$('[data-reveal]').forEach((el) => {
            if (el.closest('.hero')) return;
            const p = el.parentElement;
            if (!groups.has(p)) groups.set(p, []);
            groups.get(p).push(el);
        });
        groups.forEach((list) => { if (list.length > 1) list.forEach((el, i) => el.style.setProperty('--d', `${i * .09}s`)); });

        const targets = $$('[data-reveal], [data-split]').filter((el) => !el.closest('.hero'));
        if (reduceMotion || !('IntersectionObserver' in window)) { targets.forEach((el) => el.classList.add('is-in')); return; }
        const io = new IntersectionObserver((entries) => {
            entries.forEach((en) => {
                if (!en.isIntersecting) return;
                en.target.classList.add('is-in');
                io.unobserve(en.target);
            });
        }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
        targets.forEach((el) => io.observe(el));
    }

    function initCounters() {
        const counters = $$('[data-count]');
        if (!counters.length) return;
        const run = (el) => {
            const to = Number(el.dataset.count);
            tweenNumber(0, to, 2200, (v) => { el.textContent = String(Math.round(v)); });
        };
        if (reduceMotion || !('IntersectionObserver' in window)) return;
        counters.forEach((el) => { el.textContent = '0'; });
        const io = new IntersectionObserver((entries) => {
            entries.forEach((en) => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
        }, { threshold: .6 });
        counters.forEach((el) => io.observe(el));
    }

    function initMarquee() {
        const track = $('[data-marquee]');
        if (!track) return;
        const list = $('.strip__list', track);
        const clone = list.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.append(clone);
        if (reduceMotion || !hasGSAP) return;
        // El marquee se acelera con la velocidad del scroll (el contenido "responde" al movimiento del usuario)
        const anim = track.getAnimations()[0];
        if (!anim) return;
        let boost = 0;
        let rate = 1;
        window.ScrollTrigger.create({
            start: 0, end: 'max',
            onUpdate: (self) => { boost = Math.min(Math.abs(self.getVelocity()) / 500, 7); }
        });
        Ticker.add(() => {
            boost *= .93;
            rate += ((1 + boost) - rate) * .12;
            anim.playbackRate = rate;
        });
    }

    function initSpotlight() {
        if (!finePointer) return;
        document.addEventListener('pointermove', (e) => {
            const t = e.target.closest ? e.target.closest('.spot') : null;
            if (!t) return;
            const r = t.getBoundingClientRect();
            t.style.setProperty('--mx', `${e.clientX - r.left}px`);
            t.style.setProperty('--my', `${e.clientY - r.top}px`);
        }, { passive: true });
    }

    function initMagnetic() {
        if (!finePointer || reduceMotion) return;
        $$('.magnetic').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                const x = (e.clientX - (r.left + r.width / 2)) * .28;
                const y = (e.clientY - (r.top + r.height / 2)) * .4;
                el.style.translate = `${x}px ${y}px`;
            });
            el.addEventListener('pointerleave', () => { el.style.translate = '0 0'; });
        });
    }

    /* ----------------------------------------------------------------------
       8. HERO: PARTÍCULAS DE ENERGÍA E INCLINACIÓN
       ---------------------------------------------------------------------- */
    function initHeroCanvas() {
        const canvas = $('#energy-canvas');
        const hero = $('#inicio');
        if (!canvas || !hero || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');
        let w = 0, h = 0, dpr = 1;
        let parts = [];
        const mouse = { x: -9999, y: -9999 };

        const spawnPhoton = (initial) => {
            // Fotones: nacen en el "sol" (esquina inferior derecha) y viajan hacia arriba a la izquierda
            const ang = Math.PI * (1.0 + Math.random() * .42);
            const speed = .5 + Math.random() * 1.5;
            const ox = w * (.78 + Math.random() * .3);
            const oy = h * (.85 + Math.random() * .3);
            const life = initial ? Math.random() : 0;
            return {
                type: 'photon', x: ox + Math.cos(ang) * life * w * .8, y: oy + Math.sin(ang) * life * h * .8,
                vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: .8 + Math.random() * 1.9, life, decay: .0016 + Math.random() * .0024
            };
        };
        const spawnElectron = () => ({
            type: 'electron', x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, r: .8 + Math.random() * 1.4, life: 0, decay: 0
        });
        const seed = () => {
            const total = clamp(Math.round((w * h) / 15000), 34, 110);
            parts = Array.from({ length: total }, (_, i) => (i % 5 < 2 ? spawnPhoton(true) : spawnElectron()));
        };
        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 1.75);
            w = hero.clientWidth;
            h = hero.clientHeight;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            seed();
            if (reduceMotion) draw(0);
        };

        const draw = (dt) => {
            const k = dt * 60;
            ctx.clearRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'lighter';
            const electrons = [];
            for (let i = 0; i < parts.length; i++) {
                const p = parts[i];
                if (p.type === 'photon') {
                    const px = p.x, py = p.y;
                    p.x += p.vx * k; p.y += p.vy * k; p.life += p.decay * k;
                    if (p.life >= 1 || p.x < -40 || p.y < -40) { parts[i] = spawnPhoton(false); continue; }
                    const a = Math.sin(p.life * Math.PI);
                    ctx.strokeStyle = `rgba(255,170,80,${a * .55})`;
                    ctx.lineWidth = p.r;
                    ctx.beginPath(); ctx.moveTo(px - p.vx * 7, py - p.vy * 7); ctx.lineTo(p.x, p.y); ctx.stroke();
                    ctx.fillStyle = `rgba(255,205,140,${a * .9})`;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
                } else {
                    const dx = mouse.x - p.x, dy = mouse.y - p.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < 32000 && d2 > 1) { const f = (1 - d2 / 32000) * .05; p.vx += dx * f * .01 * k; p.vy += dy * f * .01 * k; }
                    p.vx *= .995; p.vy *= .995;
                    p.x += p.vx * k; p.y += p.vy * k;
                    if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
                    if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
                    ctx.fillStyle = 'rgba(130,175,255,.85)';
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
                    electrons.push(p);
                }
            }
            // Conexiones entre electrones cercanos
            ctx.lineWidth = 1;
            for (let i = 0; i < electrons.length; i++) {
                const a = electrons[i];
                for (let j = i + 1; j < electrons.length; j++) {
                    const b = electrons[j];
                    const dx = a.x - b.x, dy = a.y - b.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < 11000) {
                        ctx.strokeStyle = `rgba(100,150,255,${(1 - d2 / 11000) * .28})`;
                        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                    }
                }
                const mx = mouse.x - a.x, my = mouse.y - a.y, md = mx * mx + my * my;
                if (md < 24000) {
                    ctx.strokeStyle = `rgba(255,170,90,${(1 - md / 24000) * .5})`;
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
                }
            }
            ctx.globalCompositeOperation = 'source-over';
        };

        resize();
        if (reduceMotion) { draw(1 / 60); return; }
        let timer = 0;
        if ('ResizeObserver' in window) {
            new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(resize, 150); }).observe(hero);
        } else {
            window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(resize, 150); });
        }
        hero.addEventListener('pointermove', (e) => {
            const r = hero.getBoundingClientRect();
            mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
        }, { passive: true });
        hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
        whenVisible(hero, draw);
    }

    function initHeroTilt() {
        const stage = $('[data-tilt-stage]');
        const hero = $('#inicio');
        if (!stage || !hero || reduceMotion) return;
        const items = $$('[data-depth]', stage).map((el) => ({ el, depth: Number(el.dataset.depth) }));
        const target = { x: 0, y: 0 };
        const cur = { x: 0, y: 0 };
        if (finePointer) {
            hero.addEventListener('pointermove', (e) => {
                const r = hero.getBoundingClientRect();
                target.x = (e.clientX - r.left) / r.width - .5;
                target.y = (e.clientY - r.top) / r.height - .5;
            }, { passive: true });
            hero.addEventListener('pointerleave', () => { target.x = target.y = 0; });
        }
        whenVisible(hero, () => {
            cur.x = lerp(cur.x, target.x, .07);
            cur.y = lerp(cur.y, target.y, .07);
            items.forEach(({ el, depth }) => {
                el.style.transform = `translate3d(${-cur.x * 26 * depth}px, ${-cur.y * 20 * depth}px, 0) rotateY(${cur.x * 7 * depth}deg) rotateX(${-cur.y * 6 * depth}deg)`;
            });
        });
    }

    /* ----------------------------------------------------------------------
       9. ESCENAS DE SCROLL (GSAP + ScrollTrigger)
       ---------------------------------------------------------------------- */
    function initScrollScenes() {
        const gsap = window.gsap;
        const ST = window.ScrollTrigger;
        gsap.registerPlugin(ST);
        ST.config({ ignoreMobileResize: true });
        root.classList.add('has-gsap');
        const mm = gsap.matchMedia();

        /* --- Hero: profundidad al hacer scroll --- */
        const hero = $('#inicio');
        if (hero) {
            gsap.to('[data-hero-bg]', { yPercent: 14, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
            gsap.to('.hero__grid', { yPercent: -9, opacity: .15, ease: 'none', scrollTrigger: { trigger: hero, start: '35% top', end: 'bottom top', scrub: true } });
        }

        /* --- Parallax de fondos --- */
        $$('[data-parallax]').forEach((img) => {
            const amt = parseFloat(img.dataset.parallax) * 45;
            gsap.fromTo(img, { yPercent: -amt }, { yPercent: amt, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
        });

        /* --- Imagen que se expande a pantalla completa --- */
        const expand = $('[data-expand]');
        if (expand) {
            const media = $('[data-expand-media]', expand);
            const img = $('[data-expand-img]', expand);
            const shade = $('[data-expand-shade]', expand);
            const left = $('[data-expand-l]', expand);
            const right = $('[data-expand-r]', expand);
            const caption = $('[data-expand-caption]', expand);
            mm.add({ wide: '(min-width: 800px)', narrow: '(max-width: 799px)' }, (ctx) => {
                // Recorte inicial (arriba, derecha, abajo, izquierda) en %. Se interpola a mano:
                // el navegador normaliza inset() a 2 valores y GSAP no alinea bien los tokens.
                const from = ctx.conditions.wide ? [23, 33, 23, 33] : [27, 13, 27, 13];
                const state = { p: 0 };
                const applyClip = () => {
                    const [t, r, b, l] = from.map((v) => (v * (1 - state.p)).toFixed(3));
                    media.style.clipPath = `inset(${t}% ${r}% ${b}% ${l}% round ${(30 * (1 - state.p)).toFixed(2)}px)`;
                };
                applyClip();
                gsap.set(img, { scale: 1.45 });
                gsap.set(shade, { opacity: .25 });
                gsap.set(caption, { autoAlpha: 0, y: 56 });
                const tl = gsap.timeline({
                    defaults: { ease: 'none' },
                    scrollTrigger: { trigger: expand, start: 'top top', end: '+=210%', pin: '.expand__pin', scrub: .9, anticipatePin: 1, invalidateOnRefresh: true }
                });
                tl.to(state, { p: 1, duration: 1, onUpdate: applyClip }, 0)
                    .to(img, { scale: 1, duration: 1 }, 0)
                    .to(shade, { opacity: 1, duration: 1 }, 0)
                    .to(left, { x: () => -window.innerWidth * .8, duration: .8, ease: 'power2.in' }, .12)
                    .to(right, { x: () => window.innerWidth * .8, duration: .8, ease: 'power2.in' }, .12)
                    .to([left, right], { autoAlpha: 0, duration: .25 }, .6)
                    .to(caption, { autoAlpha: 1, y: 0, duration: .28, ease: 'power2.out' }, .72);
                return () => { media.style.clipPath = ''; };
            });
        }

        /* --- Diagrama de energía por pasos --- */
        initFlow(true);

        /* --- Galería horizontal de equipos --- */
        const showcase = $('[data-showcase]');
        if (showcase) {
            const vp = $('[data-showcase-viewport]', showcase);
            const track = $('[data-showcase-track]', showcase);
            const bar = $('[data-showcase-bar]', showcase);
            mm.add('(min-width: 1024px) and (min-height: 640px)', () => {
                showcase.classList.add('is-pinned');
                const pad = () => parseFloat(getComputedStyle(vp).paddingLeft) || 0;
                const dist = () => Math.max(0, track.offsetWidth + pad() - vp.clientWidth);
                gsap.to(track, {
                    x: () => -dist(), ease: 'none',
                    scrollTrigger: {
                        trigger: showcase, start: 'top top', end: () => `+=${dist()}`, pin: '.showcase__pin', scrub: .8, anticipatePin: 1, invalidateOnRefresh: true,
                        onUpdate: (self) => { if (bar) bar.style.transform = `scaleX(${self.progress})`; }
                    }
                });
                return () => { showcase.classList.remove('is-pinned'); if (bar) bar.style.transform = 'scaleX(0)'; };
            });
        }

        /* --- Tarjetas apiladas --- */
        const cards = $$('[data-scard]');
        cards.forEach((card, i) => {
            card.style.setProperty('--i', i);
            const next = cards[i + 1];
            if (!next) return;
            gsap.to(card, {
                scale: .93, '--dim': .62, ease: 'none',
                scrollTrigger: { trigger: next, start: 'top 85%', end: 'top 25%', scrub: true }
            });
        });

        /* --- Línea de tiempo del proceso --- */
        const timeline = $('[data-timeline]');
        if (timeline) {
            const fill = $('[data-timeline-fill]', timeline);
            mm.add('(min-width: 900px)', () => {
                gsap.fromTo(fill, { scaleX: 0, scaleY: 1 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: timeline, start: 'top 72%', end: 'bottom 62%', scrub: .5 } });
            });
            mm.add('(max-width: 899px)', () => {
                gsap.fromTo(fill, { scaleY: 0, scaleX: 1 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: timeline, start: 'top 70%', end: 'bottom 60%', scrub: .5 } });
            });
            $$('[data-tstep]', timeline).forEach((step) => {
                ST.create({ trigger: step, start: 'top 68%', onEnter: () => step.classList.add('is-on'), onLeaveBack: () => step.classList.remove('is-on') });
            });
        }

        /* Reajuste de posiciones cuando todo terminó de cargar */
        const refresh = () => ST.refresh();
        window.addEventListener('load', () => setTimeout(refresh, 200), { once: true });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(refresh, 100));
    }

    /** Diagrama de flujo de energía. pinned = true cuando se controla con scroll. */
    function initFlow(pinned) {
        const sec = $('[data-flow-sec]');
        const flow = $('[data-flow]');
        if (!sec || !flow) return;
        const steps = $$('.flow-step', sec);
        const nodes = $$('.node', flow);
        const paths = $$('.fp', flow);
        const layer = $('[data-flow-dots]', flow);

        const setStep = (n) => {
            flow.dataset.step = n;
            steps.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.step) === n));
            nodes.forEach((el) => { const f = Number(el.dataset.from); if (f > 0) el.classList.toggle('on', f <= n); });
            paths.forEach((p) => { const f = Number(p.dataset.from); if (f > 0) p.classList.toggle('on', f <= n); });
        };

        // Puntos de energía que viajan por cada trayecto
        const dots = [];
        paths.forEach((path, pi) => {
            if (Number(path.dataset.from) === 0) return;
            for (let k = 0; k < 3; k++) {
                const el = document.createElement('i');
                el.className = 'fdot' + (path.dataset.from === '1' ? ' fdot--sun' : '');
                el.style.opacity = 0;
                layer.append(el);
                dots.push({ el, path, len: path.getTotalLength(), t: k / 3, speed: .2 + pi * .02 });
            }
        });
        const move = (dt) => {
            const w = layer.clientWidth, h = layer.clientHeight;
            dots.forEach((d) => {
                const on = d.path.classList.contains('on');
                d.el.style.opacity = on ? 1 : 0;
                if (!on) return;
                d.t = (d.t + dt * d.speed) % 1;
                const pt = d.path.getPointAtLength(d.t * d.len);
                d.el.style.transform = `translate(${pt.x / 100 * w}px, ${pt.y / 100 * h}px)`;
            });
        };
        if (!reduceMotion) whenVisible(flow, move);

        if (pinned) {
            const mmFlow = window.gsap.matchMedia();
            // Solo se fija si el alto de pantalla alcanza; si no, se muestra completo y con scroll normal
            mmFlow.add('(min-height: 560px)', () => {
                sec.classList.add('is-pinned');
                setStep(1);
                window.ScrollTrigger.create({
                    trigger: sec, start: 'top top', end: '+=330%', pin: '.flow-sec__pin', anticipatePin: 1,
                    onUpdate: (self) => setStep(1 + Math.min(3, Math.floor(self.progress * 4)))
                });
                return () => { sec.classList.remove('is-pinned'); setStep(4); };
            });
            mmFlow.add('(max-height: 559px)', () => { setStep(4); });
        } else {
            setStep(4); // sin scroll controlado: el diagrama se muestra completo
        }
    }

    /** Alternativa sin GSAP o con movimiento reducido: todo visible y funcional. */
    function initStaticFallbacks() {
        initFlow(false);
        const showcase = $('[data-showcase]');
        if (showcase) {
            const vp = $('[data-showcase-viewport]', showcase);
            const bar = $('[data-showcase-bar]', showcase);
            if (vp && bar) vp.addEventListener('scroll', () => {
                const max = vp.scrollWidth - vp.clientWidth;
                bar.style.transform = `scaleX(${max > 0 ? vp.scrollLeft / max : 0})`;
            }, { passive: true });
        }
        $$('[data-scard]').forEach((c, i) => c.style.setProperty('--i', i));
    }

    /* ----------------------------------------------------------------------
       10. CALCULADORA DE AHORRO
       ---------------------------------------------------------------------- */
    function initCalc() {
        const form = $('#calc-form');
        if (!form) return;
        const bill = $('#bill');
        const billOut = $('#bill-out');
        const battery = $('#with-battery');
        const cta = $('[data-calc-cta]');
        const gauge = $('[data-gauge]');
        const batteryRow = $('[data-battery-row]');
        const out = (k) => $(`[data-out="${k}"]`);
        const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
        const c = CONFIG.calc;
        const shown = { kwp: 0, monthly: 0, decade: 0, storage: 0 };
        const seq = { kwp: 0, monthly: 0, decade: 0, storage: 0 }; // evita que tweens viejos pisen a los nuevos

        const compute = () => {
            const bimonthly = Number(bill.value);
            const uso = (form.elements.uso.value || 'hogar');
            const monthlyBill = bimonthly / 2;
            const kwhMonth = monthlyBill / c.tariff[uso];
            const needKwp = (kwhMonth * c.coverage) / (30 * c.sunHours * c.performance);
            const panels = Math.max(1, Math.ceil((needKwp * 1000) / c.panelWatts));
            const kwp = panels * c.panelWatts / 1000;
            const monthly = monthlyBill * c.coverage;
            const decade = monthly * 12 * c.years;
            const storage = battery.checked ? Math.max(1, (kwhMonth / 30) * c.nightShare) : 0;
            return { bimonthly, uso, panels, kwp, monthly, decade, storage };
        };

        const update = (animate = true) => {
            const r = compute();
            const pct = ((bill.value - bill.min) / (bill.max - bill.min)) * 100;
            bill.style.setProperty('--p', `${pct}%`);
            bill.setAttribute('aria-valuetext', money.format(r.bimonthly));
            billOut.textContent = money.format(r.bimonthly);
            if (batteryRow) batteryRow.hidden = !battery.checked;
            if (gauge) gauge.style.strokeDashoffset = 100 - c.coverage * 100;

            const dur = animate ? 700 : 0;
            const setNum = (key, to, fmt) => {
                const el = out(key);
                const id = ++seq[key];
                tweenNumber(shown[key], to, dur, (v) => {
                    if (seq[key] !== id) return;
                    el.textContent = fmt(v);
                    shown[key] = v;
                });
            };
            setNum('kwp', r.kwp, (v) => v.toFixed(1));
            setNum('monthly', r.monthly, (v) => money.format(Math.round(v / 10) * 10));
            setNum('decade', r.decade, (v) => money.format(Math.round(v / 1000) * 1000));
            if (r.storage) setNum('storage', r.storage, (v) => v.toFixed(1));
            out('panels').textContent = `${r.panels} ${r.panels === 1 ? 'panel' : 'paneles'} de ${c.panelWatts} W`;
            out('coverage').textContent = String(Math.round(c.coverage * 100));

            if (cta) {
                const lines = [
                    `Hola JP3 Solar, mi recibo de luz es de aproximadamente ${money.format(r.bimonthly)} bimestrales (${r.uso}).`,
                    `La calculadora sugiere unos ${r.kwp.toFixed(1)} kWp (${r.panels} paneles)${battery.checked ? ' con respaldo de baterías de litio' : ''}.`,
                    'Estoy listo, quiero mi cotización.'
                ];
                cta.href = waUrl(lines.join(' '));
            }
        };

        form.addEventListener('input', () => update(true));
        form.addEventListener('change', () => update(true));
        update(false);
    }

    /* ----------------------------------------------------------------------
       11. FORMULARIO HACIA WHATSAPP
       ---------------------------------------------------------------------- */
    function initForm() {
        const form = $('#contact-form');
        if (!form) return;
        const name = $('#f-name');
        const phone = $('#f-phone');
        const nameErr = $('#f-name-err');
        const phoneErr = $('#f-phone-err');
        const status = $('[data-form-status]', form);
        const submit = $('[data-submit]', form);
        const label = $('[data-submit-label]', form);

        const setErr = (input, el, msg) => {
            el.textContent = msg || '';
            if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
        };
        const validate = () => {
            let ok = true;
            const n = name.value.trim();
            if (n.length < 2) { setErr(name, nameErr, 'Escribe tu nombre para saber con quién hablamos.'); ok = false; } else setErr(name, nameErr, '');
            const digits = phone.value.replace(/\D/g, '');
            if (phone.value.trim() && (digits.length < 8 || digits.length > 15)) { setErr(phone, phoneErr, 'Revisa tu número: debe tener entre 8 y 15 dígitos.'); ok = false; } else setErr(phone, phoneErr, '');
            return ok;
        };
        name.addEventListener('input', () => { if (name.getAttribute('aria-invalid')) validate(); });
        phone.addEventListener('input', () => { if (phone.getAttribute('aria-invalid')) validate(); });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            status.className = 'form__status';
            if (!validate()) {
                status.textContent = 'Revisa los campos marcados para continuar.';
                status.classList.add('is-err');
                (name.getAttribute('aria-invalid') ? name : phone).focus();
                return;
            }
            const interests = $$('input[name="interes"]:checked', form).map((i) => i.value);
            const project = form.elements.proyecto.value;
            const msg = form.elements.mensaje.value.trim();
            const lines = [`Hola JP3 Solar, soy ${name.value.trim()}.`];
            lines.push(`Me interesa: ${interests.length ? interests.join(', ') : 'información general sobre energía solar'}.`);
            if (project) lines.push(`Tipo de proyecto: ${project}.`);
            if (msg) lines.push(`Detalles: ${msg}`);
            if (phone.value.trim()) lines.push(`Mi WhatsApp: ${phone.value.trim()}.`);
            lines.push('Quiero mi cotización.');
            const url = waUrl(lines.join('\n'));

            submit.classList.add('is-loading');
            label.textContent = 'Abriendo WhatsApp...';
            status.textContent = 'Preparando tu mensaje.';
            setTimeout(() => {
                const win = window.open(url, '_blank', 'noopener');
                submit.classList.remove('is-loading');
                label.textContent = 'Enviar mi solicitud por WhatsApp';
                if (win) {
                    status.textContent = 'Listo, tu mensaje está en WhatsApp. Solo falta enviarlo.';
                    status.classList.add('is-ok');
                } else {
                    status.innerHTML = 'Tu navegador bloqueó la ventana. <a href="' + url + '" target="_blank" rel="noopener"><u>Abre WhatsApp aquí</u></a>.';
                    status.classList.add('is-err');
                }
            }, 700);
        });
    }

    /* ----------------------------------------------------------------------
       12. VISOR DE EQUIPOS
       ---------------------------------------------------------------------- */
    function initLightbox() {
        const dlg = $('#lightbox');
        const plates = $$('[data-lightbox]');
        if (!dlg || !plates.length || typeof dlg.showModal !== 'function') return;
        const img = $('#lb-img');
        const title = $('#lb-title');
        const desc = $('#lb-desc');
        const cta = $('#lb-cta');
        let index = 0;

        const render = (i) => {
            index = (i + plates.length) % plates.length;
            const p = plates[index];
            const src = $('img', p);
            img.src = src.currentSrc || src.src;
            img.alt = src.alt;
            img.width = src.width;
            img.height = src.height;
            title.textContent = p.dataset.name;
            desc.textContent = p.dataset.desc;
            cta.href = waUrl(`Hola JP3 Solar, quiero cotizar: ${p.dataset.name}.`);
        };
        plates.forEach((p, i) => p.addEventListener('click', () => {
            render(i);
            dlg.showModal();
            if (lenis) lenis.stop();
        }));
        const close = () => dlg.close();
        $('[data-lb-close]', dlg).addEventListener('click', close);
        $('[data-lb-prev]', dlg).addEventListener('click', () => render(index - 1));
        $('[data-lb-next]', dlg).addEventListener('click', () => render(index + 1));
        dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
        dlg.addEventListener('close', () => { if (lenis) lenis.start(); });
        dlg.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') render(index - 1);
            if (e.key === 'ArrowRight') render(index + 1);
        });
    }

    /* ----------------------------------------------------------------------
       13. BOTÓN FLOTANTE Y ARRANQUE
       ---------------------------------------------------------------------- */
    function initWhatsAppFloat() {
        const el = $('.wa-float');
        if (!el || window.innerWidth < 640) return; // en móvil el globo taparía contenido
        setTimeout(() => {
            el.classList.add('show-tip');
            setTimeout(() => el.classList.remove('show-tip'), 6000);
        }, 7000);
    }

    function revealHero() {
        const title = $('.hero__title');
        if (title) { title.style.setProperty('--d', '120ms'); title.classList.add('is-in'); }
        $$('.hero [data-hero-in]').forEach((el, i) => {
            el.style.setProperty('--d', `${.42 + i * .16}s`);
            el.classList.add('is-in');
        });
        if (nav) nav.classList.remove('is-hidden');
    }

    function boot() {
        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
        window.scrollTo(0, 0);

        initWhatsAppLinks();
        initSplit();
        initLenis();
        initAnchors();
        initMenu();
        initReveal();
        initCounters();
        initMarquee();
        initSpotlight();
        initMagnetic();
        initCalc();
        initForm();
        initLightbox();
        initWhatsAppFloat();
        initHeroCanvas();
        initHeroTilt();

        const scenes = hasGSAP && !reduceMotion;
        if (scenes) initScrollScenes(); else initStaticFallbacks();
        initNav();

        if (nav && !reduceMotion) nav.classList.add('is-hidden');

        runLoader().then(() => {
            if (lenis) lenis.start();
            revealHero();
            if (scenes) window.ScrollTrigger.refresh();
            if (location.hash && $(location.hash)) setTimeout(() => scrollToTarget($(location.hash)), 400);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
