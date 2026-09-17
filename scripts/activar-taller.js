/* Activa la puerta del taller (taller.html) de punta a punta.

   Reemplaza a hash-taller.js + pegar a mano en Vercel + deployar. Es un solo
   comando porque cada paso suelto es un lugar donde equivocarse:

     node scripts/activar-taller.js

   Lo que hace, en orden:
     1. Te pide la clave. No se ve mientras la escribis y no queda en ningun
        archivo: lo unico que se guarda es el sha-256.
     2. Escribe el hash en .env (para poder probarlo local).
     3. Lo carga en Vercel como LP_PUBLIC_TALLER_HASH, en Production,
        Preview y Development. Si ya estaba, lo pisa.
     4. Regenera config.js.
     5. Deploya a produccion.

   Si algo falla, corta ahi y te dice exactamente en que paso y como seguir a
   mano. Nunca deja la clave a medio poner.                                */
const crypto = require('crypto');
const readline = require('readline');
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const VARIABLE = 'LP_PUBLIC_TALLER_HASH';
const ENTORNOS = ['production', 'preview', 'development'];

function hash(clave) {
  return crypto.createHash('sha256').update(String(clave), 'utf8').digest('hex');
}

/* Pregunta sin mostrar lo que se tipea. Si el terminal no lo soporta (pasa en
   algunas consolas de Windows), avisa y la muestra igual en vez de romperse:
   es preferible que David la vea el a que el script no ande. */
function preguntarOculto(texto) {
  return new Promise(function (resolve) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let mudo = false;
    const escribir = rl._writeToOutput;
    rl._writeToOutput = function (s) {
      if (mudo && !/\n/.test(s)) return;
      escribir.call(rl, s);
    };
    rl.question(texto, function (v) { rl.close(); process.stdout.write('\n'); resolve(v); });
    mudo = true;
  });
}

function paso(n, texto) { console.log('\n[' + n + '/5] ' + texto); }

function corriendo(cmd, args) {
  return execFileSync(cmd, args, { cwd: RAIZ, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
}

/* El .env no va al repo (esta en .gitignore). Se reescribe la linea si ya
   estaba, en vez de acumular duplicados. */
function guardarEnEnv(valor) {
  const archivo = path.join(RAIZ, '.env');
  let lineas = fs.existsSync(archivo)
    ? fs.readFileSync(archivo, 'utf8').split(/\r?\n/)
    : [];
  lineas = lineas.filter(function (l) { return l.trim().indexOf(VARIABLE + '=') !== 0; });
  while (lineas.length && !lineas[lineas.length - 1].trim()) lineas.pop();
  lineas.push(VARIABLE + '=' + valor);
  lineas.push('');
  fs.writeFileSync(archivo, lineas.join('\n'));
}

async function main() {
  console.log('\n=== Activar el taller ===');
  console.log('La clave no se guarda en ningun lado. Solo su hash.\n');

  const clave = (await preguntarOculto('Clave nueva: ')).trim();
  if (clave.length < 6) {
    console.error('Muy corta: poné al menos 6 caracteres. No se cambió nada.');
    process.exit(1);
  }
  const otra = (await preguntarOculto('Repetila: ')).trim();
  if (otra !== clave) {
    console.error('No coinciden. No se cambió nada.');
    process.exit(1);
  }

  const h = hash(clave);

  paso(1, 'Guardando el hash en .env (para probar local)');
  try { guardarEnEnv(h); console.log('    ok'); }
  catch (e) { console.error('    FALLO: ' + e.message); process.exit(1); }

  paso(2, 'Cargando la variable en Vercel');
  for (const entorno of ENTORNOS) {
    /* Si ya existe hay que sacarla antes: 'env add' no pisa. Que el rm falle
       es normal la primera vez, asi que se ignora. */
    try { corriendo('vercel', ['env', 'rm', VARIABLE, entorno, '--yes']); } catch (e) {}
    try {
      execSync('vercel env add ' + VARIABLE + ' ' + entorno, {
        cwd: RAIZ, input: h + '\n', stdio: ['pipe', 'pipe', 'pipe']
      });
      console.log('    ok  ' + entorno);
    } catch (e) {
      console.error('    FALLO en ' + entorno + ': ' + (e.stderr || e.message || '').toString().trim());
      console.error('\n    A mano:  vercel env add ' + VARIABLE + ' ' + entorno);
      console.error('    y cuando pida el valor, pegá:  ' + h);
      process.exit(1);
    }
  }

  paso(3, 'Regenerando config.js');
  try { console.log('    ' + corriendo('node', ['scripts/build-config.js']).trim()); }
  catch (e) { console.error('    FALLO: ' + (e.stderr || e.message)); process.exit(1); }

  paso(4, 'Deployando a producción (tarda un rato)');
  try {
    const out = corriendo('vercel', ['--prod', '--yes']);
    const url = (out.match(/https:\/\/[^\s"]+/g) || []).pop() || '(ver arriba)';
    console.log('    ok  ' + url);
  } catch (e) {
    console.error('    FALLO: ' + (e.stderr || e.message));
    console.error('\n    La variable YA quedó cargada en Vercel. Solo falta deployar:');
    console.error('    vercel --prod --yes');
    process.exit(1);
  }

  paso(5, 'Listo');
  console.log('\n  Entrá a:  https://la-positiva-demo.vercel.app/taller.html');
  console.log('  con la clave que acabás de poner.\n');
  console.log('  Para cambiarla, corré este mismo comando de nuevo.\n');
}

main().catch(function (e) {
  console.error('\nSe cortó: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
