/* Faro 33 · Pixel + Conversions API con el mismo event_id (Meta deduplica).
   f33Track(nombre, params): dispara el pixel y, si el Worker está configurado, envía el mismo evento a Meta.
   f33SetUserData(correo, teléfono): guarda hashes SHA-256 para advanced matching. */
(function(){
  // URL del Worker desplegado (workers/meta-capi). Vacío = solo pixel, sin envío desde servidor.
  var CAPI_ENDPOINT = '';
  var PIXEL_ID = '883854600914341';
  var HOST_OK = /^(www\.)?faro33studio\.com$/.test(location.hostname);
  var userHash = {};

  function consented(){
    try {
      var c = JSON.parse(localStorage.getItem('f33-consent') || 'null');
      return !(c && c.c === 'no' && Date.now() - c.t < 31536e6);
    } catch (e) { return false; }
  }
  function cookie(name){
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : undefined;
  }
  function newId(){
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
  }
  async function sha256(text){
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), function(b){ return b.toString(16).padStart(2, '0'); }).join('');
  }

  window.f33Track = function(name, params){
    if (!HOST_OK || !consented() || typeof fbq !== 'function') return;
    var id = newId();
    try { fbq('track', name, params || {}, { eventID: id }); } catch (e) {}
    if (!CAPI_ENDPOINT) return;
    var body = {
      event_name: name,
      event_id: id,
      url: location.href,
      content_name: params && params.content_name,
      content_category: params && params.content_category,
      user_data: Object.assign({ fbp: cookie('_fbp'), fbc: cookie('_fbc') }, userHash)
    };
    try {
      fetch(CAPI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true
      }).catch(function(){});
    } catch (e) {}
  };

  window.f33SetUserData = async function(email, phone){
    if (!HOST_OK || !consented() || typeof fbq !== 'function' || !(window.crypto && crypto.subtle)) return;
    var um = {};
    var e = (email || '').trim().toLowerCase();
    if (e) um.em = await sha256(e);
    var p = (phone || '').replace(/\D/g, '');
    if (p.length === 10) p = '52' + p; // número nacional de México → con código de país
    if (p) um.ph = await sha256(p);
    if (um.em || um.ph) {
      userHash = um;
      fbq('init', PIXEL_ID, um);
    }
  };
})();
