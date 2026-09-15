/* ==========================================================================
   La Positiva - la nota de la mesa: grabarla y las frases de siempre
   Sin dependencias fuera de app.js. Se carga con "defer", despues de app.js.
   ==========================================================================

   Dos cosas viven aca porque son la misma cosa para el mozo: llenar el campo
   "algo que dijo la mesa" sin tener que tipearlo parado al lado de la mesa.

     LP_VOZ    la grabadora con sus tres capas
     LP_NOTAS  los botones de lo que se repite todos los dias

   ---------------------------------------------------------------------------
   LAS TRES CAPAS Y POR QUE ESTAN SEPARADAS

     1. EL AUDIO           lo que realmente se dijo. Es la unica prueba.
     2. LA TRANSCRIPCION   el texto crudo, sin tocar, tal como salio.
     3. EL RESUMEN         lo limpio, lo que le sirve al cocinero.

   Las tres se ven, las tres por separado, y en ese orden de confianza. El
   resumen es el unico que puede faltar: si no hay clave de Gemini, si Gemini
   no contesta o si tarda, las capas 1 y 2 YA ESTAN GUARDADAS y la comanda
   sale igual. De esto depende lo que se cocina: no se puede perder.

   Y el resumen NUNCA se manda solo. Cae en un campo que el mozo lee y
   corrige antes de tocar "Usar esta nota". Una maquina no manda nada a la
   cocina por su cuenta.

   ---------------------------------------------------------------------------
   POR QUE EL AUDIO SE GRABA SIEMPRE Y EL DICTADO ES UN AGREGADO

   El celular tiene su propio dictado (SpeechRecognition). Es gratis e
   instantaneo, pero anda distinto en cada telefono: parcial en todos lados,
   apagado en Firefox, y manda el audio a los servidores del navegador igual.
   Con dos mozos y dos telefonos distintos, eso son dos comportamientos
   distintos para explicar.

   Asi que el que manda es MediaRecorder: graba el audio, el audio va a
   Gemini y de ahi salen la transcripcion y el resumen, iguales en Android y
   en iPhone. El dictado del celular corre al lado, callado, y sirve para dos
   cosas: que el mozo VEA las palabras mientras habla -saber que esta
   andando- y que hoy, sin clave de Gemini, igual haya texto.

   Los dos abren el microfono a la vez y en algun Android compiten. Por eso
   el orden importa: primero arranca la grabacion, que es la que no puede
   fallar, y recien despues el dictado, envuelto en try. Si el dictado
   revienta, no se entera nadie.                                            */
