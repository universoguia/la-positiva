/* ==========================================================================
   La Positiva - el tema editable (nombre, color, tipografia, forma)
   --------------------------------------------------------------------------
   POR QUE ESTE ARCHIVO VA SUELTO Y SIN "defer".

   Todo lo demas de La Positiva se carga con defer, que corre despues de
   armar el HTML. Para un tema eso no sirve: el navegador ya pinto la
   pantalla con los colores de styles.css y el cambio se ve EN VIVO, como un
   parpadeo. En un salon, con la pantalla prendida todo el turno, eso se nota
   y queda mal.

   Por eso esto es un script bloqueante, chiquito y local, puesto en el
   <head> justo despues de styles.css: lee el ultimo tema guardado en el
   propio telefono (localStorage) y escribe las variables ANTES del primer
   pintado. Cuesta lo mismo que una linea mas de CSS y saca el parpadeo.

   La base de datos llega despues, sin apuro: app.js la consulta cuando
   puede y, si cambio algo, refresca el tema y actualiza la copia local.

   QUE PASA SI FALLA TODO. Si no hay copia local, si localStorage esta
   bloqueado (Safari en privado), si no hay internet o si la consulta a
   Supabase se cae: no se escribe ninguna variable y la app se ve EXACTAMENTE
   como se ve hoy, con los valores de :root de styles.css. El tema solo puede
   sumar; nunca puede dejar una pantalla en blanco.

   NADA SE ESCRIBE A MANO. Ni un color ni un nombre de fuente entran crudos
   al <style>: solo salen valores de las listas de abajo. Un `--accent: rojo}
   body{display:none}` guardado a mano en la base seria CSS inyectado en las
   catorce pantallas. Con listas cerradas no hay nada que sanear.
   El unico texto libre es el nombre del local, y ese nunca toca CSS: va por
   textContent.
   ========================================================================== */
