/* Myynd site. What the engine does not: the audience switch and its scan,
   the live window in the demo, the working-row flame, the first run's light
   field, the numbers in "what it is worth", and the buttons that pay. */
(function () {
  'use strict';

  var html = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var cfg = window.MYYND || {};
  var sc = window.ScrollCraft ? window.ScrollCraft.mount(document.body) : null;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  var mode = function () { return html.getAttribute('data-for') === 'co' ? 'co' : 'me'; };
  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };

  /* ================================================================
     The light field. Ported from the first run (src/onboarding/LightField):
     a slowly folding sheet of copper light, made of cells, that leans toward
     the pointer. u_shift moves the fabric when the audience changes, so the
     light itself is part of the regrade.
     ================================================================ */
  var FRAG = [
    'precision highp float;',
    'uniform vec2 u_resolution; uniform float u_time; uniform float u_shift; uniform vec2 u_pointer; uniform float u_presence;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
    'float field(vec2 p){float n=0.;float a=.5;for(int i=0;i<4;i++){n+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+3.7;a*=.5;}return n;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/u_resolution; float aspect=u_resolution.x/u_resolution.y;',
    ' vec2 cells=vec2(u_resolution.x/3.6,u_resolution.y/8.5); vec2 cell=floor(uv*cells); vec2 p=(cell+.5)/cells;',
    ' vec2 toPointer=(p-u_pointer)*vec2(aspect,1.); float halo=exp(-dot(toPointer,toPointer)*20.)*u_presence;',
    ' float t=u_time*.19;',
    ' float drift=field(vec2(p.x*3.7-t*.35,p.y*3.1+t*.22));',
    ' float warp=field(vec2(p.x*6.+drift*2.1+t*.12+u_shift*.4,p.y*4.-t*.18));',
    ' float centre=.46+.22*sin(p.x*4.8-1.1+t*.16+u_shift*1.3)+.08*(drift-.5)+.035*sin(p.x*7.-t*.6)-.1*u_shift;',
    ' float lean=exp(-pow((p.x-u_pointer.x)*aspect*1.5,2.))*u_presence; centre=mix(centre,u_pointer.y,.3*lean);',
    ' float spread=.105+.105*smoothstep(.18,.8,p.x)+.03*u_shift;',
    ' float d=(p.y-centre)/(spread+.03*sin(p.x*7.+t)); float envelope=exp(-d*d*1.35);',
    ' float folds=sin(p.x*15.5+p.y*7.2+warp*10.-t*.8); float ridges=pow(max(0.,folds*.5+.5),3.6);',
    ' float fine=pow(max(0.,sin(p.x*33.-p.y*17.+drift*8.+t)*.5+.5),6.);',
    ' float energy=envelope*(.20+ridges*1.48+fine*.28);',
    ' energy*=smoothstep(.04,.34,p.x)*(1.-smoothstep(.94,1.32,p.x));',
    ' energy*=1.-.85*exp(-pow((p.y-centre+.055+.025*sin(p.x*8.))/(.021+.012*warp),2.));',
    ' energy=energy*(1.+.6*halo)+.2*halo; energy*=.73+.45*hash(cell);',
    ' vec3 deep=vec3(.21,.021,.003),copper=vec3(1.,.24,.045),amber=vec3(1.,.59,.22),ivory=vec3(1.,.91,.67);',
    ' vec3 color=mix(deep,copper,smoothstep(.015,.47,energy)); color=mix(color,amber,smoothstep(.40,1.05,energy)); color=mix(color,ivory,smoothstep(.90,1.65,energy));',
    ' color*=smoothstep(.006,.17,energy);',
    ' vec2 cu=fract(uv*cells); float seams=smoothstep(.035,.11,cu.x)*(1.-smoothstep(.86,.97,cu.x)); seams*=smoothstep(.018,.055,cu.y)*(1.-smoothstep(.92,.99,cu.y));',
    ' color*=.47+.53*seams;',
    ' color+=vec3(.16,.037,.009)*exp(-d*d*.58)*smoothstep(.13,.65,p.x); color+=vec3(.012,.007,.008);',
    ' color*=1.-.40*pow(length((uv-.5)*vec2(.9,1.2)),1.5); color+=(hash(gl_FragCoord.xy)-.5)*.026;',
    ' gl_FragColor=vec4(color,1.);',
    '}'
  ].join('\n');

  var pointer = { x: .62, y: .45, t: -Infinity, cx: 0, cy: 0 };
  addEventListener('pointermove', function (e) { pointer.cx = e.clientX; pointer.cy = e.clientY; pointer.t = performance.now(); }, { passive: true });

  function LightField(host) {
    var gl = null, prog = null, fallback = host.querySelector('.field__fallback'), canvas = host.querySelector('.field__gl');
    var frame = 0, prev = 0, elapsed = Math.random() * 40000, visible = false, shift = mode() === 'co' ? 1 : 0;
    var p = { x: .62, y: .45 }, presence = 0, bounds = host.getBoundingClientRect();
    try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' }); } catch (e) {}
    if (gl) {
      var sh = function (k, src) { var s = gl.createShader(k); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
      var v = sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'), f = sh(gl.FRAGMENT_SHADER, FRAG);
      if (v && f) {
        prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) prog = null;
      }
      if (prog) {
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATUS_DRAW || gl.STATIC_DRAW);
        var a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      }
    }
    var U = prog ? {
      res: gl.getUniformLocation(prog, 'u_resolution'), time: gl.getUniformLocation(prog, 'u_time'),
      shift: gl.getUniformLocation(prog, 'u_shift'), ptr: gl.getUniformLocation(prog, 'u_pointer'), pres: gl.getUniformLocation(prog, 'u_presence')
    } : null;

    function paintFallback(w, h) {
      var ctx = fallback.getContext('2d'); if (!ctx) return;
      fallback.width = w; fallback.height = h;
      ctx.fillStyle = '#090605'; ctx.fillRect(0, 0, w, h);
      for (var x = 0; x < w; x += 5) {
        var u = x / w, mid = h * (.56 - .22 * Math.sin(u * 4.8 - 1.1));
        for (var y = 0; y < h; y += 10) {
          var dd = (y - mid) / (h * (.105 + .105 * u));
          var fold = Math.pow(Math.max(0, Math.sin(u * 17 + y / h * 8) * .5 + .5), 3);
          var en = Math.exp(-dd * dd * 1.35) * (.18 + fold) * Math.min(1, Math.max(0, (u - .08) * 4));
          if (en < .02) continue;
          ctx.fillStyle = 'rgba(255,' + Math.round(60 + en * 175) + ',' + Math.round(12 + en * 120) + ',' + Math.min(.98, en) + ')';
          ctx.fillRect(x, y, 4, 9);
        }
      }
    }
    function draw() {
      if (!prog) return;
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.time, elapsed / 1000);
      gl.uniform1f(U.shift, shift);
      gl.uniform2f(U.ptr, p.x, p.y);
      gl.uniform1f(U.pres, presence);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    function resize() {
      bounds = host.getBoundingClientRect();
      var ratio = Math.min(devicePixelRatio || 1, 1.25, 1800 / Math.max(1, bounds.width));
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      if (prog) gl.viewport(0, 0, canvas.width, canvas.height);
      paintFallback(Math.max(1, Math.round(bounds.width)), Math.max(1, Math.round(bounds.height)));
      draw();
    }
    function tick(now) {
      frame = 0;
      if (!visible || document.hidden || !prog) return;
      if (!prev) prev = now;
      if (now - prev >= 1000 / 30) {
        var dt = Math.min(now - prev, 100); prev = now;
        if (!reduce.matches) elapsed += dt;
        var want = mode() === 'co' ? 1 : 0;
        shift += (want - shift) * (1 - Math.exp(-dt / 700));
        bounds = host.getBoundingClientRect();
        var tx = (pointer.cx - bounds.left) / bounds.width, ty = 1 - (pointer.cy - bounds.top) / bounds.height;
        var inside = tx >= 0 && tx <= 1 && ty >= 0 && ty <= 1;
        var here = inside && now - pointer.t < 4000 && !reduce.matches ? 1 : 0;
        if (inside) { var k = 1 - Math.exp(-dt / 260); p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; }
        presence += (here - presence) * (1 - Math.exp(-dt / (here ? 500 : 1400)));
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function wake() { if (!frame && visible && prog) { prev = 0; frame = requestAnimationFrame(tick); } }
    if (prog) host.classList.add('is-live');
    new ResizeObserver(resize).observe(host);
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; wake(); }).observe(host);
    document.addEventListener('visibilitychange', wake);
    resize();
    return { wake: wake };
  }
  var fields = Array.prototype.map.call(document.querySelectorAll('.field'), LightField);
  // The welcome page borrows the light and nothing else.
  if (!document.getElementById('demo')) return;

  /* ================================================================
     The working-row flame. A lighter port of the app's AuroraCompito:
     streaks that drift left to right, each with its own flickering flame,
     and a band of light that travels through them. Never a progress bar.
     ================================================================ */
  function hash(i, s) { var n = Math.imul(i | 0, 374761393) + Math.imul(s | 0, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
  function noise1(x, s) { var i = Math.floor(x), f = x - i, k = f * f * (3 - 2 * f); return hash(i, s) * (1 - k) + hash(i + 1, s) * k; }
  function Flame(canvas) {
    var ctx = canvas.getContext('2d'), W = 0, H = 0, raf = 0, last = 0, t = 0, drift = 0, on = false, streaks = [], col = null;
    function size() {
      var r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.min(120, Math.max(24, Math.round(W / 6.5))), step = W / n; streaks = [];
      for (var i = 0; i < n; i++) streaks.push({ x: i * step + Math.random() * step * .6, w: 1 + Math.pow(Math.random(), 2) * step * .95, len: .7 + Math.random() * .45, seed: (Math.random() * 9973) | 0, pace: .55 + Math.random() * .8, weight: .42 + Math.random() * .58 });
      col = document.createElement('canvas'); col.width = 4; col.height = 128;
      var c = col.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(255,228,190,.95)'); g.addColorStop(.1, 'rgba(233,163,92,.7)'); g.addColorStop(.42, 'rgba(196,98,59,.42)'); g.addColorStop(.85, 'rgba(142,63,31,.12)'); g.addColorStop(1, 'rgba(142,63,31,0)');
      c.fillStyle = g; c.fillRect(0, 0, 4, 128);
    }
    function frame(now) {
      raf = 0; if (!on) return;
      var dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now; t += dt; drift += dt * 34;
      ctx.clearRect(0, 0, W, H);
      var band = (t / 4) % 1;
      // the rim: a warm wash that falls from the top edge, and a soft glow
      // that travels with the band, so the row reads as lit, not striped
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(233,163,92,.34)'); g.addColorStop(.45, 'rgba(196,98,59,.14)'); g.addColorStop(1, 'rgba(196,98,59,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      var gx = band * W, glow = ctx.createRadialGradient(gx, 0, 0, gx, 0, W * .32);
      glow.addColorStop(0, 'rgba(255,228,190,.5)'); glow.addColorStop(1, 'rgba(255,228,190,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      for (var i = 0; i < streaks.length; i++) {
        var s = streaks[i], x = (s.x + drift) % W;
        var u = x / W, dd = band - u; dd -= Math.round(dd);
        var light = dd >= 0 ? Math.exp(-Math.pow(dd / .26, 1.7)) : Math.exp(-Math.pow(-dd / .09, 2));
        var flick = noise1(t * s.pace * 3 + s.seed, s.seed) * .66 + noise1(t * s.pace * 6.5 + 11.3, s.seed + 7) * .34;
        var h = H * s.len * (.45 + .55 * flick) * (.55 + .45 * light);
        ctx.globalAlpha = clamp(s.weight * (.5 + .9 * light), 0, 1);
        ctx.drawImage(col, x, 0, s.w, h);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    size(); new ResizeObserver(size).observe(canvas);
    return {
      start: function () { if (on) return; on = true; last = 0; if (reduce.matches) { frame(performance.now()); on = false; return; } raf = requestAnimationFrame(frame); },
      stop: function () { on = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    };
  }

  /* ================================================================
     The demo window. Scroll is the playhead: the section's own progress
     decides what the window has read, composed and written. Everything is
     computed here from the sample data in the page.
     ================================================================ */
  var demo = document.getElementById('demo');
  var win = demo.querySelector('.win');
  var sent = { me: false, co: false };
  var lines = {
    me: ['Reading the thread with Studio Ferretti', 'Reading the agenda for Tuesday', 'Reading your notes from the Atelier Nord call', 'Working out what matters today'],
    co: ['Reading how Luca prices a repeat order', 'Reading the Ferretti thread from March', 'Reading the price list, version 3', 'Reading the interview: how Luca says yes']
  };
  var flames = new Map();
  Array.prototype.forEach.call(demo.querySelectorAll('.flame'), function (c) { flames.set(c, Flame(c)); });

  function demoProgress() {
    var r = demo.getBoundingClientRect(), travel = r.height - innerHeight;
    return travel > 0 ? clamp(-r.top / travel, 0, 1) : 0;
  }
  function renderDemo() {
    var m = mode(), p = demoProgress();
    var main = demo.querySelector('.win__main.for-' + m);
    var phase = p < .26 ? 0 : p < .5 ? 1 : p < .76 ? 2 : 3;
    win.setAttribute('data-phase', String(phase));
    var readPane = main.querySelector('.pane--read'), pagePane = main.querySelector('.pane--page');
    readPane.inert = phase !== 0; pagePane.inert = phase === 0;

    // reading: each source counts up in turn
    var rows = main.querySelectorAll('[data-read]'), total = 0, done = 0;
    Array.prototype.forEach.call(rows, function (li, i) {
      var target = +li.getAttribute('data-read'), k = clamp((p - (.015 + i * .026)) / .12, 0, 1);
      var n = Math.round(target * ease(k)); total += target;
      li.querySelector('[data-n]').textContent = n.toLocaleString('en-US');
      li.classList.toggle('is-on', k > 0);
      li.classList.toggle('is-done', k >= 1);
      if (k >= 1) done++;
    });
    var allRead = done === rows.length;
    win.classList.toggle('is-read', allRead);
    main.querySelector('[data-read-status]').textContent = allRead ? 'Read ' + total.toLocaleString('en-US') + ' things' : 'Reading ' + rows.length + ' sources';
    var L = lines[m], li = Math.min(L.length - 1, Math.floor(clamp(p / .24, 0, .999) * L.length));
    var lineEl = main.querySelector('[data-read-line]');
    if (lineEl.textContent !== L[li]) lineEl.textContent = L[li];

    // composing: rows arrive when their moment comes
    Array.prototype.forEach.call(main.querySelectorAll('[data-at]'), function (el) {
      el.classList.toggle('is-in', p >= +el.getAttribute('data-at'));
    });

    // the reply: open at the third beat, asking for the press at the fourth
    var reply = main.querySelector('.row--reply');
    var open = m === 'me' ? p >= .5 : p >= .52;
    reply.classList.toggle('is-open', open && !sent[m]);
    reply.classList.toggle('is-sent', sent[m] && open);
    reply.querySelector('.draft').inert = !open || sent[m];
    reply.querySelector('[data-send]').classList.toggle('is-ready', p >= .76 && !sent[m]);

    // the work: to do, then the fire, then the file
    var work = main.querySelector('.row--work'), a = m === 'me' ? .54 : .6, b = m === 'me' ? .72 : .75;
    var doing = p >= a && p < b, finished = p >= b;
    work.classList.toggle('is-doing', doing);
    work.classList.toggle('is-done', finished);
    flames.forEach(function (f, c) { if (c === work.querySelector('.flame') && doing) f.start(); else f.stop(); });

    // company: the answer types itself under the hand
    var ans = main.querySelector('.answer');
    if (ans) {
      var text = ans.querySelector('[data-type]'), full = text.getAttribute('data-type');
      var k = clamp((p - .31) / .15, 0, 1), n = Math.round(full.length * k);
      if (text.textContent.length !== n) text.textContent = full.slice(0, n);
      ans.classList.toggle('is-typing', k > 0 && k < 1);
      ans.classList.toggle('is-done', k >= 1);
    }
  }
  Array.prototype.forEach.call(demo.querySelectorAll('[data-send]'), function (b) {
    b.addEventListener('click', function () {
      var m = mode(), row = b.closest('.row--reply');
      sent[m] = true;
      row.querySelector('.sent').innerHTML = '<span class="ok" aria-hidden="true"></span>Sent to Marco. You read it in four seconds.';
      renderDemo();
    });
  });

  /* ================================================================
     The audience switch, the page's one signature. A light rises from the
     pill; every group it passes turns into its other version. Groups out of
     view change at once, so the rest of the page is ready before you get
     there. Every choice is remembered, and the link says it too.
     ================================================================ */
  var aud = document.querySelector('.aud'), thumb = aud.querySelector('.aud__thumb'), opts = aud.querySelectorAll('[data-aud]');
  var scan = document.querySelector('.scan');
  var GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789$%#/';
  var busy = null;

  function placeThumb() {
    var on = aud.querySelector('[data-aud="' + mode() + '"]');
    thumb.style.setProperty('--x', (on.offsetLeft) + 'px');
    thumb.style.setProperty('--w', on.offsetWidth + 'px');
    Array.prototype.forEach.call(opts, function (o) { var yes = o.getAttribute('data-aud') === mode(); o.setAttribute('aria-checked', String(yes)); o.tabIndex = yes ? 0 : -1; });
  }

  function decode(el) {
    // Only short, plain text decodes; anything longer arrives through a blur.
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [], len = 0, n;
    while ((n = walker.nextNode())) { if (n.nodeValue.trim()) { nodes.push({ n: n, full: n.nodeValue }); len += n.nodeValue.length; } }
    if (reduce.matches || !len || len > 140) { el.classList.remove('swap-in'); void el.offsetWidth; el.classList.add('swap-in'); return; }
    var start = performance.now(), dur = 560, idx = 0;
    nodes.forEach(function (o) { o.at = []; for (var i = 0; i < o.full.length; i++) o.at.push(((idx++) / len) * .55 + Math.random() * .35); });
    (function step(now) {
      var t = clamp((now - start) / dur, 0, 1);
      nodes.forEach(function (o) {
        var out = '';
        for (var i = 0; i < o.full.length; i++) {
          var ch = o.full[i];
          out += (ch === ' ' || t >= o.at[i]) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        o.n.nodeValue = out;
      });
      if (t < 1) requestAnimationFrame(step); else nodes.forEach(function (o) { o.n.nodeValue = o.full; });
    })(start);
  }

  function reveal(el) {
    // What the scan brings in must be visible now, not waiting for its own entrance.
    if (el.hasAttribute('data-sc-in')) el.classList.add('sc-in');
    Array.prototype.forEach.call(el.querySelectorAll('[data-sc-in], [data-sc-stagger] > *'), function (k) { k.classList.add('sc-in'); });
    if (el.closest('[data-swap]') || /^H[1-3]$/.test(el.tagName) || el.children.length === 0) decode(el);
    else { el.classList.remove('swap-in'); void el.offsetWidth; el.classList.add('swap-in'); }
  }

  function anchor() {
    // The first thing on screen, and where it is, so a change above it
    // cannot move what the visitor is looking at.
    var probe = document.elementFromPoint(innerWidth / 2, Math.min(innerHeight - 1, 120));
    var el = probe && probe.closest('section');
    return el ? { el: el, top: el.getBoundingClientRect().top } : null;
  }

  function switchTo(next, animate) {
    var prev = mode();
    if (next === prev) return;
    if (busy) busy.finish();
    var vh = innerHeight, groups = [], seen = new Set();
    Array.prototype.forEach.call(document.querySelectorAll('.for-me, .for-co'), function (el) {
      var p = el.parentElement; if (seen.has(p)) return; seen.add(p);
      var r = p.getBoundingClientRect();
      if (!animate || r.height === 0 || r.bottom <= 0 || r.top >= vh) return;
      var kids = Array.prototype.filter.call(p.children, function (k) { return k.classList.contains('for-me') || k.classList.contains('for-co'); });
      var old = kids.filter(function (k) { return k.classList.contains('for-' + prev); });
      var neu = kids.filter(function (k) { return k.classList.contains('for-' + next); });
      old.forEach(function (k) { k.style.display = getComputedStyle(k).display; });
      neu.forEach(function (k) { k.style.display = 'none'; });
      groups.push({ y: clamp(r.top + Math.min(r.height, vh) / 2, 0, vh), old: old, neu: neu, done: false });
    });
    var a = anchor();
    html.setAttribute('data-for', next);
    try { localStorage.setItem('myynd.for', next); } catch (e) {}
    try { var u = new URL(location.href); if (next === 'co') u.searchParams.set('for', 'company'); else u.searchParams.delete('for'); history.replaceState(null, '', u); } catch (e) {}
    if (a) { var d = a.el.getBoundingClientRect().top - a.top; if (Math.abs(d) > 1) scrollBy({ top: d, behavior: 'instant' }); }
    placeThumb(); wireButtons(); renderDemo(); fields.forEach(function (f) { f.wake(); });

    function swap(g) {
      if (g.done) return; g.done = true;
      g.old.forEach(function (k) { k.style.display = ''; });
      g.neu.forEach(function (k) { k.style.display = ''; reveal(k); });
    }
    function settle() { groups.forEach(swap); scan.style.opacity = '0'; busy = null; if (sc) sc.layout(); renderDemo(); }
    if (!groups.length || reduce.matches) { settle(); return; }

    var start = performance.now(), dur = 760, raf = 0;
    scan.style.opacity = '1';
    busy = { finish: function () { cancelAnimationFrame(raf); settle(); } };
    (function step(now) {
      var t = clamp((now - start) / dur, 0, 1), y = vh * (1 - ease(t));
      scan.style.transform = 'translate3d(0,' + (y - 120) + 'px,0)';
      groups.forEach(function (g) { if (y <= g.y) swap(g); });
      if (t < 1) raf = requestAnimationFrame(step);
      else { scan.style.transition = 'opacity .3s'; settle(); setTimeout(function () { scan.style.transition = ''; }, 320); }
    })(start);
  }

  Array.prototype.forEach.call(opts, function (o) {
    o.addEventListener('click', function () { switchTo(o.getAttribute('data-aud'), true); });
  });
  aud.addEventListener('keydown', function (e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
    e.preventDefault();
    var next = mode() === 'me' ? 'co' : 'me';
    switchTo(next, true);
    aud.querySelector('[data-aud="' + next + '"]').focus();
  });

  /* ================================================================
     Buttons that pay. An empty link in config.js means the checkout is not
     open yet: the button says so instead of going nowhere.
     ================================================================ */
  function wireButtons() {
    var m = mode(), co = cfg.checkout || {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-cta]'), function (b) {
      var target = m === 'me' ? co.founding : cfg.pilot;
      b.setAttribute('href', target || '#price');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-checkout]'), function (b) {
      var url = co[b.getAttribute('data-checkout')];
      if (url) { b.href = url; b.removeAttribute('aria-disabled'); }
      else { b.href = '#price'; b.setAttribute('aria-disabled', 'true'); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-pilot]'), function (b) {
      if (cfg.pilot) { b.href = cfg.pilot; b.removeAttribute('aria-disabled'); }
      else { b.href = '#price'; b.setAttribute('aria-disabled', 'true'); }
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[aria-disabled="true"]');
    if (!b) return;
    e.preventDefault();
    var note = b.parentElement.querySelector('.plan__fine');
    if (note && !note.dataset.was) { note.dataset.was = note.textContent; note.textContent = b.hasAttribute('data-pilot') ? 'Booking opens with the launch. Very soon.' : 'Checkout opens with the launch. Very soon.'; }
  });
  if (cfg.contact) {
    var c = document.querySelector('[data-contact]');
    c.hidden = false; c.textContent = cfg.contact; c.href = 'mailto:' + cfg.contact;
  }

  /* ================================================================
     What it is worth: the visitor's numbers, never ours.
     ================================================================ */
  var inputs = {};
  Array.prototype.forEach.call(document.querySelectorAll('[data-in]'), function (i) { inputs[i.getAttribute('data-in')] = i; });
  function out(k, v) { var o = document.querySelector('[data-out="' + k + '"]'); if (o) o.textContent = v; }
  function res(k, v) { var o = document.querySelector('[data-res="' + k + '"]'); if (o) o.textContent = v; }
  function hours(h) { return (h < 20 ? (Math.round(h * 10) / 10) : Math.round(h)) + (h === 1 ? ' hour' : ' hours'); }
  function share(v) { return v === 25 ? 'a quarter' : v === 50 ? 'half' : v === 75 ? 'three quarters' : v + '%'; }
  function worth() {
    Object.keys(inputs).forEach(function (k) {
      var i = inputs[k], f = (i.value - i.min) / (i.max - i.min) * 100;
      i.style.setProperty('--fill', f + '%');
    });
    var min = +inputs['me-min'].value, rate = +inputs['me-rate'].value;
    var h = min * 21 / 60, v = h * rate, x = Math.floor(v / 19);
    out('me-min', min + ' minutes'); out('me-rate', money(rate));
    res('me-hours', hours(h)); res('me-value', money(v));
    res('me-x', x >= 2 ? x + ' times' : x === 1 ? 'once' : 'less than once');
    var n = +inputs['co-n'].value, cm = +inputs['co-min'].value, sh = +inputs['co-share'].value, cr = +inputs['co-rate'].value;
    var ch = n * cm * (sh / 100) * 21 / 60;
    out('co-n', n + ' times'); out('co-min', cm + (cm === 1 ? ' minute' : ' minutes')); out('co-share', share(sh)); out('co-rate', money(cr));
    res('co-hours', hours(ch)); res('co-value', money(ch * cr));
  }
  Object.keys(inputs).forEach(function (k) { inputs[k].addEventListener('input', worth); });

  /* ================================================================
     The bar knows which world it is over.
     ================================================================ */
  var bar = document.querySelector('.bar');
  var desks = Array.prototype.slice.call(document.querySelectorAll('.peak, .worth, .faq'));
  function onScroll() {
    bar.classList.toggle('is-scrolled', scrollY > 8);
    var y = 32, over = desks.some(function (s) { var r = s.getBoundingClientRect(); return r.top <= y && r.bottom > y; });
    bar.classList.toggle('is-desk', over);
    renderDemo();
  }
  var ticking = false;
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; onScroll(); }); } }, { passive: true });
  addEventListener('resize', function () { placeThumb(); onScroll(); }, { passive: true });

  placeThumb(); wireButtons(); worth(); onScroll();
  requestAnimationFrame(function () { aud.classList.add('is-ready'); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeThumb);
})();
