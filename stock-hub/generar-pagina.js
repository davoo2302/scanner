// Genera la página de un proyecto propio a partir de ubicaciones-deposito.html, cambiando SOLO el bloque
// CONFIG_FIJA y el título. Así no hay dos copias que se desarmen con el tiempo.
//   node stock-hub/generar-pagina.js davidclik
// Deja stock-hub-<nombre>.html en la raíz del repo. Los datos de `fb` NO son secretos (identifican el proyecto);
// el acceso lo controlan las reglas y la lista de usuarios.

const fs = require('node:fs');
const path = require('node:path');

const PROYECTOS = {
  davidclik: {
    titulo: 'Stock Hub · DavidClik',
    empresa: 'davidclik',
    fb: {
      apiKey: 'AIzaSyA5zOQ5PtOLWIVyM_0XPqw63sPT9J2coWs',
      authDomain: 'stock-hub-c5a0e.firebaseapp.com',
      projectId: 'stock-hub-c5a0e',
      storageBucket: 'stock-hub-c5a0e.firebasestorage.app',
      messagingSenderId: '307036609631',
      appId: '1:307036609631:web:7a9f959f5f2fda7bda8fea',
    },
  },
};

const nombre = process.argv[2];
const p = PROYECTOS[nombre];
if (!p) { console.error(`Uso: node stock-hub/generar-pagina.js <${Object.keys(PROYECTOS).join('|')}>`); process.exit(1); }

const raiz = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(raiz, 'ubicaciones-deposito.html'), 'utf8');

const bloque = /const CONFIG_FIJA = \{[\s\S]*?\n\};/;
if (!bloque.test(html)) throw new Error('No encontré el bloque CONFIG_FIJA: la página cambió.');
const fb = Object.entries(p.fb).map(([k, v]) => `    ${k}: '${v}'`).join(',\n');
html = html.replace(bloque, () => `const CONFIG_FIJA = {\n  empresa: '${p.empresa}',\n  fb: {\n${fb}\n  }\n};`);

if (!/<title>Ubicaciones del depósito<\/title>/.test(html)) throw new Error('No encontré el título.');
html = html.replace('<title>Ubicaciones del depósito</title>', () => `<title>${p.titulo}</title>`);

if (html.includes('ubicaciones-depositos')) throw new Error('Quedó una referencia al proyecto del depósito.');

const salida = path.join(raiz, `stock-hub-${nombre}.html`);
fs.writeFileSync(salida, html);
console.log('Listo:', salida);
