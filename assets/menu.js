/* Faro 33 — menú lateral universal.
   ÚNICA fuente de verdad de la navegación entre páginas.
   Para agregar un servicio/página: editar los arrays MENU de abajo. */
(function () {
  'use strict';

  var MENU = {
    especialidades: [
      ['Interiorismo integral', '/#servicios'],
      ['Cocinas a la medida', '/cocinas/'],
      ['Centros de entretenimiento', '/centros-de-entretenimiento/'],
      ['Acabados de pared', '/acabados-de-pared/'],
      ['Muros para negocios', '/acabados-de-pared/#negocios']
    ],
    proyectos: [
      ['Un rincón cerca del cielo', '/un-rincon-cerca-del-cielo/'],
      ['Casa en la colina', '/casa-en-la-colina/'],
      ['Casa Quintas', '/casa-quintas/'],
      ['Un pedacito de cielo', '/un-pedacito-de-cielo/']
    ],
    estudio: [
      ['Sobre nosotros', '/nosotros/'],
      ['Proceso', '/#proceso'],
      ['Preguntas frecuentes', '/#faq']
    ]
  };
  var WA = 'https://wa.me/526675402559?text=' + encodeURIComponent('Hola Faro 33, me interesa un proyecto. ¿Podemos platicar?');

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- estilos ---------- */
  var css = ''
    + '.f33m-btn{display:inline-flex;align-items:center;gap:10px;background:none;border:1px solid rgba(255,255,255,0.45);border-radius:2px;color:#fff;cursor:pointer;padding:10px 16px;font-family:var(--font-ui,sans-serif);font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;transition:background .15s ease,border-color .15s ease}'
    + '.f33m-btn:hover{background:rgba(255,255,255,0.1);border-color:#fff}'
    + '.f33m-btn .ic{display:inline-flex;flex-direction:column;gap:4px}'
    + '.f33m-btn .ic i{display:block;width:16px;height:1.5px;background:currentColor;transition:transform .2s ease}'
    + '@media (max-width:560px){.f33m-btn .tx{display:none}.f33m-btn{padding:10px 12px}}'
    + '.f33m-backdrop{position:fixed;inset:0;z-index:190;background:rgba(10,27,54,0.55);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .35s ease}'
    + '.f33m-open .f33m-backdrop{opacity:1;pointer-events:auto}'
    + '.f33m-panel{position:fixed;top:0;right:0;bottom:0;z-index:200;width:min(440px,100vw);background:#0A1B36;color:#fff;transform:translateX(102%);transition:transform .45s cubic-bezier(.2,.7,.2,1);display:flex;flex-direction:column;overflow-y:auto;overscroll-behavior:contain;box-shadow:-24px 0 60px rgba(0,0,0,0.35)}'
    + '.f33m-open .f33m-panel{transform:none}'
    + '.f33m-head{display:flex;align-items:center;justify-content:space-between;padding:22px clamp(24px,6vw,40px);border-bottom:1px solid rgba(255,255,255,0.12)}'
    + '.f33m-head .mark{display:flex;align-items:center;gap:12px;font-family:var(--font-display,serif);font-weight:700;font-size:15px;letter-spacing:0.08em;color:#fff;text-decoration:none}'
    + '.f33m-head .mark img{width:34px;height:34px;border-radius:50%;background:#fff;padding:2px}'
    + '.f33m-close{background:none;border:0;color:rgba(255,255,255,0.7);font-size:26px;line-height:1;cursor:pointer;padding:8px;transition:color .15s}'
    + '.f33m-close:hover{color:#fff}'
    + '.f33m-body{padding:clamp(20px,4vh,34px) clamp(24px,6vw,40px) 28px;flex:1}'
    + '.f33m-sec{margin-bottom:clamp(22px,4vh,34px)}'
    + '.f33m-lbl{font-family:var(--font-ui,sans-serif);font-size:10px;font-weight:600;letter-spacing:0.3em;text-transform:uppercase;color:#E2C99A;display:flex;align-items:center;gap:14px;margin-bottom:14px}'
    + '.f33m-lbl::after{content:"";flex:1;height:1px;background:rgba(226,201,154,0.25)}'
    + '.f33m-sec a{display:block;font-family:var(--font-display,serif);font-weight:400;font-size:clamp(20px,2.6vh,24px);line-height:1.25;color:rgba(255,255,255,0.92);text-decoration:none;padding:7px 0;transition:color .15s ease,transform .25s cubic-bezier(.2,.7,.2,1)}'
    + '.f33m-sec a:hover{color:#E2C99A;transform:translateX(6px)}'
    + '.f33m-sec a.on{color:#E2C99A;font-style:italic}'
    + '.f33m-foot{padding:22px clamp(24px,6vw,40px) 30px;border-top:1px solid rgba(255,255,255,0.12)}'
    + '.f33m-wa{display:flex;align-items:center;justify-content:center;gap:10px;background:#E2C99A;color:#0E2547;text-decoration:none;font-family:var(--font-ui,sans-serif);font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;padding:15px 20px;border-radius:2px;margin-bottom:18px;transition:background .15s}'
    + '.f33m-wa:hover{background:#fff}'
    + '.f33m-meta{font-family:var(--font-ui,sans-serif);font-size:10.5px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.5);line-height:2}'
    + '.f33m-meta a{color:rgba(255,255,255,0.75);text-decoration:none}'
    + '.f33m-meta a:hover{color:#fff}'
    + (reduce ? '.f33m-panel,.f33m-backdrop,.f33m-sec a{transition:none !important}' : '');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------- marcado del panel ---------- */
  function sec(label, items) {
    var here = location.pathname.replace(/\/+$/, '/') || '/';
    return '<div class="f33m-sec"><div class="f33m-lbl">' + label + '</div>'
      + items.map(function (it) {
        var on = it[1].indexOf('#') === -1 && it[1] === here ? ' class="on" aria-current="page"' : '';
        return '<a href="' + it[1] + '"' + on + '>' + it[0] + '</a>';
      }).join('') + '</div>';
  }
  var wrap = document.createElement('div');
  wrap.innerHTML = ''
    + '<div class="f33m-backdrop" data-f33m-close></div>'
    + '<aside class="f33m-panel" role="dialog" aria-modal="true" aria-label="Menú del sitio">'
    + '<div class="f33m-head"><a class="mark" href="/"><img src="/assets/home/862c0a89-3f54-4e63-bcd4-bb3571cd906b.png" alt="">FARO 33</a>'
    + '<button class="f33m-close" data-f33m-close aria-label="Cerrar menú">×</button></div>'
    + '<div class="f33m-body">'
    + sec('Especialidades', MENU.especialidades)
    + sec('Proyectos', MENU.proyectos)
    + sec('Estudio', MENU.estudio)
    + '</div>'
    + '<div class="f33m-foot">'
    + '<a class="f33m-wa" href="' + WA + '" target="_blank" rel="noopener">Iniciar proyecto por WhatsApp</a>'
    + '<div class="f33m-meta">Blv. Pedro María Anaya 1142-E · Culiacán<br>'
    + '<a href="https://www.instagram.com/faro_33studio/" target="_blank" rel="noopener">Instagram</a> · '
    + '<a href="https://www.facebook.com/faro33studio" target="_blank" rel="noopener">Facebook</a> · '
    + '<a href="mailto:faro33studio@gmail.com">Correo</a></div>'
    + '</div></aside>';
  document.body.appendChild(wrap);

  var panel = wrap.querySelector('.f33m-panel');
  var lastFocus = null;

  function setOpen(open) {
    document.documentElement.classList.toggle('f33m-open', open);
    document.documentElement.style.overflow = open ? 'hidden' : '';
    btns.forEach(function (b) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    if (open) { lastFocus = document.activeElement; wrap.querySelector('.f33m-close').focus(); }
    else if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
  }
  wrap.addEventListener('click', function (e) {
    if (e.target.closest('[data-f33m-close]')) setOpen(false);
    var a = e.target.closest('a[href^="#"], a[href^="/#"]');
    if (a) setOpen(false); /* anclas en la misma página */
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.documentElement.classList.contains('f33m-open')) setOpen(false);
  });

  /* ---------- botón "Menú" en el header de cada página ---------- */
  function makeBtn() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'f33m-btn';
    b.setAttribute('aria-label', 'Abrir menú');
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = '<span class="ic" aria-hidden="true"><i></i><i></i></span><span class="tx">Menú</span>';
    b.addEventListener('click', function () { setOpen(true); });
    return b;
  }
  var btns = [];
  function mount() {
    var b = makeBtn();
    var hdrNav = document.querySelector('.hdr-nav');            /* home */
    var back = document.querySelector('.nav .back, .top .back'); /* páginas internas */
    if (hdrNav) { hdrNav.appendChild(b); }
    else if (back) {
      var group = document.createElement('div');
      group.style.cssText = 'display:flex;align-items:center;gap:16px';
      back.parentNode.insertBefore(group, back);
      group.appendChild(back); group.appendChild(b);
    } else {
      b.style.cssText += ';position:fixed;top:18px;right:18px;z-index:120;background:rgba(10,27,54,0.6);backdrop-filter:blur(8px)';
      document.body.appendChild(b);
    }
    btns.push(b);
  }
  mount();
})();