(function (global) {
  'use strict';

  var ID_ESTILO = 'lp-tema';
  var ID_FUENTES = 'lp-tema-fuentes';
  var CACHE = 'lp_tema_v1';

  /* Las claves que viven en la tabla la_positiva_ajustes. */
  var CLAVES = ['nombre_local', 'tema_marca', 'tema_dorado', 'tema_fondo',
                'tema_tipografia', 'tema_esquinas'];

  var NOMBRE_FABRICA = 'La Positiva';

  /* --- Color de marca -----------------------------------------------------
     El terracota de siempre va primero y se llama "Original": elegirlo tiene
     que devolver la app exacta de hoy, o el editor no sirve para volver
     atras. Los otros ocho estan elegidos para que el texto blanco encima se
     lea (4.5:1 o mejor): eso lo comprueba el editor antes de guardar.      */
  var MARCA = {
    terracota: { nombre: 'Terracota', hex: '#b4472a', ayuda: 'La de siempre.' },
    ladrillo:  { nombre: 'Ladrillo',  hex: '#9c3b22' },
    bordo:     { nombre: 'Bordó',     hex: '#8c2f3a' },
    vino:      { nombre: 'Vino',      hex: '#71263a' },
    bosque:    { nombre: 'Verde bosque', hex: '#2f5d45' },
    noche:     { nombre: 'Azul noche',   hex: '#22465e' },
    tabaco:    { nombre: 'Tabaco',    hex: '#7d5232' },
    ciruela:   { nombre: 'Ciruela',   hex: '#63305a' },
    carbon:    { nombre: 'Carbón',    hex: '#3a322c' }
  };

  /* --- Dorado -------------------------------------------------------------
     Es el color del detalle: el rol en la portada, el borde al pasar por
     arriba, la inicial del duenio. Siempre se ve sobre el fondo tinta.     */
  var DORADO = {
    dorado: { nombre: 'Dorado', hex: '#c8963e', ayuda: 'El de siempre.' },
    bronce: { nombre: 'Bronce', hex: '#b9843a' },
    ocre:   { nombre: 'Ocre',   hex: '#c19b34' },
    laton:  { nombre: 'Latón',  hex: '#bda579' },
    cobre:  { nombre: 'Cobre',  hex: '#c07c4a' },
    plata:  { nombre: 'Plata',  hex: '#b6b2ab' }
  };

  /* --- Fondo --------------------------------------------------------------
     De a juegos y no sueltos. Un crema de fondo pide un papel de tarjeta y
     dos bordes que le vayan; elegidos por separado el resultado es barro.
     "Crema" esta copiado tal cual de styles.css.                           */
  var FONDO = {
    crema: { nombre: 'Crema', ayuda: 'El de siempre.',
             bg: '#f3ece2', card: '#fdfaf6', borde: '#e0d5c6', bordeFuerte: '#cdbca6' },
    lino:  { nombre: 'Lino', ayuda: 'Más claro y neutro.',
             bg: '#f5f1ea', card: '#ffffff', borde: '#e4ded4', bordeFuerte: '#cfc6b8' },
    arena: { nombre: 'Arena', ayuda: 'Más cálido y dorado.',
             bg: '#f0e6d4', card: '#fbf6ec', borde: '#ddcfb6', bordeFuerte: '#c7b493' },
    papel: { nombre: 'Papel frío', ayuda: 'Gris parejo, sin amarillo.',
             bg: '#f2f3f5', card: '#ffffff', borde: '#dfe1e5', bordeFuerte: '#c4c8ce' },
    nieve: { nombre: 'Nieve', ayuda: 'Blanco casi puro. El de más contraste.',
             bg: '#fafafa', card: '#ffffff', borde: '#e6e6e6', bordeFuerte: '#c9c9c9' }
  };

  /* --- Tipografia ---------------------------------------------------------
     De a pares (titulos + cuerpo), nunca fuentes sueltas: la forma mas
     rapida de que una app se vea barata es una serif dramatica arriba de
     otra serif dramatica.

     LAS TRES PRIMERAS NO DESCARGAN NADA. Jost y Cormorant ya viven en
     fonts/ (.woff2 propios) y Georgia ya esta en el telefono. Las dos
     ultimas piden Google Fonts, y ahi manda la regla del wifi malo: el
     <link> se inyecta con media="print" y recien pasa a "all" cuando
     termino de bajar, asi que NO bloquea el pintado. Si Google nunca
     contesta, cada familia tiene su cadena de respaldo y la app se ve con
     Georgia y con la sans del sistema. Nunca sin texto.                    */
  var TIPOGRAFIA = {
    original: {
      nombre: 'Original', ayuda: 'Cormorant Garamond y Jost. La de hoy.',
      titulos: "'Cormorant Garamond',Georgia,serif", estilo: 'italic',
      cuerpo: "'Jost',system-ui,-apple-system,'Segoe UI',sans-serif", google: null
    },
    clasica: {
      nombre: 'Clásica', ayuda: 'Títulos en Georgia. No descarga nada.',
      titulos: "Georgia,'Times New Roman',serif", estilo: 'italic',
      cuerpo: "'Jost',system-ui,-apple-system,'Segoe UI',sans-serif", google: null
    },
    sistema: {
      nombre: 'Del sistema', ayuda: 'Las letras que ya tiene el teléfono. La más rápida.',
      titulos: "Georgia,'Times New Roman',serif", estilo: 'normal',
      cuerpo: "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", google: null
    },
    moderna: {
      nombre: 'Moderna', ayuda: 'Títulos con peso. DM Serif con DM Sans.',
      titulos: "'DM Serif Display',Georgia,serif", estilo: 'normal',
      cuerpo: "'DM Sans',system-ui,-apple-system,sans-serif",
      google: 'family=DM+Sans:wght@400;500;700&family=DM+Serif+Display'
    },
    calida: {
      nombre: 'Cálida', ayuda: 'Redondeada y cercana. Fraunces con Nunito.',
      titulos: "'Fraunces',Georgia,serif", estilo: 'normal',
      cuerpo: "'Nunito',system-ui,-apple-system,sans-serif",
      google: 'family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Nunito:wght@300;400;600;700'
    }
  };

  /* --- Esquinas -----------------------------------------------------------
     "Suaves" son los 10/14/18 que ya dice styles.css. El pill (999px) no se
     toca: un chip de estado redondo es redondo en las tres opciones.       */
  var ESQUINAS = {
    rectas:   { nombre: 'Rectas',   ayuda: 'Más serio, más de ficha.', sm: '4px',  md: '6px',  lg: '8px' },
    suaves:   { nombre: 'Suaves',   ayuda: 'Como está hoy.',           sm: '10px', md: '14px', lg: '18px' },
    redondas: { nombre: 'Redondas', ayuda: 'Más blando y moderno.',    sm: '14px', md: '20px', lg: '26px' }
  };

  /* ------------------------------------------------------------- color -- */

  function aRGB(color) {
    var t = String(color === null || color === undefined ? '' : color).trim().toLowerCase();
    var m = t.match(/^#([0-9a-f]{6})$/);
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = t.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
    if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
    m = t.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
    if (m) {
      var v = [Number(m[1]), Number(m[2]), Number(m[3])];
      for (var i = 0; i < 3; i++) if (!(v[i] >= 0 && v[i] <= 255)) return null;
      return [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])];
    }
    return null;
  }

  function aHex(rgb) {
    function c(x) {
      var v = Math.max(0, Math.min(255, Math.round(x))).toString(16);
      return v.length < 2 ? '0' + v : v;
    }
    return '#' + c(rgb[0]) + c(rgb[1]) + c(rgb[2]);
  }

  /* Luminancia relativa, la formula de WCAG 2.1 (no una aproximacion). */
  function luminancia(color) {
    var rgb = aRGB(color);
    if (!rgb) return null;
    var l = [];
    for (var i = 0; i < 3; i++) {
      var s = rgb[i] / 255;
      l.push(s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));
    }
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }

  /* De 1 (iguales) a 21 (negro sobre blanco). null si alguno no se entiende:
     ahi no se opina, no se inventa un "esta todo bien". */
  function contraste(a, b) {
    var la = luminancia(a), lb = luminancia(b);
    if (la === null || lb === null) return null;
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function legible(n) { return n === null ? '—' : (Math.round(n * 10) / 10) + ':1'; }

  function rgbAHsl(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }

  function hslARgb(hsl) {
    var h = hsl[0] / 360, s = hsl[1] / 100, l = hsl[2] / 100;
    if (s === 0) { var v = l * 255; return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function hue(t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
  }

  /* Baja la luz sin tocar el matiz. Con -9 sobre el terracota da #8f3821,
     que es el #93381f de --accent-dark de hoy a ojo de mosca: la relacion
     entre el boton y su estado apretado se conserva para cualquier color. */
  function ajustarLuz(hex, delta) {
    var rgb = aRGB(hex);
    if (!rgb) return hex;
    var hsl = rgbAHsl(rgb);
    return aHex(hslARgb([hsl[0], hsl[1], Math.max(3, Math.min(97, hsl[2] + delta))]));
  }

  /* El tinte clarito del fondo de avisos: 8% del color sobre blanco.
     Sobre el terracota da #f9f0ee, practicamente el #fbf1ec escrito a mano. */
  function tinte(hex, parte) {
    var rgb = aRGB(hex);
    if (!rgb) return hex;
    var p = parte === undefined ? 0.08 : parte;
    return aHex([rgb[0] * p + 255 * (1 - p), rgb[1] * p + 255 * (1 - p), rgb[2] * p + 255 * (1 - p)]);
  }

  /* ------------------------------------------------------- la guarda ----- */

  var AA = { texto: 4.5, grande: 3, control: 3, minimo: 3 };

  function revisarPar(textoColor, fondoColor, uso) {
    var ratio = contraste(textoColor, fondoColor);
    var minimo = AA[uso] || AA.texto;
    if (ratio === null) {
      return { ratio: null, nivel: 'desconocido', pasa: false, grave: false,
               mensaje: 'No pudimos medir el contraste.' };
    }
    if (ratio >= minimo) {
      return { ratio: ratio, nivel: 'ok', pasa: true, grave: false,
               mensaje: 'Contraste ' + legible(ratio) + '. Se lee bien.' };
    }
    if (ratio < AA.minimo) {
      return { ratio: ratio, nivel: 'grave', pasa: false, grave: true,
               mensaje: 'Contraste ' + legible(ratio) + '. Así casi no se ve. '
                      + 'Hace falta al menos ' + minimo + ':1.' };
    }
    return { ratio: ratio, nivel: 'flojo', pasa: false, grave: false,
             mensaje: 'Contraste ' + legible(ratio) + '. Se lee, pero cuesta: en el salón '
                    + 'con el sol de frente se pierde. Lo recomendado es ' + minimo + ':1.' };
  }

  /* Las seis combinaciones que de verdad aparecen en pantalla, no todas las
     posibles. Se AVISA, no se prohibe: el editor deja guardar igual salvo
     que algo caiga por debajo de 3:1, que ya no es gusto sino una pantalla
     que no se puede usar en un turno.                                      */
  function revisar(valores) {
    var v = normalizar(valores);
    var marca = MARCA[v.tema_marca].hex;
    var dorado = DORADO[v.tema_dorado].hex;
    var f = FONDO[v.tema_fondo];
    var INK = '#14100e', MUTED = '#6b5847';

    var pares = [
      { campo: 'tema_fondo',  rotulo: 'El texto de la app sobre el fondo',      texto: INK,   fondo: f.bg,   uso: 'texto' },
      { campo: 'tema_fondo',  rotulo: 'El texto adentro de las tarjetas',       texto: INK,   fondo: f.card, uso: 'texto' },
      { campo: 'tema_fondo',  rotulo: 'Los textos chicos grises de las tarjetas', texto: MUTED, fondo: f.card, uso: 'texto' },
      { campo: 'tema_marca',  rotulo: 'El texto blanco de los botones',         texto: '#ffffff', fondo: marca, uso: 'texto' },
      { campo: 'tema_marca',  rotulo: 'El borde del foco sobre el fondo',       texto: marca, fondo: f.bg,   uso: 'control' },
      { campo: 'tema_dorado', rotulo: 'El dorado sobre las pantallas oscuras',  texto: dorado, fondo: INK,   uso: 'texto' }
    ];

    var problemas = [];
    for (var i = 0; i < pares.length; i++) {
      var r = revisarPar(pares[i].texto, pares[i].fondo, pares[i].uso);
      if (r.nivel === 'ok') continue;
      problemas.push({ campo: pares[i].campo, rotulo: pares[i].rotulo, ratio: r.ratio,
                       nivel: r.nivel, grave: r.grave, mensaje: r.mensaje });
    }
    return problemas;
  }

  /* --------------------------------------------------------- el CSS ------ */

  /* Deja los valores en algo que siempre existe en las listas. Cualquier
     cosa rara guardada en la base (un typo, una version vieja, un ataque)
     cae en el preset de fabrica y la app se ve como hoy. */
  function normalizar(valores) {
    var v = valores || {};
    return {
      nombre_local: nombreValido(v.nombre_local) ? String(v.nombre_local).trim() : NOMBRE_FABRICA,
      tema_marca:      MARCA[v.tema_marca]           ? v.tema_marca      : 'terracota',
      tema_dorado:     DORADO[v.tema_dorado]         ? v.tema_dorado     : 'dorado',
      tema_fondo:      FONDO[v.tema_fondo]           ? v.tema_fondo      : 'crema',
      tema_tipografia: TIPOGRAFIA[v.tema_tipografia] ? v.tema_tipografia : 'original',
      tema_esquinas:   ESQUINAS[v.tema_esquinas]     ? v.tema_esquinas   : 'suaves'
    };
  }

  /* El nombre es el unico texto libre. Nunca toca CSS (va por textContent),
     asi que alcanza con que sea corto y no venga vacio. */
  function nombreValido(n) {
    return typeof n === 'string' && n.trim().length > 0 && n.trim().length <= 40;
  }

  /* Es el de fabrica? Entonces NO se escribe una sola variable: la app queda
     byte por byte como hoy. Es la regla dura del encargo. */
  function esFabrica(v) {
    var n = normalizar(v);
    return n.tema_marca === 'terracota' && n.tema_dorado === 'dorado' &&
           n.tema_fondo === 'crema' && n.tema_tipografia === 'original' &&
           n.tema_esquinas === 'suaves';
  }

  /* Arma el bloque de variables. La misma funcion la usa la vista previa del
     editor (con otro selector) y la app de verdad: asi las dos formas de
     aplicarlo no se pueden desincronizar. */
  function css(valores, selector) {
    var v = normalizar(valores);
    var sel = selector || ':root';
    var p = [];

    var marca = MARCA[v.tema_marca].hex;
    if (v.tema_marca !== 'terracota') {
      p.push('--accent:' + marca + ';');
      p.push('--accent-dark:' + ajustarLuz(marca, -9) + ';');
      p.push('--accent-soft:' + tinte(marca, 0.08) + ';');
    }
    if (v.tema_dorado !== 'dorado') p.push('--gold:' + DORADO[v.tema_dorado].hex + ';');
    if (v.tema_fondo !== 'crema') {
      var f = FONDO[v.tema_fondo];
      p.push('--bg:' + f.bg + ';--card:' + f.card + ';');
      p.push('--border:' + f.borde + ';--border-strong:' + f.bordeFuerte + ';');
    }
    if (v.tema_tipografia !== 'original') {
      var t = TIPOGRAFIA[v.tema_tipografia];
      p.push('--font-cuerpo:' + t.cuerpo + ';');
      p.push('--font-titulos:' + t.titulos + ';--font-titulos-estilo:' + t.estilo + ';');
    }
    if (v.tema_esquinas !== 'suaves') {
      var e = ESQUINAS[v.tema_esquinas];
      p.push('--r-sm:' + e.sm + ';--r-md:' + e.md + ';--r-lg:' + e.lg + ';');
    }
    if (!p.length) return '';
    return sel + '{' + p.join('') + '}';
  }

  /* ------------------------------------------------------- las fuentes --- */

  /* El <link> de Google entra con media="print" y recien pasa a "all" cuando
     termino de bajar: asi NO bloquea el pintado. Si no hay internet se queda
     en print para siempre, no molesta a nadie, y manda la cadena de respaldo
     del font-family (Georgia + la sans del sistema).                       */
  function asegurarFuentes(clave) {
    var doc = global.document;
    if (!doc || !doc.head) return;
    var preset = TIPOGRAFIA[clave];
    var link = doc.getElementById(ID_FUENTES);
    if (!preset || !preset.google) { if (link) link.parentNode.removeChild(link); return; }
    var url = 'https://fonts.googleapis.com/css2?' + preset.google + '&display=swap';
    if (link && link.getAttribute('href') === url) return;
    if (!link) {
      link = doc.createElement('link');
      link.id = ID_FUENTES;
      link.rel = 'stylesheet';
      link.media = 'print';
      link.onload = function () { this.media = 'all'; };
      doc.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  /* -------------------------------------------------------- aplicarlo ---- */

  var ultimo = null;

  function aplicar(valores) {
    var doc = global.document;
    if (!doc) return;
    var v = normalizar(valores);
    ultimo = v;

    asegurarFuentes(v.tema_tipografia);

    var texto = css(v);
    var estilo = doc.getElementById(ID_ESTILO);
    if (!texto) { if (estilo) estilo.textContent = ''; }
    else {
      if (!estilo) {
        estilo = doc.createElement('style');
        estilo.id = ID_ESTILO;
        doc.head.appendChild(estilo);   // al final del <head>: gana sobre styles.css
      }
      estilo.textContent = texto;
    }

    /* La barra del telefono y el icono instalado leen <meta theme-color>.
       Las pantallas claras la tienen en el crema del fondo y las oscuras en
       la tinta: solo se toca la clara, porque la tinta no es del tema. */
    try {
      var meta = doc.querySelector('meta[name="theme-color"]');
      if (meta && String(meta.getAttribute('content')).toLowerCase() !== '#14100e') {
        meta.setAttribute('content', FONDO[v.tema_fondo].bg);
      }
    } catch (e) {}

    escribirNombre(v.nombre_local);
  }

  /* El nombre del local en pantalla. Cualquier elemento con
     [data-nombre-local] lo recibe: asi ninguna pantalla se puede olvidar,
     igual que con [data-quien]. Va por textContent, nunca por innerHTML. */
  function escribirNombre(nombre) {
    var doc = global.document;
    if (!doc) return;
    function pintar() {
      var nodos = doc.querySelectorAll('[data-nombre-local]');
      for (var i = 0; i < nodos.length; i++) nodos[i].textContent = nombre;
    }
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', pintar, { once: true });
      // El <head> corre antes de que exista el <body>: se pinta igual ahora
      // por si algun nodo ya se parseo, y de nuevo cuando este todo.
      try { pintar(); } catch (e) {}
    } else pintar();
  }

  /* ----------------------------------------------------------- cache ----- */

  function leerCache() {
    try {
      var crudo = global.localStorage.getItem(CACHE);
      if (!crudo) return null;
      var v = JSON.parse(crudo);
      return v && typeof v === 'object' ? v : null;
    } catch (e) { return null; }   // Safari en privado tira aca. No importa.
  }

  function guardarCache(valores) {
    try { global.localStorage.setItem(CACHE, JSON.stringify(normalizar(valores))); }
    catch (e) {}
  }

  function nombre() { return (ultimo && ultimo.nombre_local) || NOMBRE_FABRICA; }

  global.LP_TEMA = {
    CLAVES: CLAVES,
    NOMBRE_FABRICA: NOMBRE_FABRICA,
    MARCA: MARCA, DORADO: DORADO, FONDO: FONDO,
    TIPOGRAFIA: TIPOGRAFIA, ESQUINAS: ESQUINAS,
    normalizar: normalizar,
    nombreValido: nombreValido,
    esFabrica: esFabrica,
    css: css,
    aplicar: aplicar,
    asegurarFuentes: asegurarFuentes,
    escribirNombre: escribirNombre,
    leerCache: leerCache,
    guardarCache: guardarCache,
    nombre: nombre,
    contraste: contraste,
    legible: legible,
    revisarPar: revisarPar,
    revisar: revisar,
    ajustarLuz: ajustarLuz,
    tinte: tinte
  };

  /* Lo unico que corre solo: el tema de la copia local, antes del primer
     pintado. Si no hay nada guardado no se escribe una sola variable. */
  var cache = leerCache();
  if (cache) { try { aplicar(cache); } catch (e) {} }
  else ultimo = normalizar(null);

})(window);