(function (global) {
  'use strict';

  var LP = global.LP;
  if (!LP) return;                 // sin app.js esto no tiene nada que hacer
  var esc = LP.esc;

  /* --- Que puede hacer este celular --------------------------------------- */

  function hayGrabadora() {
    return !!(global.MediaRecorder && global.navigator &&
              global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia);
  }

  function ReconocedorDelCelular() {
    return global.SpeechRecognition || global.webkitSpeechRecognition || null;
  }

  /* El formato se le PREGUNTA al navegador, nunca se adivina por el user
     agent: Safari cambio de opinion dos veces sobre WebM entre 2021 y 2025.
     Si ninguno pega, no se pasa mimeType y decide el navegador; pasar una
     cadena vacia tira error. */
  var FORMATOS = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/aac'
  ];

  function formatoElegido() {
    if (!global.MediaRecorder || !global.MediaRecorder.isTypeSupported) return '';
    for (var i = 0; i < FORMATOS.length; i++) {
      try { if (global.MediaRecorder.isTypeSupported(FORMATOS[i])) return FORMATOS[i]; }
      catch (e) {}
    }
    return '';
  }

  function soportado() {
    return { grabar: hayGrabadora(), dictar: !!ReconocedorDelCelular() };
  }

  /* Tope duro. Un mozo parado en la mesa no dicta un minuto y medio, y el
     tope es a la vez el freno del gasto: a 32 tokens por segundo, 90
     segundos son 2.880 tokens de audio y nada mas. */
  var TOPE_SEGUNDOS = 90;

  function reloj(seg) {
    var m = Math.floor(seg / 60), s = Math.floor(seg % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* --- La hoja ------------------------------------------------------------ */

  var hoja = null, cuerpo = null, tituloEl = null, subEl = null;
  var opciones = null;          // lo que pidio la pantalla que abrio la hoja
  var estado = 'idle';
  var grabadora = null, pista = null, pedazos = [], arranque = 0, tic = null;
  var reconocedor = null, dictadoFirme = '', dictadoAlVuelo = '';
  var blobAudio = null, urlAudio = null, segundos = 0;
  var filaVoz = null, idsUsados = [];
  var estadoResumen = null;     // { motivo, error, modelo }

  function estilos() {
    if (document.getElementById('voz-css')) return;
    var st = document.createElement('style');
    st.id = 'voz-css';
    st.textContent = [
      '.voz-hoja .hs-cuerpo{padding-bottom:4px}',
      '.voz-centro{text-align:center;padding:10px 0 4px}',
      '.voz-boton{',
      '  width:112px;height:112px;border-radius:50%;border:none;cursor:pointer;',
      '  background:var(--accent);color:#fff;font:inherit;font-size:15px;font-weight:500;',
      '  display:inline-flex;flex-direction:column;align-items:center;justify-content:center;',
      '  gap:4px;box-shadow:0 4px 16px rgba(20,16,14,.18);',
      '}',
      '.voz-boton:disabled{opacity:.55;cursor:default}',
      '.voz-boton .mic{font-size:34px;line-height:1}',
      '.voz-boton.rec{background:var(--err-ink,#a4232a);animation:vozLatido 1.4s ease-in-out infinite}',
      '@keyframes vozLatido{0%,100%{box-shadow:0 0 0 0 rgba(164,35,42,.45)}',
      '  50%{box-shadow:0 0 0 14px rgba(164,35,42,0)}}',
      '@media (prefers-reduced-motion:reduce){.voz-boton.rec{animation:none}}',
      '.voz-tiempo{font-size:30px;font-variant-numeric:tabular-nums;margin:12px 0 2px;font-weight:500}',
      '.voz-pie{color:var(--muted);font-size:14px;line-height:1.5;margin:0}',
      '.voz-capa{margin-top:16px}',
      '.voz-capa > b{',
      '  display:block;font-family:var(--font-cuerpo);font-size:12px;letter-spacing:.09em;',
      '  text-transform:uppercase;font-weight:600;color:var(--muted-strong);margin-bottom:6px;',
      '}',
      '.voz-capa .ayuda{color:var(--muted);font-size:13px;line-height:1.5;margin:0 0 7px}',
      '.voz-capa audio{width:100%;min-height:40px}',
      '.voz-crudo{',
      '  background:var(--bg);border:1px solid var(--border);border-radius:var(--r-md);',
      '  padding:11px 13px;font-size:15px;line-height:1.55;color:var(--muted-strong);',
      '  white-space:pre-wrap;word-break:break-word;max-height:150px;overflow:auto;margin:0;',
      '}',
      '.voz-crudo.vacio{color:var(--muted);font-style:italic}',
      '.voz-capa textarea{',
      '  width:100%;min-height:96px;padding:11px 13px;font:inherit;font-size:16px;',
      '  line-height:1.5;border:2px solid var(--accent);border-radius:var(--r-md);',
      '  background:#fff;color:var(--ink);resize:vertical;',
      '}',
      '.voz-capa textarea:focus{outline:2px solid var(--accent);outline-offset:1px}',
      '.voz-chapa{',
      '  display:inline-block;font-size:12px;font-weight:600;letter-spacing:.04em;',
      '  border-radius:var(--r-pill);padding:3px 9px;margin-left:7px;vertical-align:middle;',
      '}',
      '.voz-chapa.ok{background:var(--ok-bg);color:var(--ok)}',
      '.voz-chapa.flojo{background:var(--warn-bg);color:var(--warn)}',
      '.voz-chapa.no{background:var(--border);color:var(--muted-strong)}',
      '.voz-nota-off{',
      '  background:var(--warn-soft,#fdf3e3);border:1px solid var(--warn-border,#e5d0a8);',
      '  color:var(--warn,#8a5a13);border-radius:var(--r-md);padding:10px 12px;',
      '  font-size:14px;line-height:1.55;margin:0;',
      '}',
      '.voz-acciones{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}',
      '.voz-acciones .btn{flex:1 1 150px;min-height:var(--tap,48px)}',
      '.voz-menor{',
      '  background:none;border:none;color:var(--accent);font:inherit;font-size:14px;',
      '  cursor:pointer;padding:6px 0;text-decoration:underline;min-height:var(--tap,44px);',
      '}',
      /* ---- notas frecuentes ---- */
      '.nf-caja{margin-top:9px}',
      '.nf-tit{',
      '  font-family:var(--font-cuerpo);font-size:12px;letter-spacing:.08em;',
      '  text-transform:uppercase;font-weight:600;color:var(--muted-strong);',
      '  margin:0 0 7px;display:block;',
      '}',
      '.nf-lista{display:flex;flex-wrap:wrap;gap:7px}',
      '.nf-chip{',
      '  border:1px solid var(--border-strong);background:var(--card);color:var(--ink);',
      '  border-radius:var(--r-pill);padding:0 14px;min-height:40px;font:inherit;font-size:15px;',
      '  cursor:pointer;display:inline-flex;align-items:center;gap:6px;',
      '}',
      '.nf-chip:active{background:var(--bg)}',
      '.nf-chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
      '.nf-chip.mas{border-style:dashed;color:var(--muted-strong)}',
      '.nf-chip .x{color:var(--err-ink,#a4232a);font-weight:700;font-size:17px;line-height:1}',
      '.nf-vacio{color:var(--muted);font-size:14px;margin:0}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function armarHoja() {
    if (hoja) return;
    estilos();
    hoja = document.createElement('div');
    hoja.className = 'hoja voz-hoja';
    hoja.id = 'hojaVoz';
    hoja.hidden = true;
    hoja.setAttribute('role', 'dialog');
    hoja.setAttribute('aria-modal', 'true');
    hoja.setAttribute('aria-labelledby', 'vozTit');
    hoja.innerHTML =
      '<div class="hs">' +
        '<div class="hs-top">' +
          '<div><b id="vozTit">Grabar la nota</b>' +
            '<span class="hs-sub" id="vozSub"></span></div>' +
          '<button type="button" class="icon-btn" id="vozX" aria-label="Cerrar">&times;</button>' +
        '</div>' +
        '<div class="hs-cuerpo" id="vozCuerpo"></div>' +
      '</div>';
    document.body.appendChild(hoja);
    cuerpo = hoja.querySelector('#vozCuerpo');
    tituloEl = hoja.querySelector('#vozTit');
    subEl = hoja.querySelector('#vozSub');

    hoja.querySelector('#vozX').addEventListener('click', cerrar);
    hoja.addEventListener('click', function (ev) { if (ev.target === hoja) cerrar(); });
    cuerpo.addEventListener('click', alTocar);
  }

  /* --- Grabar ------------------------------------------------------------- */

  function soltarMicrofono() {
    if (tic) { clearInterval(tic); tic = null; }
    try { if (grabadora && grabadora.state !== 'inactive') grabadora.stop(); } catch (e) {}
    grabadora = null;
    /* Soltar las pistas es lo que apaga la lucecita del microfono. Si esto no
       corre, el celular queda escuchando y el mozo lo ve. */
    try {
      if (pista) pista.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
    } catch (e) {}
    pista = null;
    try { if (reconocedor) { reconocedor.onend = null; reconocedor.stop(); } } catch (e) {}
    reconocedor = null;
  }

  function arrancarDictado() {
    var Rec = ReconocedorDelCelular();
    if (!Rec) return;
    try {
      reconocedor = new Rec();
      reconocedor.lang = 'es-AR';
      reconocedor.continuous = true;
      reconocedor.interimResults = true;
      reconocedor.onresult = function (ev) {
        var alVuelo = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) dictadoFirme += t; else alVuelo += t;
        }
        dictadoAlVuelo = alVuelo;
        var eco = cuerpo && cuerpo.querySelector('#vozEco');
        if (eco) eco.textContent = (dictadoFirme + dictadoAlVuelo).trim() ||
                                   'Te escucho...';
      };
      /* Cortar por silencio es el modo de falla clasico: se vuelve a
         arrancar sola mientras la grabacion siga viva. */
      reconocedor.onend = function () {
        if (estado !== 'grabando') return;
        try { reconocedor.start(); } catch (e) {}
      };
      reconocedor.onerror = function () {};
      reconocedor.start();
    } catch (e) { reconocedor = null; }
  }

  function grabar() {
    if (!hayGrabadora()) {
      LP.toast('Este celular no puede grabar desde el navegador.', 'err');
      return;
    }
    estado = 'pidiendo';
    pintar();
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      pista = s;
      pedazos = [];
      dictadoFirme = ''; dictadoAlVuelo = '';
      blobAudio = null; segundos = 0; filaVoz = null; estadoResumen = null;
      if (urlAudio) { try { URL.revokeObjectURL(urlAudio); } catch (e) {} urlAudio = null; }

      var formato = formatoElegido();
      try {
        grabadora = formato ? new MediaRecorder(s, { mimeType: formato })
                            : new MediaRecorder(s);
      } catch (e) {
        try { grabadora = new MediaRecorder(s); }
        catch (e2) { soltarMicrofono(); estado = 'idle'; pintar();
                     LP.toast('Este celular no dejó grabar.', 'err'); return; }
      }

      grabadora.ondataavailable = function (ev) {
        if (ev.data && ev.data.size) pedazos.push(ev.data);
      };
      grabadora.onerror = function () {
        LP.toast('Se cortó la grabación. Lo que se escuchó queda igual.', 'err');
        frenar();
      };
      grabadora.onstop = function () { alFrenar(); };

      grabadora.start();
      arranque = Date.now();
      estado = 'grabando';
      pintar();

      tic = setInterval(function () {
        var seg = (Date.now() - arranque) / 1000;
        var el = cuerpo && cuerpo.querySelector('#vozTiempo');
        if (el) el.textContent = reloj(seg);
        if (seg >= TOPE_SEGUNDOS) {
          LP.toast('Llegó al tope de minuto y medio. Se guarda lo grabado.', 'ok');
          frenar();
        }
      }, 250);

      /* El dictado va DESPUES y aparte: si pelea por el microfono, el que
         tiene que ganar es el que graba. */
      setTimeout(function () { if (estado === 'grabando') arrancarDictado(); }, 250);
    }, function (e) {
      estado = 'idle';
      pintar();
      var negado = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      LP.toast(negado
        ? 'El celular no dio permiso para el micrófono. Habilitalo y probá de nuevo.'
        : 'No pudimos abrir el micrófono.', 'err');
    });
  }

  function frenar() {
    if (estado !== 'grabando') return;
    segundos = Math.round(((Date.now() - arranque) / 1000) * 10) / 10;
    estado = 'procesando';
    pintar();
    if (tic) { clearInterval(tic); tic = null; }
    try { if (reconocedor) { reconocedor.onend = null; reconocedor.stop(); } } catch (e) {}
    reconocedor = null;
    try {
      if (grabadora && grabadora.state !== 'inactive') grabadora.stop();
      else alFrenar();
    } catch (e) { alFrenar(); }
  }

  /* Acá es donde se cumple la regla dura: PRIMERO se guarda lo que ya existe
     -el audio y la transcripcion cruda-, y RECIEN DESPUES se pide el resumen.
     Si de aca para abajo falla todo, el mozo ya tiene con que mandar la
     comanda.                                                              */
  function alFrenar() {
    var tipo = (grabadora && grabadora.mimeType) || formatoElegido() || 'audio/webm';
    try {
      if (pista) pista.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
    } catch (e) {}
    pista = null;
    grabadora = null;

    blobAudio = pedazos.length ? new Blob(pedazos, { type: tipo }) : null;
    if (blobAudio && blobAudio.size) {
      try { urlAudio = URL.createObjectURL(blobAudio); } catch (e) { urlAudio = null; }
    }
    var crudo = (dictadoFirme + ' ' + dictadoAlVuelo).replace(/\s+/g, ' ').trim();
    estado = 'revisar';
    estadoResumen = { motivo: 'pidiendo' };
    pintar(crudo, crudo);

    var sb = opciones && opciones.sb;

    /* Capa 1 + capa 2 a la base, sin esperar a nadie. */
    var guardado = LP.subirAudio(sb, blobAudio).then(function (sub) {
      return LP.guardarVoz(sb, {
        sesion_id: opciones.sesionId || null,
        mesa: opciones.mesa || null,
        autor: opciones.autor || null,
        destino: opciones.destino || 'comanda',
        pedido_id: opciones.pedidoId || null,
        audio_path: sub && sub.path, audio_url: sub && sub.url,
        audio_tipo: (sub && sub.tipo) || tipo,
        segundos: segundos,
        transcripcion: crudo || null,
        transcripcion_de: crudo ? 'celular' : null,
        resumen_estado: 'pendiente'
      });
    }).then(function (fila) { filaVoz = fila; return fila; });

    /* Capa 3, la unica prescindible. */
    LP.resumirVoz(sb, { blob: blobAudio, transcripcion: crudo }).then(function (r) {
      estadoResumen = r;
      var transcripcionFinal = (r.ok && r.transcripcion) ? r.transcripcion : crudo;
      var sugerido = (r.ok && r.resumen) ? r.resumen : transcripcionFinal;
      if (estado === 'revisar') pintar(transcripcionFinal, sugerido, true);
      guardado.then(function (fila) {
        if (!fila) return;
        LP.actualizarVoz(sb, fila.id, {
          transcripcion: transcripcionFinal || null,
          transcripcion_de: (r.ok && r.transcripcion) ? 'gemini' : (crudo ? 'celular' : null),
          resumen: r.ok ? (r.resumen || null) : null,
          resumen_estado: r.ok ? 'ok' : (r.motivo === 'sin-clave' ? 'sin-clave' : 'error'),
          resumen_modelo: r.modelo || null,
          resumen_motivo: r.ok ? null : (r.error || r.motivo || null)
        });
      });
    });
  }

  /* --- Pintar ------------------------------------------------------------- */

  function pintar(crudo, sugerido, conservarTexto) {
    if (!cuerpo) return;

    if (estado === 'idle' || estado === 'pidiendo') {
      var puede = hayGrabadora();
      var dicta = !!ReconocedorDelCelular();
      cuerpo.innerHTML =
        '<div class="voz-centro">' +
          '<button type="button" class="voz-boton" id="vozGrabar"' +
            (puede && estado === 'idle' ? '' : ' disabled') + '>' +
            '<span class="mic" aria-hidden="true">&#127908;</span>' +
            '<span>' + (estado === 'pidiendo' ? 'Pidiendo...' : 'Grabar') + '</span>' +
          '</button>' +
          '<p class="voz-tiempo" aria-hidden="true">0:00</p>' +
          '<p class="voz-pie">' +
            (puede
              ? 'Contale a la mesa como siempre. Hasta un minuto y medio.' +
                (dicta ? ' Vas a ver las palabras mientras hablas.' : '')
              : 'Este celular no puede grabar desde el navegador. ' +
                'Escribí la nota a mano.') +
          '</p>' +
        '</div>';
      return;
    }

    if (estado === 'grabando') {
      cuerpo.innerHTML =
        '<div class="voz-centro">' +
          '<button type="button" class="voz-boton rec" id="vozFrenar">' +
            '<span class="mic" aria-hidden="true">&#9632;</span><span>Listo</span>' +
          '</button>' +
          '<p class="voz-tiempo" id="vozTiempo">0:00</p>' +
          '<p class="voz-pie">Tocá <b>Listo</b> cuando termines.</p>' +
        '</div>' +
        '<div class="voz-capa">' +
          '<b>Lo que se escucha</b>' +
          '<p class="voz-crudo vacio" id="vozEco" role="status" aria-live="polite">' +
            (ReconocedorDelCelular() ? 'Te escucho...'
              : 'Este celular no escribe mientras hablas. El audio se está ' +
                'grabando igual.') +
          '</p>' +
        '</div>';
      return;
    }

    if (estado === 'procesando') {
      cuerpo.innerHTML =
        '<div class="voz-centro"><p class="voz-tiempo">' + reloj(segundos) + '</p>' +
        '<p class="voz-pie">Guardando lo grabado...</p></div>';
      return;
    }

    /* --- revisar: las tres capas, separadas y en orden --- */
    var previo = conservarTexto ? cuerpo.querySelector('#vozTexto') : null;
    var tocado = previo && previo.dataset.tocado === '1';
    var texto = tocado ? previo.value : (sugerido || '');

    var r = estadoResumen || {};
    var chapa, ayuda;
    if (r.motivo === 'pidiendo') {
      chapa = '<span class="voz-chapa flojo">armando...</span>';
      ayuda = 'Mientras tanto podés corregirlo vos.';
    } else if (r.ok) {
      chapa = '<span class="voz-chapa ok">resumido</span>';
      ayuda = 'Leélo antes de mandarlo. Si algo quedó mal, corregilo acá.';
    } else if (r.motivo === 'sin-clave') {
      chapa = '<span class="voz-chapa no">sin activar</span>';
      ayuda = 'Esto es lo que se escuchó, sin resumir.';
    } else {
      chapa = '<span class="voz-chapa flojo">sin resumen</span>';
      ayuda = 'Esto es lo que se escuchó, sin resumir.';
    }

    var aviso = '';
    if (r.motivo === 'sin-clave') {
      aviso = '<p class="voz-nota-off">El resumen automático todavía no está ' +
              'activado en este local. El audio y lo que se escuchó se guardan igual.</p>';
    } else if (r.motivo && r.motivo !== 'ok' && r.motivo !== 'pidiendo') {
      aviso = '<p class="voz-nota-off">No se pudo resumir: ' +
              esc(r.error || 'el servidor no respondió') +
              ' El audio y lo que se escuchó quedaron guardados.</p>';
    }

    cuerpo.innerHTML =
      /* CAPA 1 */
      (urlAudio
        ? '<div class="voz-capa"><b>1 &middot; El audio &middot; ' + reloj(segundos) + '</b>' +
          '<audio controls preload="metadata" src="' + esc(urlAudio) + '"></audio></div>'
        : '<div class="voz-capa"><b>1 &middot; El audio</b>' +
          '<p class="voz-crudo vacio">No quedó audio grabado en este celular.</p></div>') +

      /* CAPA 2 */
      '<div class="voz-capa"><b>2 &middot; Lo que se escuchó</b>' +
        '<p class="voz-crudo' + (crudo ? '' : ' vacio') + '" id="vozCrudo">' +
          esc(crudo || 'No se entendió ninguna palabra.') + '</p>' +
        (crudo ? '<button type="button" class="voz-menor" id="vozTalCual">' +
                 'Usar esto tal cual</button>' : '') +
      '</div>' +

      /* CAPA 3 */
      '<div class="voz-capa"><b>3 &middot; Lo que va a la cocina' + chapa + '</b>' +
        '<p class="ayuda">' + esc(ayuda) + '</p>' +
        aviso +
        '<textarea id="vozTexto" maxlength="500" ' +
          'aria-label="Lo que va a la cocina">' + esc(texto) + '</textarea>' +
      '</div>' +

      '<div class="voz-acciones">' +
        '<button type="button" class="btn btn-primary" id="vozUsar">Usar esta nota</button>' +
        '<button type="button" class="btn btn-secondary" id="vozDeNuevo">Grabar de nuevo</button>' +
      '</div>';

    var ta = cuerpo.querySelector('#vozTexto');
    if (ta) {
      if (tocado) ta.dataset.tocado = '1';
      ta.addEventListener('input', function () { ta.dataset.tocado = '1'; });
    }
  }

  function alTocar(ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    if (b.id === 'vozGrabar') { grabar(); return; }
    if (b.id === 'vozFrenar') { frenar(); return; }
    if (b.id === 'vozDeNuevo') { estado = 'idle'; pintar(); return; }
    if (b.id === 'vozTalCual') {
      var crudoEl = cuerpo.querySelector('#vozCrudo');
      var ta1 = cuerpo.querySelector('#vozTexto');
      if (crudoEl && ta1) {
        ta1.value = crudoEl.textContent.trim().slice(0, 500);
        ta1.dataset.tocado = '1';
        ta1.focus();
      }
      return;
    }
    if (b.id === 'vozUsar') {
      var ta2 = cuerpo.querySelector('#vozTexto');
      var texto = ta2 ? ta2.value.trim() : '';
      if (!texto) { LP.toast('La nota quedó vacía.', 'err'); return; }
      if (filaVoz) {
        idsUsados.push(filaVoz.id);
        LP.actualizarVoz(opciones.sb, filaVoz.id, { texto_usado: texto.slice(0, 500) });
      }
      var alUsar = opciones && opciones.onUsar;
      cerrar();
      if (alUsar) alUsar(texto, idsUsados.slice());
      return;
    }
  }

  /* --- Abrir y cerrar ----------------------------------------------------- */

  function abrir(opts) {
    opciones = opts || {};
    if (!opciones.sb) opciones.sb = LP.client();
    armarHoja();
    idsUsados = [];
    estado = 'idle';
    tituloEl.textContent = opciones.titulo || 'Grabar la nota';
    subEl.textContent = opciones.mesa ? String(opciones.mesa) : '';
    pintar();
    LP.openDialog(hoja, { persistent: true, focus: '#vozGrabar' });
  }

  function cerrar() {
    soltarMicrofono();
    estado = 'idle';
    if (urlAudio) { try { URL.revokeObjectURL(urlAudio); } catch (e) {} urlAudio = null; }
    blobAudio = null; pedazos = [];
    if (hoja) { LP.closeDialog(hoja); cuerpo.innerHTML = ''; }
  }

  /* Si el mozo cambia de pantalla con el microfono abierto, se suelta. */
  LP.onCleanup(soltarMicrofono);
  global.addEventListener('pagehide', soltarMicrofono);

  global.LP_VOZ = {
    soportado: soportado,
    abrir: abrir,
    cerrar: cerrar,
    TOPE_SEGUNDOS: TOPE_SEGUNDOS,
    formatoElegido: formatoElegido
  };

  /* ==========================================================================
     LP_NOTAS - las frases de todos los dias
     ==========================================================================
     Un boton por frase. Se toca y se suma al campo, separada con coma de lo
     que ya hubiera. El "+" guarda lo que el mozo acaba de escribir como una
     frase mas, y el lapiz deja sacarlas.

     Son de TODO EL LOCAL, no de cada mozo: la que carga uno le sirve al otro
     desde el minuto cero, y como se entra tocando un nombre sin clave, "de
     cada mozo" seria una lista por nombre escrito a mano.                 */

  function sumarAlCampo(campo, frase) {
    var actual = String(campo.value || '').trim();
    var yaEsta = actual.toLowerCase().indexOf(frase.toLowerCase()) !== -1;
    if (yaEsta) { campo.focus(); return; }
    campo.value = (actual ? actual.replace(/[,\s]+$/, '') + ', ' : '') + frase;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.focus();
    try { campo.setSelectionRange(campo.value.length, campo.value.length); } catch (e) {}
  }

  /* contenedor: donde van los botones. campo: el textarea/input que llenan. */
  function montarNotas(contenedor, campo, opts) {
    if (!contenedor || !campo) return;
    opts = opts || {};
    estilos();
    var sb = opts.sb || LP.client();
    var quien = opts.quien || '';
    var lista = [];
    var editando = false;

    contenedor.className = 'nf-caja';
    contenedor.innerHTML = '<span class="nf-tit">Lo de siempre</span>' +
                           '<div class="nf-lista"><p class="nf-vacio">Cargando...</p></div>';
    var caja = contenedor.querySelector('.nf-lista');

    function pintarChips() {
      if (!lista.length && !editando) {
        caja.innerHTML = '<p class="nf-vacio">Todavía no hay frases guardadas.</p>' +
          '<button type="button" class="nf-chip mas" data-nf="agregar">' +
          '+ Guardar lo que escribí</button>';
        return;
      }
      caja.innerHTML =
        lista.map(function (t, i) {
          return '<button type="button" class="nf-chip" data-nf="' +
            (editando ? 'sacar' : 'poner') + '" data-i="' + i + '">' +
            esc(t) + (editando ? ' <span class="x" aria-hidden="true">&times;</span>' : '') +
            '</button>';
        }).join('') +
        '<button type="button" class="nf-chip mas" data-nf="agregar">' +
          '+ Guardar lo que escribí</button>' +
        (lista.length ? '<button type="button" class="nf-chip mas" data-nf="editar">' +
          (editando ? 'Listo' : 'Sacar alguna') + '</button>' : '');
    }

    function guardar(nueva) {
      return LP.guardarNotasFrecuentes(sb, nueva, quien).then(function (ok) {
        if (!ok) { LP.toast('No se pudo guardar la frase.', 'err'); return false; }
        lista = ok;
        pintarChips();
        return true;
      });
    }

    caja.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-nf]');
      if (!b) return;
      var que = b.dataset.nf;

      if (que === 'poner') { sumarAlCampo(campo, lista[Number(b.dataset.i)] || ''); return; }

      if (que === 'editar') { editando = !editando; pintarChips(); return; }

      if (que === 'sacar') {
        var i = Number(b.dataset.i);
        var copia = lista.slice();
        copia.splice(i, 1);
        guardar(copia);
        return;
      }

      if (que === 'agregar') {
        /* La frase sale de lo ULTIMO que escribio el mozo en el campo, que es
           justo lo que se acaba de repetir por decima vez. Si el campo tiene
           varias separadas por coma, se guarda la ultima. */
        var crudo = String(campo.value || '').trim();
        var frase = crudo.split(',').pop().trim();
        if (!frase) { LP.toast('Escribí la frase en la nota y volvé a tocar.', 'err'); return; }
        if (frase.length > 40) { LP.toast('Esa frase es muy larga para un botón.', 'err'); return; }
        guardar(lista.concat([frase])).then(function (ok) {
          if (ok) LP.toast('"' + frase + '" quedó guardada para todos.', 'ok');
        });
        return;
      }
    });

    return LP.notasFrecuentes(sb).then(function (l) {
      lista = l || [];
      pintarChips();
      return lista;
    });
  }

  global.LP_NOTAS = { montar: montarNotas, sumarAlCampo: sumarAlCampo };

})(window);
