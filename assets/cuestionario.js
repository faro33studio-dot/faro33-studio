/* Faro 33 — motor de formularios declarativos. */
(function () {
  'use strict';

  function presente(valor) {
    if (Array.isArray(valor)) return valor.length > 0;
    if (typeof valor === 'string') return valor.trim() !== '';
    return valor === true;
  }

  function cumple(condicion, activas) {
    if (!condicion) return true;
    if (!activas.has(condicion.campo)) return false;
    const valor = activas.get(condicion.campo);
    if (condicion.presente === true) return presente(valor);
    if ('contiene' in condicion) return Array.isArray(valor) && valor.includes(condicion.contiene);
    const valores = Array.isArray(valor) ? valor : [valor];
    const esperados = condicion.en || [condicion.igual];
    return valores.some(item => esperados.includes(item));
  }

  // Las condiciones sólo pueden leer campos anteriores que sigan visibles.
  function evaluar(schema, leer) {
    const secciones = new Set();
    const activas = new Map();
    schema.secciones.forEach(seccion => {
      if (!cumple(seccion.mostrarSi, activas)) return;
      secciones.add(seccion.id);
      seccion.campos.forEach(campo => {
        if (cumple(campo.mostrarSi, activas)) activas.set(campo.id, leer(campo));
      });
    });
    return { secciones, activas };
  }

  const desdeRespuestas = (schema, respuestas) =>
    evaluar(schema, campo => Object.prototype.hasOwnProperty.call(respuestas, campo.id)
      ? respuestas[campo.id] : undefined);

  function visibles(schema, respuestas) {
    return new Set(desdeRespuestas(schema, respuestas).activas.keys());
  }

  function limpiar(schema, respuestas) {
    const limpias = {};
    visibles(schema, respuestas).forEach(id => {
      if (!Object.prototype.hasOwnProperty.call(respuestas, id)) return;
      const valor = respuestas[id];
      Object.defineProperty(limpias, id, {
        value: Array.isArray(valor) ? valor.slice() : valor,
        enumerable: true, writable: true, configurable: true
      });
    });
    return limpias;
  }

  function payload(schema, respuestas) {
    const datos = limpiar(schema, respuestas);
    Object.keys(datos).forEach(id => {
      if (!presente(datos[id])) delete datos[id];
      else if (typeof datos[id] === 'string') datos[id] = datos[id].trim();
    });
    return datos;
  }

  function validar(schema, respuestas) {
    const { activas } = desdeRespuestas(schema, respuestas);
    const errores = new Map();
    schema.secciones.forEach(seccion => seccion.campos.forEach(campo => {
      const { id, tipo, requerido, max, maxSeleccion } = campo;
      if (!activas.has(id)) return;
      const valor = activas.get(id);
      if (!presente(valor)) {
        if (requerido) errores.set(id, tipo === 'consent'
          ? 'Marca la casilla para aceptar el aviso de privacidad.'
          : 'Responde esta pregunta.');
        return;
      }
      if (tipo === 'checkbox' && maxSeleccion && Array.isArray(valor) && valor.length > maxSeleccion) {
        errores.set(id, 'Elige hasta ' + maxSeleccion + ' opciones.');
      } else if (typeof valor === 'string' && max && valor.length > max) {
        errores.set(id, 'Escribe máximo ' + max + ' caracteres.');
      } else if (tipo === 'tel' && !/^\d{10,}$/.test(valor.replace(/[\s()-]/g, '').replace(/^\+52/, ''))) {
        errores.set(id, 'Escribe un teléfono con al menos 10 dígitos.');
      } else if (tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim())) {
        errores.set(id, 'Escribe un correo válido, por ejemplo, nombre@ejemplo.mx.');
      }
    }));
    return errores;
  }

  function elemento(tag, clase, texto) {
    const nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto) nodo.textContent = texto;
    return nodo;
  }

  function textoConsentimiento(etiqueta, enlace) {
    const texto = elemento('span', 'q-choice-text', etiqueta);
    if (!enlace) return texto;
    const posicion = etiqueta.indexOf(enlace.texto);
    const link = elemento('a', '', enlace.texto);
    link.href = enlace.href;
    link.target = '_blank';
    link.rel = 'noopener';
    if (posicion === -1) {
      texto.append(' ', link);
    } else {
      texto.textContent = etiqueta.slice(0, posicion);
      texto.append(link, etiqueta.slice(posicion + enlace.texto.length));
    }
    return texto;
  }

  function renderCampo(campo, prefijo) {
    const id = prefijo + campo.id;
    const grupo = campo.tipo === 'radio' || campo.tipo === 'checkbox';
    const caja = elemento(grupo ? 'fieldset' : 'div', 'q-field');
    caja.dataset.type = campo.tipo;
    caja.hidden = true;
    const controles = [];
    const error = elemento('p', 'q-error');
    error.id = id + '-error';
    error.setAttribute('aria-live', 'polite');
    const limite = campo.maxSeleccion ? 'Elige hasta ' + campo.maxSeleccion : '';
    const textoAyuda = [campo.ayuda, limite].filter(Boolean).join(' · ');
    const ayuda = elemento('p', 'q-help', textoAyuda);
    ayuda.id = id + '-help';
    const descripcion = [textoAyuda && ayuda.id, error.id].filter(Boolean).join(' ');

    if (grupo) {
      // Si la etiqueta ya incluye el límite, se presenta una sola vez en la ayuda.
      const sufijo = ' (' + limite.toLowerCase() + ')';
      const etiqueta = limite && campo.etiqueta.toLowerCase().endsWith(sufijo)
        ? campo.etiqueta.slice(0, -sufijo.length) : campo.etiqueta;
      const leyenda = elemento('legend', 'q-label', etiqueta);
      caja.append(leyenda);
      if (textoAyuda) caja.append(ayuda);
      const opciones = elemento('div', 'q-options');
      campo.opciones.forEach((opcion, indice) => {
        const tarjeta = elemento('label', 'q-choice');
        const input = elemento('input');
        input.type = campo.tipo;
        input.value = opcion.valor;
        input.checked = campo.tipo === 'checkbox'
          ? Array.isArray(campo.valorInicial) && campo.valorInicial.includes(opcion.valor)
          : campo.valorInicial === opcion.valor;
        const texto = elemento('span', 'q-choice-text');
        texto.append(elemento('span', '', opcion.etiqueta));
        let descripcionOpcion = descripcion;
        if (opcion.ayuda) {
          const nota = elemento('span', 'q-help', opcion.ayuda);
          nota.id = id + '-opcion-' + indice;
          texto.append(nota);
          descripcionOpcion += ' ' + nota.id;
          input.setAttribute('aria-labelledby', nota.id + '-etiqueta');
          texto.firstChild.id = nota.id + '-etiqueta';
        }
        input.setAttribute('aria-describedby', descripcionOpcion);
        controles.push(input);
        tarjeta.append(input, texto);
        opciones.append(tarjeta);
      });
      caja.append(opciones);
    } else {
      const consentimiento = campo.tipo === 'consent';
      const label = elemento('label', consentimiento ? 'q-choice' : 'q-label');
      label.htmlFor = id;
      const control = elemento(['select', 'textarea'].includes(campo.tipo) ? campo.tipo : 'input');
      control.id = id;
      control.setAttribute('aria-describedby', descripcion);
      if (consentimiento) {
        control.type = 'checkbox';
        control.checked = campo.valorInicial === true;
        label.append(control, textoConsentimiento(campo.etiqueta, campo.enlace));
        caja.append(label);
      } else {
        if (campo.tipo === 'select') {
          const inicial = elemento('option', '', 'Selecciona una opción');
          inicial.value = '';
          caja.append(label);
          control.append(inicial);
          campo.opciones.forEach(opcion => {
            const item = elemento('option', '', opcion.etiqueta);
            item.value = opcion.valor;
            control.append(item);
          });
        } else if (control.tagName === 'INPUT') {
          control.type = campo.tipo;
        }
        label.textContent = campo.etiqueta;
        control.value = campo.valorInicial || '';
        if (campo.max && campo.tipo !== 'select') control.maxLength = campo.max;
        if (campo.autocompletar) control.setAttribute('autocomplete', campo.autocompletar);
        caja.append(label, control);
      }
      if (campo.ayuda) caja.append(ayuda);
      controles.push(control);
    }

    controles.forEach(control => {
      control.name = id;
      if (campo.requerido && campo.tipo !== 'checkbox') control.required = true;
    });
    if (campo.requerido && campo.tipo === 'checkbox') {
      const indicacion = elemento('span', 'q-sr', ' (elige al menos una opción)');
      caja.querySelector('legend').append(indicacion);
    }
    caja.append(error);
    return { caja, controles, error, campo };
  }

  function leerCampo({ campo, controles }) {
    if (campo.tipo === 'checkbox') return controles.filter(control => control.checked).map(control => control.value);
    if (campo.tipo === 'radio') {
      const marcado = controles.find(control => control.checked);
      return marcado ? marcado.value : '';
    }
    return campo.tipo === 'consent' ? controles[0].checked : controles[0].value;
  }

  function limpiarCampo({ controles }) {
    controles.forEach(control => {
      if (control.type === 'checkbox' || control.type === 'radio') control.checked = false;
      else control.value = '';
    });
  }

  function mostrarError({ controles, error }, mensaje) {
    if (error.textContent !== mensaje) error.textContent = mensaje;
    controles.forEach(control => {
      if (mensaje) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    });
  }

  function animarVisibilidad(nodo, visible, animaciones, sinMovimiento) {
    const previa = animaciones.get(nodo);
    if (previa) {
      previa.cancel();
      animaciones.delete(nodo);
    }
    nodo.toggleAttribute('inert', !visible);
    if (visible) nodo.removeAttribute('aria-hidden');
    else nodo.setAttribute('aria-hidden', 'true');
    if (sinMovimiento || typeof nodo.animate !== 'function') {
      nodo.hidden = !visible;
      return;
    }
    nodo.hidden = false;
    const fuera = { opacity: 0, transform: 'translateY(6px)' };
    const dentro = { opacity: 1, transform: 'translateY(0)' };
    const animacion = nodo.animate(visible ? [fuera, dentro] : [dentro, fuera], {
      duration: 180, easing: 'ease-out'
    });
    animaciones.set(nodo, animacion);
    animacion.onfinish = () => {
      nodo.hidden = !visible;
      animaciones.delete(nodo);
    };
  }

  let apiTurnstile;
  function cargarTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!apiTurnstile) {
      apiTurnstile = new Promise((resolve, reject) => {
        const script = elemento('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = () => window.turnstile ? resolve(window.turnstile) : reject();
        script.onerror = () => {
          script.remove();
          reject();
        };
        document.head.append(script);
      }).catch(error => {
        apiTurnstile = null;
        throw error;
      });
    }
    return apiTurnstile;
  }

  function prepararTurnstile(form, sitio) {
    const contenedor = form.querySelector('[data-form-turnstile]');
    let api;
    let widget;
    let token = '';
    let inicio;

    function iniciar() {
      if (!sitio || inicio) return;
      inicio = cargarTurnstile().then(turnstile => {
        api = turnstile;
        const borrarToken = () => { token = ''; };
        widget = api.render(contenedor, {
          sitekey: sitio, size: 'compact', language: 'es',
          'response-field': false,
          callback: respuesta => { token = respuesta; },
          'expired-callback': borrarToken,
          'error-callback': borrarToken,
          'timeout-callback': borrarToken
        });
      }).catch(() => { inicio = null; });
    }

    if (sitio) form.addEventListener('focusin', iniciar, { once: true });
    return {
      token: () => token,
      iniciar,
      reiniciar() {
        token = '';
        if (widget !== undefined) api.reset(widget);
      }
    };
  }

  function generarFolio() {
    const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
    return 'F33-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), numero =>
      alfabeto[Math.floor(numero * alfabeto.length / 256)]).join('');
  }

  async function enviar(endpoint, datos) {
    const solicitud = new AbortController();
    const timeout = setTimeout(() => solicitud.abort(), 10000);
    try {
      const respuesta = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos), signal: solicitud.signal
      });
      if (!respuesta.ok) {
        const error = new Error('No se pudo enviar');
        error.estado = respuesta.status;
        throw error;
      }
      try { return await respuesta.json(); } catch (e) { return null; }
    } finally {
      clearTimeout(timeout);
    }
  }

  async function montar(form, config = {}) {
    const respuesta = await fetch(form.dataset.schema, { mode: 'same-origin' });
    if (!respuesta.ok) throw new Error('No se pudo cargar el formulario');
    const schema = await respuesta.json();
    const campos = new Map();
    const secciones = new Map();
    const cuerpo = form.querySelector('[data-form-fields]');
    const acciones = form.querySelector('[data-form-actions]');
    const boton = form.querySelector('[type="submit"]');
    const estado = form.querySelector('[data-form-status]');
    const respaldo = form.querySelector('[data-form-fallback]');
    const trampa = form.elements.sitio_web;
    const endpoint = (config.endpoint || '').trim();
    const mock = !endpoint || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const sitio = mock ? '' : (config.turnstileSiteKey || '').trim();
    const verificacion = prepararTurnstile(form, sitio);
    const animaciones = new WeakMap();
    const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)');
    const etiquetaBoton = boton.textContent;
    let activas = new Set();
    let visiblesAntes = new Set();
    let intento = false;
    let enviando = false;
    let terminado = false;
    let folio;

    schema.secciones.forEach((seccion, indice) => {
      const caja = elemento('section', 'q-section');
      const titulo = elemento('h2', 'q-section-title', seccion.titulo);
      titulo.id = form.id + '-seccion-' + indice;
      caja.setAttribute('aria-labelledby', titulo.id);
      caja.hidden = true;
      if (indice === 0) caja.classList.add('q-section-first');
      caja.append(titulo);
      if (seccion.id === 'diseno') caja.classList.add('q-section-style');
      if (seccion.descripcion) {
        const descripcion = elemento('p', 'q-section-description', seccion.descripcion);
        descripcion.id = titulo.id + '-descripcion';
        caja.setAttribute('aria-describedby', descripcion.id);
        caja.append(descripcion);
      }
      seccion.campos.forEach(campo => {
        const vista = renderCampo(campo, form.id + '-');
        caja.append(vista.caja);
        campos.set(campo.id, vista);
      });
      secciones.set(seccion.id, caja);
      cuerpo.append(caja);
    });

    function actualizar(animar) {
      const vista = evaluar(schema, campo => leerCampo(campos.get(campo.id)));
      const sinMovimiento = !animar || movimientoReducido.matches;

      // Al salir de una rama se borra su estado en el DOM y se excluye del envío.
      schema.secciones.forEach(seccion => {
        const visible = vista.secciones.has(seccion.id);
        const antes = visiblesAntes.has(seccion.id);
        if (visible !== antes) animarVisibilidad(secciones.get(seccion.id), visible, animaciones, sinMovimiento);
        seccion.campos.forEach(campo => {
          const campoVista = campos.get(campo.id);
          const activo = vista.activas.has(campo.id);
          const activoAntes = activas.has(campo.id);
          const limiteAlcanzado = activo && campo.tipo === 'checkbox' &&
            vista.activas.get(campo.id).length >= campo.maxSeleccion;
          campoVista.controles.forEach(control => {
            control.disabled = !activo || (limiteAlcanzado && !control.checked);
          });
          if (!activo && activoAntes) {
            limpiarCampo(campoVista);
            mostrarError(campoVista, '');
          }
          // Si toda la sección sale, su animación también cubre los campos.
          if (visible && (!antes || activo !== activoAntes)) {
            animarVisibilidad(campoVista.caja, activo, animaciones, sinMovimiento || !antes);
          }
        });
      });
      activas = new Set(vista.activas.keys());
      visiblesAntes = vista.secciones;
      acciones.hidden = !!form.dataset.showAfter && !presente(vista.activas.get(form.dataset.showAfter));
      const respuestas = Object.create(null);
      vista.activas.forEach((valor, id) => { respuestas[id] = valor; });
      return respuestas;
    }

    function revisar(respuestas) {
      const errores = validar(schema, respuestas);
      activas.forEach(id => mostrarError(campos.get(id), errores.get(id) || ''));
      return errores;
    }

    form.addEventListener('input', () => {
      const respuestas = actualizar(true);
      if (intento) revisar(respuestas);
    });

    form.addEventListener('submit', async evento => {
      evento.preventDefault();
      if (enviando || terminado) return;
      const fingido = !!trampa.value;
      let respuestas = {};
      if (!fingido) {
        const actuales = actualizar(false);
        intento = true;
        const errores = revisar(actuales);
        if (errores.size) {
          campos.get(errores.keys().next().value).controles.find(control => !control.disabled)?.focus();
          return;
        }
        if (sitio && !verificacion.token()) {
          verificacion.iniciar();
          estado.textContent = 'Completa la verificación de seguridad e intenta enviar de nuevo.';
          return;
        }
        respuestas = payload(schema, actuales);
      }

      if (!folio) folio = generarFolio();
      const datos = {
        formulario: schema.id, version: schema.version, folio, respuestas,
        meta: config.meta ? config.meta() : { pagina: location.pathname },
        turnstile: verificacion.token()
      };
      enviando = true;
      cuerpo.disabled = true;
      boton.disabled = true;
      boton.textContent = 'Enviando…';
      estado.textContent = 'Enviando tu cuestionario…';
      respaldo.hidden = true;
      try {
        if (mock || fingido) {
          await new Promise(resolve => setTimeout(resolve, 600));
          if (!fingido) console.info('[MOCK cuestionario]', datos);
        } else {
          const confirmacion = await enviar(endpoint, datos);
          // El servidor es la fuente de verdad del folio (idempotente por folio).
          if (confirmacion && typeof confirmacion.folio === 'string' && /^F33-[A-Z2-9]{6}$/.test(confirmacion.folio)) {
            folio = confirmacion.folio;
            datos.folio = folio;
          }
        }
      } catch (error) {
        estado.textContent = error && error.estado === 429
          ? 'Recibimos varios envíos desde tu conexión. Intenta más tarde o escríbenos por WhatsApp.'
          : error && error.estado === 422
            ? 'Revisa tus respuestas: alguna no se pudo validar. Si el problema sigue, escríbenos por WhatsApp.'
            : 'No pudimos enviar tu cuestionario. Intenta de nuevo o escríbenos por WhatsApp.';
        respaldo.hidden = false;
        verificacion.reiniciar();
        return;
      } finally {
        enviando = false;
        cuerpo.disabled = false;
        boton.disabled = false;
        boton.textContent = etiquetaBoton;
      }
      terminado = true;
      estado.textContent = '';
      campos.forEach(limpiarCampo);
      trampa.value = '';
      form.hidden = true;
      if (config.alEnviar) config.alEnviar({ datos, mock, fingido });
    });

    actualizar(false);
    return { schema, mock };
  }

  const Cuestionario = { visibles, limpiar, payload, validar, montar };
  if (typeof module !== 'undefined' && module.exports) module.exports = Cuestionario;
  if (typeof window !== 'undefined') window.Cuestionario = Cuestionario;
})();
