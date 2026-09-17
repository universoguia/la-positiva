/* Genera el hash de la clave del taller (taller.html), la puerta de David.

   Para que sirve: taller.html necesita poder comprobar una clave, pero todo
   lo que llega al navegador es publico. Entonces no viaja la clave: viaja el
   sha-256. De un hash no se saca la clave de vuelta, asi que se puede
   publicar sin regalar nada.

   La clave se escribe ACA, en la terminal, y no queda en ningun archivo del
   repo ni en ningun chat. Lo unico que sale es el hash, que es lo que se pega
   en Vercel.

   Uso:
     node scripts/hash-taller.js
     (te pide la clave y te devuelve el hash)

   Despues, en Vercel:
     Settings -> Environment Variables -> LP_PUBLIC_TALLER_HASH = <el hash>
   y volver a deployar para que entre en config.js.                        */
const crypto = require('crypto');
const readline = require('readline');

/* La misma cuenta que hace el navegador en taller.html. Si una de las dos
   cambia, hay que cambiar las dos: por eso esta escrito igual de simple en
   los dos lados, sin sal ni vueltas. Esto no protege plata, ordena el
   acceso. */
function hash(clave) {
  return crypto.createHash('sha256').update(String(clave), 'utf8').digest('hex');
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Clave del taller (no se guarda en ningun lado): ', function (clave) {
  rl.close();
  const limpia = String(clave || '').trim();
  if (limpia.length < 6) {
    console.error('\nMuy corta. Pone al menos 6 caracteres.');
    process.exit(1);
  }
  console.log('\nHash listo. Pegalo en Vercel como LP_PUBLIC_TALLER_HASH:\n');
  console.log('  ' + hash(limpia) + '\n');
  console.log('Despues corre:  vercel --prod --yes');
  console.log('Y para probarlo local, en tu .env:');
  console.log('  LP_PUBLIC_TALLER_HASH=' + hash(limpia) + '\n');
});
