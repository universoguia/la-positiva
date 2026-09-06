/* Genera config.js a partir de variables de entorno.
   Se ejecuta en el build de Vercel y tambien se puede correr a mano.

   El objetivo es que NINGUNA clave este escrita en un archivo del repo.
   Las claves viven en:
     - .env            (local, fuera de git y fuera del deploy)
     - Vercel          (Environment Variables del proyecto)

   Uso:  node scripts/build-config.js                                      */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(RAIZ, 'config.js');

/* Lee .env si existe. En Vercel no existe: ahi las variables ya vienen
   en process.env. Sin dependencias: el formato es simple a proposito.   */
function leerEnv() {
  const archivo = path.join(RAIZ, '.env');
  if (!fs.existsSync(archivo)) return {};
  const out = {};
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    // Permite comillas alrededor del valor.
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = Object.assign({}, leerEnv(), process.env);

/* Solo variables publicas: son las unicas que pueden viajar al navegador.
   El prefijo LP_PUBLIC_ existe para que sea imposible mandar un secreto
   por error: si no lleva ese prefijo, no entra a config.js.             */
const CAMPOS = [
  ['SUPABASE_URL', 'LP_PUBLIC_SUPABASE_URL', true],
  ['SUPABASE_ANON', 'LP_PUBLIC_SUPABASE_ANON', true],
  ['TABLE', 'LP_PUBLIC_TABLE', false, 'la_positiva_pedidos'],
  ['PUSH_TABLE', 'LP_PUBLIC_PUSH_TABLE', false, 'la_positiva_push_subs'],
  ['COBROS_TABLE', 'LP_PUBLIC_COBROS_TABLE', false, 'la_positiva_cobros'],
  ['BUCKET', 'LP_PUBLIC_BUCKET', false, 'la-positiva'],
  ['IMG_BASE', 'LP_PUBLIC_IMG_BASE', true],
  ['VAPID_PUBLIC', 'LP_PUBLIC_VAPID', true]
];

const valores = {};
const faltan = [];
for (const [clave, variable, obligatoria, porDefecto] of CAMPOS) {
  const v = env[variable] || porDefecto;
  if (!v && obligatoria) { faltan.push(variable); continue; }
  valores[clave] = v || '';
}

/* Red de seguridad: si algun valor huele a secreto, se corta el build en
   vez de publicarlo. */
const PELIGRO = [/service_role/i, /"role"\s*:\s*"service_role"/i];
for (const [clave, v] of Object.entries(valores)) {
  for (const re of PELIGRO) {
    if (re.test(String(v))) {
      console.error('ABORTADO: ' + clave + ' parece una clave secreta. Nunca va al navegador.');
      process.exit(1);
    }
  }
}

if (faltan.length) {
  /* Si ya hay un config.js valido, se respeta: permite deployar aunque el
     entorno no tenga las variables (por ejemplo, un deploy de emergencia). */
  if (fs.existsSync(SALIDA) && /SUPABASE_URL/.test(fs.readFileSync(SALIDA, 'utf8'))) {
    console.warn('Faltan variables (' + faltan.join(', ') + '). Se deja el config.js que ya estaba.');
    process.exit(0);
  }
  console.error('No se puede generar config.js. Faltan: ' + faltan.join(', '));
  console.error('Copia .env.example a .env y completalo, o cargalas en Vercel.');
  process.exit(1);
}

const cuerpo = '/* ARCHIVO GENERADO. NO EDITAR A MANO.\n' +
  '   Lo escribe scripts/build-config.js con los valores de .env o de las\n' +
  '   variables de entorno de Vercel. Para cambiar algo, edita esos, no esto.\n\n' +
  '   Todo lo que hay aca es publico: viaja al navegador de cualquiera que\n' +
  '   abra la pagina. Es inevitable en un sitio estatico y no es un descuido.\n' +
  '   Lo que protege los datos es RLS en Supabase. Los secretos de verdad\n' +
  '   (VAPID privada, service_role) nunca pasan por este archivo.\n' +
  '\n   Generado: ' + new Date().toISOString() + ' */\n' +
  'window.LP_CONFIG = ' + JSON.stringify(valores, null, 2) + ';\n';

fs.writeFileSync(SALIDA, cuerpo);
console.log('config.js generado con ' + Object.keys(valores).length + ' valores publicos.');
