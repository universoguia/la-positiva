/* Genera un par de claves VAPID nuevo para Web Push, sin dependencias.
   Un par VAPID es una clave EC P-256: la publica es el punto sin comprimir
   de 65 bytes y la privada es el escalar de 32, ambas en base64url.

   Uso:  node scripts/generar-vapid.js

   Escribe VAPID-NUEVAS.txt en la raiz del proyecto, que esta en .gitignore.
   La publica va en config.js; las tres claves van como secretos de la Edge
   Function. Ojo: rotar invalida todas las suscripciones existentes.        */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const b64u = (b) => Buffer.from(b).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1'
});

// Los ultimos 65 bytes del DER son el punto sin comprimir (0x04 || X || Y).
const pubRaw = publicKey.export({ type: 'spki', format: 'der' }).slice(-65);
const priv = privateKey.export({ format: 'jwk' }).d;   // ya viene en base64url
const pub = b64u(pubRaw);

// Comprobaciones: si algo de esto falla, la clave no serviria.
if (pubRaw[0] !== 0x04) throw new Error('el punto publico no es sin comprimir');
if (Buffer.from(priv, 'base64url').length !== 32) throw new Error('la privada no mide 32 bytes');

// La publica derivada de la privada tiene que dar exactamente la misma.
const rearmada = crypto.createPrivateKey({
  key: {
    kty: 'EC', crv: 'P-256', d: priv,
    x: pubRaw.slice(1, 33).toString('base64url'),
    y: pubRaw.slice(33, 65).toString('base64url')
  },
  format: 'jwk'
});
const derivada = crypto.createPublicKey(rearmada).export({ type: 'spki', format: 'der' }).slice(-65);
if (!derivada.equals(pubRaw)) throw new Error('el par no coincide');

const destino = path.join(__dirname, '..', 'VAPID-NUEVAS.txt');
fs.writeFileSync(destino,
  'CLAVES VAPID NUEVAS PARA LA POSITIVA\n' +
  'Generadas ' + new Date().toISOString() + '\n\n' +
  'Cargalas como secretos de la Edge Function en:\n' +
  'Supabase > Configuracion > Edge Functions > Secrets\n\n' +
  'VAPID_PUBLIC_KEY\n' + pub + '\n\n' +
  'VAPID_PRIVATE_KEY\n' + priv + '\n\n' +
  'VAPID_SUBJECT\nmailto:hola@lapositiva.com.ar\n\n' +
  'La publica ademas va en config.js (campo VAPID_PUBLIC).\n' +
  'Al rotar, todos los dispositivos tienen que volver a activar los avisos.\n' +
  'ESTE ARCHIVO NO SE SUBE AL REPO: esta en .gitignore.\n');

console.log('Par generado y verificado.');
console.log('Archivo: ' + destino);
console.log('');
console.log('Clave publica (no es secreta, va en config.js):');
console.log(pub);
console.log('');
console.log('La privada quedo solo en el archivo. No la pegues en ningun chat.');
