/**
 * ============================================================
 *  generar-seo.js  ·  JH SEGUROS (jhseguros.mx)
 * ============================================================
 *  Se ejecuta en GitHub Actions con:  node scripts/generar-seo.js
 *
 *  QUÉ HACE
 *  1. Convierte cada guía de la carpeta  Guias/*.md  en una página
 *     real  /recursos/<nombre-de-la-guia>/index.html
 *     (título, descripción, canonical, Open Graph, datos
 *     estructurados, pie legal y botones de contacto).
 *  2. Crea la página  /recursos/  con la lista de TODAS las guías
 *     ya escrita en HTML (sin depender de la API de GitHub).
 *  3. Genera  sitemap.xml  con fecha de modificación real
 *     (solo cambia la fecha de las páginas que sí cambiaron).
 *  4. Limpia duplicados exactos y avisa de problemas.
 *
 *  QUÉ NO HACE (a propósito)
 *  - NO copia la portada (index.html) a las demás secciones.
 *    Cada sección (/gmm/, /ppr/, /vida/...) es su propia carpeta
 *    con su propio index.html, y el robot no la toca.
 *  - NO sobrescribe páginas hechas a mano. Solo reemplaza páginas
 *    que él mismo creó (llevan la marca "generado-por-robot").
 *
 *  Si quieres que el robot rehaga una guía que ya existe, cambia
 *  SOBRESCRIBIR_GUIAS_EXISTENTES a true (más abajo), o borra la
 *  carpeta de esa guía en GitHub y el robot la vuelve a crear.
 * ============================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ------------------------------------------------------------
// 1. CONFIGURACIÓN (aquí se cambian los datos del sitio)
// ------------------------------------------------------------
const DOMINIO = 'https://jhseguros.mx';
const MARCA = 'JH Seguros';
const AGENTE = 'Rafael Jiménez Sánchez';
const CEDULAS = 'Cédula A1 H382035 y B Y415335';
const CORREO = 'jhseguros@jhasesorias.com';
const TELEFONO_VISIBLE = '834-311-7556';
const TELEFONO_LINK = '+528343117556';
const WHATSAPP = '528343117556';
const GA_ID = 'G-Z3GLCDV4F8';
const ADS_ID = 'AW-18520948891';

// true = el robot vuelve a crear guías aunque ya existan hechas a mano
const SOBRESCRIBIR_GUIAS_EXISTENTES = false;
// true = borra archivos .html que son copia EXACTA de su carpeta/index.html
const LIMPIAR_DUPLICADOS_EXACTOS = true;
// súbelo (por ejemplo a '2') cuando cambies el diseño de las guías:
// así todas las guías generadas reciben fecha nueva en el sitemap
const VERSION_PLANTILLA = '1';

// Marca que el robot pone en lo que él mismo genera
const MARCA_ROBOT = '<!-- generado-por-robot-jhseguros -->';

// Secciones del sitio: [carpeta, prioridad en el sitemap]
const SECCIONES = [
  ['danos', 0.9], ['productos-vida', 0.9],
  ['auto', 0.8], ['gmm', 0.8], ['vida', 0.8], ['ppr', 0.8], ['mujer', 0.8],
  ['educacion', 0.8], ['embarcaciones', 0.8], ['hogar', 0.8], ['negocio', 0.8], ['rc', 0.8],
  ['hospitales', 0.7], ['autorizaciones', 0.7], ['certificaciones', 0.7],
  ['contacto-form', 0.7], ['redes', 0.6],
  ['privacidad', 0.5], ['vision', 0.5], ['mision', 0.5], ['valor', 0.5]
];

// Rutas (relativas a donde se ejecuta el script = raíz del repositorio)
const raiz = process.cwd();
const dirGuias = path.join(raiz, 'Guias');
const dirRecursos = path.join(raiz, 'recursos');
const archivoIndex = path.join(raiz, 'index.html');
const archivoSitemap = path.join(raiz, 'sitemap.xml');
const archivoFechas = path.join(raiz, 'scripts', 'sitemap-fechas.json');

// ------------------------------------------------------------
// 2. UTILIDADES
// ------------------------------------------------------------
const avisos = [];
const conteo = { creados: 0, actualizados: 0, iguales: 0, borrados: 0 };
const aviso = (m) => { avisos.push(m); console.log('⚠️  ' + m); };

const existe = (p) => fs.existsSync(p);
const leer = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const hash = (t) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 12);
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' }); // AAAA-MM-DD
const ANIO = HOY.slice(0, 4);

// Escribe solo si el contenido cambió (evita commits innecesarios)
function escribir(ruta, contenido) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  if (existe(ruta)) {
    if (leer(ruta) === contenido) { conteo.iguales++; return false; }
    conteo.actualizados++;
  } else {
    conteo.creados++;
  }
  fs.writeFileSync(ruta, contenido);
  return true;
}

function esc(t) {
  return String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function desescapar(t) {
  return String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
const quitarEtiquetas = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const sinAcentos = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '');

// Fechas del sitemap: se guarda un "huella" de cada página; si la huella
// cambia, la fecha se actualiza a hoy; si no, se conserva la anterior.
let fechasPrevias = {};
try { fechasPrevias = JSON.parse(leer(archivoFechas)); } catch (e) { /* primera vez */ }
const fechasNuevas = {};
function fechaDe(url, huella) {
  const prev = fechasPrevias[url];
  let reg;
  if (!prev) reg = { hash: huella, fecha: HOY, creada: HOY };
  else if (prev.hash !== huella) reg = { hash: huella, fecha: HOY, creada: prev.creada || prev.fecha };
  else reg = prev;
  fechasNuevas[url] = reg;
  return reg;
}

// Una página que es copia de la portada tiene su canonical apuntando a "/"
function esCopiaDePortada(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  return !!m && m[1].replace(/\/+$/, '') === DOMINIO;
}

// ------------------------------------------------------------
// 3. MARKDOWN → HTML (sin librerías externas)
// ------------------------------------------------------------
const urlSegura = (u) => /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(u);

function enLinea(texto) {
  const guardados = [];
  // código en línea (se protege antes de escapar)
  let s = texto.replace(/`([^`]+)`/g, (m, c) => {
    guardados.push('<code>' + esc(c) + '</code>');
    return '\u0000' + (guardados.length - 1) + '\u0000';
  });
  s = esc(s);
  // imágenes
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) =>
    urlSegura(desescapar(src)) ? '<img src="' + src + '" alt="' + alt + '" loading="lazy">' : m);
  // enlaces
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
    if (!urlSegura(desescapar(u))) return m;
    const externo = /^https?:\/\//i.test(desescapar(u)) && !desescapar(u).startsWith(DOMINIO);
    return '<a href="' + u + '"' + (externo ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + t + '</a>';
  });
  // negritas y cursivas
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => guardados[Number(i)]);
}

function mdAHtml(md) {
  const lineas = md.split('\n');
  const salida = [];
  let parrafo = [];
  let h1Visto = false;
  let i = 0;
  const cerrar = () => {
    if (parrafo.length) { salida.push('<p>' + enLinea(parrafo.join(' ')) + '</p>'); parrafo = []; }
  };
  while (i < lineas.length) {
    const t = lineas[i].trim();
    if (!t) { cerrar(); i++; continue; }

    if (/^```/.test(t)) { // bloque de código
      cerrar();
      const buf = [];
      i++;
      while (i < lineas.length && !/^```/.test(lineas[i].trim())) { buf.push(lineas[i]); i++; }
      i++;
      salida.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }
    let m = t.match(/^(#{1,6})\s+(.+?)\s*#*$/); // encabezados
    if (m) {
      cerrar();
      let nivel = m[1].length;
      if (nivel === 1) { if (h1Visto) nivel = 2; h1Visto = true; }
      salida.push('<h' + nivel + '>' + enLinea(m[2]) + '</h' + nivel + '>');
      i++; continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { cerrar(); salida.push('<hr>'); i++; continue; }
    if (/^>/.test(t)) { // cita
      cerrar();
      const buf = [];
      while (i < lineas.length && /^>/.test(lineas[i].trim())) { buf.push(lineas[i].trim().replace(/^>\s?/, '')); i++; }
      salida.push('<blockquote><p>' + enLinea(buf.join(' ')) + '</p></blockquote>');
      continue;
    }
    if (/^[-*+]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) { // listas
      cerrar();
      const ordenada = /^\d+[.)]\s+/.test(t);
      const re = ordenada ? /^\d+[.)]\s+(.*)$/ : /^[-*+]\s+(.*)$/;
      const items = [];
      while (i < lineas.length) {
        const lt = lineas[i].trim();
        const mm = lt.match(re);
        if (mm) { items.push(mm[1]); i++; }
        else if (lt && /^\s{2,}\S/.test(lineas[i]) && items.length) { items[items.length - 1] += ' ' + lt; i++; }
        else break;
      }
      const etiqueta = ordenada ? 'ol' : 'ul';
      salida.push('<' + etiqueta + '>' + items.map((x) => '<li>' + enLinea(x) + '</li>').join('') + '</' + etiqueta + '>');
      continue;
    }
    parrafo.push(t);
    i++;
  }
  cerrar();
  return salida.join('\n');
}

// Datos opcionales al inicio de la guía:
// ---
// title: Título
// description: Descripción para Google
// categoria: Retiro
// ---
function separarDatos(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, cuerpo: md };
  const meta = {};
  m[1].split('\n').forEach((l) => {
    const kv = l.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ_-]+)\s*:\s*(.+)$/);
    if (kv) meta[sinAcentos(kv[1]).toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '');
  });
  return { meta, cuerpo: md.slice(m[0].length) };
}

function textoPlanoMd(t) {
  return t.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim();
}

function resumenDe(cuerpo) {
  const bloques = cuerpo.split(/\n{2,}/).map((b) => b.trim()).filter((b) =>
    b && !/^#{1,6}\s/.test(b) && !/^```/.test(b) && !/^[-*+]\s/.test(b) && !/^\d+[.)]\s/.test(b) &&
    !/^>/.test(b) && !/^(-{3,}|\*{3,})$/.test(b) && !/^(Rafael Jim[eé]nez|Por\s)/i.test(b));
  let t = '';
  for (const b of bloques) { const p = textoPlanoMd(b); if (p.length >= 40) { t = p; break; } }
  if (t.length > 155) {
    t = t.slice(0, 155);
    t = t.slice(0, t.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
  }
  return t;
}

// ------------------------------------------------------------
// 4. PLANTILLA DE PÁGINA (encabezado, pie, estilos)
// ------------------------------------------------------------
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.7;color:#1f2937;background:#f8f9fc;font-size:1.05rem}
a{color:#2a5298}
.cab{background:linear-gradient(135deg,#1e3c72,#4b2e83);color:#fff;padding:14px 20px}
.cab-in{max-width:960px;margin:0 auto;display:flex;flex-wrap:wrap;gap:10px 24px;align-items:center;justify-content:space-between}
.logo{font-weight:800;letter-spacing:.5px;color:#fff;text-decoration:none;font-size:1.2rem}
.cab nav{display:flex;flex-wrap:wrap;gap:6px 18px}
.cab nav a{color:#fff;text-decoration:none;font-size:.95rem;opacity:.95}
.cab nav a:hover{text-decoration:underline}
main{max-width:820px;margin:0 auto;padding:28px 20px 10px}
.migas{font-size:.9rem;color:#4b5563;margin-bottom:14px}
.migas a{color:#4b2e83}
h1{color:#1e3c72;font-size:1.9rem;line-height:1.3;margin-bottom:14px}
h2{color:#1e3c72;font-size:1.4rem;margin:26px 0 10px;line-height:1.35}
h3{color:#4b2e83;font-size:1.15rem;margin:20px 0 8px}
p,ul,ol,blockquote,pre{margin-bottom:14px}
ul,ol{padding-left:24px}
li{margin-bottom:6px}
blockquote{border-left:4px solid #4b2e83;background:#fff;padding:10px 16px;color:#374151}
img{max-width:100%;height:auto}
hr{border:0;border-top:1px solid #e5e7eb;margin:22px 0}
.cta{background:#fff;border:1px solid #e5e7eb;border-top:4px solid #2a5298;border-radius:10px;padding:20px;margin:30px 0;text-align:center}
.cta h2{margin-top:0}
.btn{display:inline-block;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;margin:6px}
.btn-wa{background:#1fa855}
.btn-az{background:#2a5298}
.nav-guias{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;margin:10px 0 30px;font-size:.95rem}
.pie{background:#1a1a2e;color:#d1d5db;padding:30px 20px;font-size:.92rem;text-align:center;line-height:1.6}
.pie a{color:#fff}
.pie p{max-width:820px;margin:0 auto 10px}
.buscar{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:1rem;margin:10px 0 20px}
.lista{list-style:none;padding:0}
.lista li{background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px}
.lista a{display:block;padding:12px 14px;text-decoration:none;color:#1e3c72;font-weight:600}
.lista a:hover{background:#eef2ff}
`;

function cabeza({ titulo, descripcion, canonical, tipo, jsonld }) {
  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
${MARCA_ROBOT}
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<meta name="author" content="${esc(AGENTE)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:locale" content="es_MX">
<meta property="og:site_name" content="${esc(MARCA)}">
<meta property="og:type" content="${tipo}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${DOMINIO}/rafael-perfil.jpg">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/rafael-perfil.jpg" type="image/jpeg">
<script type="application/ld+json">${json(jsonld)}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${GA_ID}');gtag('config','${ADS_ID}');
</script>
<style>${CSS}</style>
</head>`;
}

function encabezado() {
  return `<header class="cab"><div class="cab-in">
<a class="logo" href="/">JH SEGUROS</a>
<nav aria-label="Principal">
<a href="/">Inicio</a>
<a href="/productos-vida/">Vida y Gastos Médicos</a>
<a href="/danos/">Autos y Daños</a>
<a href="/recursos/">Guías</a>
<a href="/#contacto-form">Contacto</a>
</nav></div></header>`;
}

function pie() {
  return `<footer class="pie">
<p><strong>${esc(AGENTE)}</strong> · Agente de Seguros ${esc(CEDULAS)} (CNSF)</p>
<p>Atención en todo México · Presencia en Reynosa y Ciudad Victoria, Tamaulipas</p>
<p>Email: <a href="mailto:${CORREO}">${CORREO}</a> · Teléfono: <a href="tel:${TELEFONO_LINK}">${TELEFONO_VISIBLE}</a></p>
<p>* La información en este sitio web es de carácter orientativo. Las coberturas, beneficios y exclusiones definitivas están sujetas a las condiciones generales de las pólizas emitidas por cada compañía aseguradora.</p>
<p>Este sitio usa Google Analytics para medir visitas. Consulta el <a href="/privacidad/">Aviso de Privacidad</a> · <a href="/reserva-datos.pdf" target="_blank" rel="noopener noreferrer">Política de Reserva de Datos (ARCO)</a></p>
<p>&copy; ${ANIO} ${esc(AGENTE)} - Todos los derechos reservados</p>
</footer>
<script>
document.addEventListener('click',function(e){
  var a=e.target.closest&&e.target.closest('a[href*="wa.me"],a[href*="whatsapp.com"]');
  if(a&&window.gtag){gtag('event','click_whatsapp',{pagina:location.pathname});}
});
</script>`;
}

// ------------------------------------------------------------
// 5. LECTURA DE LO QUE YA EXISTE EN EL SITIO
// ------------------------------------------------------------
function datosDeHtml(html) {
  const t = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const d = (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || [])[1] || '';
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '';
  const titulo = desescapar(quitarEtiquetas(h1)) || desescapar(t).replace(/\s*\|\s*JH.*$/i, '');
  return { titulo, descripcion: desescapar(d) };
}

function ordenGuia(slug) {
  const m = slug.match(/jhs-(\d+)/i);
  return m ? parseInt(m[1], 10) : 9999;
}

function categoriaDe(slug, meta) {
  if (meta && meta.categoria) return meta.categoria;
  const s = sinAcentos(slug.replace(/^jhs-\d+_*/i, '').replace(/[-_]+/g, ' ')).toLowerCase();
  if (/sgmm|gastos medicos|gmm|deducible|coaseguro|hospital|maternidad|dental|medicamentos|padecimientos|terapia|periodo de espera|cancer|quimioterapia|extranjero|aseguro mi cuerpo/.test(s)) return 'Gastos Médicos Mayores';
  if (/ppr|retir|afore|udis|imss|modalidad|aportar|jubil/.test(s)) return 'Retiro y ahorro (PPR)';
  if (/educativ|universidad|segubeca|colegiatura|hijo|nino|estudiar/.test(s)) return 'Seguro educativo (SeguBeca)';
  if (/auto|capufe|texas|huracan|casa|pyme|carretera/.test(s)) return 'Autos, hogar y negocio';
  if (/vida|beneficiario|invalidez|enfermedad terminal|organo|impuestos|mujer/.test(s)) return 'Seguros de vida';
  return 'Dudas generales sobre seguros';
}
const ORDEN_CATEGORIAS = [
  'Gastos Médicos Mayores', 'Retiro y ahorro (PPR)', 'Seguro educativo (SeguBeca)',
  'Seguros de vida', 'Autos, hogar y negocio', 'Dudas generales sobre seguros'
];

// ------------------------------------------------------------
// 6. PÁGINA DE UNA GUÍA
// ------------------------------------------------------------
function paginaGuia({ slug, titulo, descripcion, cuerpoHtml, reg, previa, siguiente }) {
  const canonical = DOMINIO + '/recursos/' + slug + '/';
  const tituloPagina = titulo + ' | ' + MARCA;
  const textoWa = 'Hola Rafael, tengo una duda sobre la guía: ' + titulo;
  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: titulo.slice(0, 110), description: descripcion, inLanguage: 'es-MX',
      datePublished: reg.creada, dateModified: reg.fecha,
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      image: DOMINIO + '/rafael-perfil.jpg',
      author: { '@type': 'Person', name: AGENTE, jobTitle: 'Intermediario de Seguros' },
      publisher: { '@type': 'Organization', name: MARCA, url: DOMINIO + '/' }
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: DOMINIO + '/' },
        { '@type': 'ListItem', position: 2, name: 'Guías', item: DOMINIO + '/recursos/' },
        { '@type': 'ListItem', position: 3, name: titulo, item: canonical }
      ]
    }
  ];
  const nav = (previa || siguiente) ? `<nav class="nav-guias" aria-label="Más guías">
<span>${previa ? '← <a href="/recursos/' + previa.slug + '/">' + esc(previa.titulo) + '</a>' : ''}</span>
<span>${siguiente ? '<a href="/recursos/' + siguiente.slug + '/">' + esc(siguiente.titulo) + '</a> →' : ''}</span>
</nav>` : '';
  return cabeza({ titulo: tituloPagina, descripcion, canonical, tipo: 'article', jsonld }) + `
<body>
${encabezado()}
<main>
<p class="migas"><a href="/">Inicio</a> › <a href="/recursos/">Guías</a> › ${esc(titulo)}</p>
<article>
${cuerpoHtml}
</article>
<p style="font-size:.9rem;color:#4b5563">Contenido orientativo elaborado por ${esc(AGENTE)}, Agente de Seguros ${esc(CEDULAS)} (CNSF). Las coberturas, exclusiones y condiciones definitivas dependen de la póliza contratada y de las condiciones generales de cada aseguradora.</p>
<section class="cta">
<h2>¿Te quedaron dudas sobre este tema?</h2>
<p>Revisemos tu caso con calma y sin compromiso.</p>
<a class="btn btn-wa" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(textoWa)}" target="_blank" rel="noopener noreferrer">Escribirme por WhatsApp</a>
<a class="btn btn-az" href="/#contacto-form">Solicitar asesoría</a>
</section>
${nav}
</main>
${pie()}
</body>
</html>
`;
}

// ------------------------------------------------------------
// 7. PÁGINA /recursos/ (lista de guías)
// ------------------------------------------------------------
function paginaRecursos(guias) {
  const canonical = DOMINIO + '/recursos/';
  const titulo = 'Respuestas claras sobre seguros en México | ' + MARCA;
  const descripcion = 'Guías sencillas sobre gastos médicos mayores, retiro (PPR), seguro de vida, ahorro universitario, auto y más. Resuelve tus dudas antes de contratar.';
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: 'Respuestas claras sobre seguros en México', description: descripcion,
    url: canonical, inLanguage: 'es-MX',
    isPartOf: { '@type': 'WebSite', name: MARCA, url: DOMINIO + '/' }
  };
  const grupos = {};
  guias.forEach((g) => { (grupos[g.categoria] = grupos[g.categoria] || []).push(g); });
  const nombres = Object.keys(grupos).sort((a, b) => {
    const ia = ORDEN_CATEGORIAS.indexOf(a), ib = ORDEN_CATEGORIAS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const bloques = nombres.map((n) => `<section class="grupo">
<h2>${esc(n)}</h2>
<ul class="lista">
${grupos[n].map((g) => '<li class="guia-item"><a href="/recursos/' + g.slug + '/">' + esc(g.titulo) + '</a></li>').join('\n')}
</ul>
</section>`).join('\n');
  return cabeza({ titulo, descripcion, canonical, tipo: 'website', jsonld }) + `
<body>
${encabezado()}
<main>
<p class="migas"><a href="/">Inicio</a> › Guías</p>
<h1>Respuestas claras sobre seguros en México</h1>
<p>${guias.length} guías con las dudas más comunes antes de contratar: qué cubre una póliza, cómo funcionan los deducibles y coaseguros, cómo planear tu retiro o el ahorro para la universidad de tus hijos. Escritas por un agente de seguros certificado ante la CNSF.</p>
<label for="buscar" style="font-weight:600">Busca tu duda:</label>
<input id="buscar" class="buscar" type="search" placeholder="Por ejemplo: deducible, PPR, maternidad…" autocomplete="off">
${bloques}
<section class="cta">
<h2>¿No encuentras tu duda?</h2>
<p>Cuéntame tu caso y te oriento sin compromiso.</p>
<a class="btn btn-wa" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola Rafael, tengo una duda sobre seguros')}" target="_blank" rel="noopener noreferrer">Escribirme por WhatsApp</a>
<a class="btn btn-az" href="/#contacto-form">Solicitar asesoría</a>
</section>
</main>
${pie()}
<script>
// Filtro de búsqueda (sin acentos). Sin JavaScript la lista se ve completa.
(function(){
  var q=document.getElementById('buscar');
  function n(t){return t.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');}
  q.addEventListener('input',function(){
    var v=n(q.value.trim());
    document.querySelectorAll('.guia-item').forEach(function(li){li.hidden=n(li.textContent).indexOf(v)===-1;});
    document.querySelectorAll('.grupo').forEach(function(g){g.hidden=!g.querySelector('.guia-item:not([hidden])');});
  });
})();
</script>
</body>
</html>
`;
}

// ------------------------------------------------------------
// 8. PROCESO PRINCIPAL
// ------------------------------------------------------------
console.log('🤖 Robot SEO de JH Seguros — inicio (' + HOY + ')');

// 8.1 La portada debe existir (el robot ya NO la copia a otras secciones)
if (!existe(archivoIndex)) throw new Error('No se encontró index.html en la raíz del repositorio.');
const htmlPortada = leer(archivoIndex);
if (!/<title>[\s\S]+<\/title>/i.test(htmlPortada)) aviso('La portada no tiene <title>.');
if (!/rel=["']canonical["']/i.test(htmlPortada)) aviso('La portada no tiene canonical.');

// 8.2 Limpieza de duplicados exactos (de la versión anterior del robot)
function limpiarDuplicados(carpetaBase, slugs) {
  slugs.forEach((slug) => {
    const plano = path.join(carpetaBase, slug + '.html');
    const dentro = path.join(carpetaBase, slug, 'index.html');
    if (!existe(plano) || !existe(dentro)) return;
    if (leer(plano) === leer(dentro)) {
      if (LIMPIAR_DUPLICADOS_EXACTOS) {
        fs.unlinkSync(plano); conteo.borrados++;
        console.log('🧹 Duplicado exacto eliminado: ' + path.relative(raiz, plano));
      }
    } else {
      aviso('Existe ' + path.relative(raiz, plano) + ' y es distinto a ' + path.relative(raiz, dentro) + ' (posible copia vieja). Revísalo y bórralo si ya no se usa.');
    }
  });
}
limpiarDuplicados(raiz, SECCIONES.map((s) => s[0]).concat(['recursos']));
if (existe(dirRecursos)) {
  limpiarDuplicados(dirRecursos,
    fs.readdirSync(dirRecursos, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name));
}

// 8.3 Guías en Markdown
const guiasMd = [];
if (existe(dirGuias)) {
  fs.readdirSync(dirGuias).filter((f) => /\.md$/i.test(f) && !f.startsWith('.')).sort().forEach((archivo) => {
    const slug = archivo.replace(/\.md$/i, '');
    if (/[\sA-ZÁÉÍÓÚÑ]/.test(slug)) aviso('El nombre de la guía "' + archivo + '" tiene espacios o mayúsculas; en la URL conviene minúsculas y guiones.');
    const crudo = leer(path.join(dirGuias, archivo));
    const { meta, cuerpo } = separarDatos(crudo);
    const h1 = cuerpo.match(/^#\s+(.+?)\s*#*$/m);
    const titulo = meta.title || meta.titulo || (h1 ? textoPlanoMd(h1[1]) : slug.replace(/^jhs-\d+_*/i, '').replace(/[-_]+/g, ' '));
    if (!h1 && !meta.title && !meta.titulo) aviso('La guía ' + archivo + ' no tiene título (#). Se usó el nombre del archivo.');
    if (/^\s*\|.*\|\s*$/m.test(cuerpo) && /\|\s*:?-{3,}/.test(cuerpo)) aviso('La guía ' + archivo + ' contiene una tabla; este robot no convierte tablas, escríbela como lista.');
    guiasMd.push({ archivo, slug, crudo, meta, cuerpo, titulo });
  });
}
const slugsMd = new Set(guiasMd.map((g) => g.slug));

// 8.4 Quitar carpetas generadas por el robot cuyo .md ya no existe
if (existe(dirRecursos)) {
  fs.readdirSync(dirRecursos, { withFileTypes: true }).filter((d) => d.isDirectory()).forEach((d) => {
    const archivo = path.join(dirRecursos, d.name, 'index.html');
    if (existe(archivo) && leer(archivo).includes(MARCA_ROBOT) && !slugsMd.has(d.name)) {
      fs.rmSync(path.join(dirRecursos, d.name), { recursive: true, force: true });
      conteo.borrados++;
      console.log('🧹 Guía generada sin archivo .md, eliminada: recursos/' + d.name);
    }
  });
}

// 8.5 Generar / conservar cada guía
const guiasLista = []; // para /recursos/ y el sitemap
guiasMd.forEach((g) => {
  const carpeta = path.join(dirRecursos, g.slug);
  const destino = path.join(carpeta, 'index.html');
  const url = DOMINIO + '/recursos/' + g.slug + '/';
  const hechaAMano = existe(destino) && !leer(destino).includes(MARCA_ROBOT);
  if (hechaAMano && !SOBRESCRIBIR_GUIAS_EXISTENTES) {
    const html = leer(destino);
    const d = datosDeHtml(html);
    if (esCopiaDePortada(html)) aviso('recursos/' + g.slug + ' es una copia de la portada (canonical apunta a "/"). Bórrala para que el robot la cree bien.');
    fechaDe(url, hash(html));
    guiasLista.push({ slug: g.slug, titulo: d.titulo || g.titulo, categoria: categoriaDe(g.slug, g.meta), origen: 'existente' });
    return;
  }
  guiasLista.push({ slug: g.slug, titulo: g.titulo, categoria: categoriaDe(g.slug, g.meta), origen: 'md', g });
});

// guías hechas a mano que no tienen .md (también deben salir en la lista y el sitemap)
if (existe(dirRecursos)) {
  fs.readdirSync(dirRecursos, { withFileTypes: true }).filter((d) => d.isDirectory()).forEach((d) => {
    if (slugsMd.has(d.name)) return;
    const archivo = path.join(dirRecursos, d.name, 'index.html');
    if (!existe(archivo)) return;
    const html = leer(archivo);
    if (html.includes(MARCA_ROBOT)) return; // ya se eliminó arriba
    if (esCopiaDePortada(html)) { aviso('recursos/' + d.name + ' es una copia de la portada; no se incluye en el sitemap.'); return; }
    const datos = datosDeHtml(html);
    fechaDe(DOMINIO + '/recursos/' + d.name + '/', hash(html));
    guiasLista.push({ slug: d.name, titulo: datos.titulo || d.name, categoria: categoriaDe(d.name, null), origen: 'existente' });
  });
}

guiasLista.sort((a, b) => ordenGuia(a.slug) - ordenGuia(b.slug) || a.slug.localeCompare(b.slug));

// ahora sí se escriben las guías nuevas (ya con anterior / siguiente conocidos)
const descripciones = {};
guiasLista.forEach((item, idx) => {
  if (item.origen !== 'md') return;
  const g = item.g;
  const url = DOMINIO + '/recursos/' + g.slug + '/';
  const reg = fechaDe(url, hash(VERSION_PLANTILLA + '|' + g.crudo));
  let descripcion = g.meta.description || g.meta.descripcion || resumenDe(g.cuerpo);
  if (!descripcion) descripcion = 'Guía sobre ' + g.titulo + ' elaborada por ' + AGENTE + ', agente de seguros certificado ante la CNSF.';
  if (descripciones[descripcion]) aviso('Las guías ' + descripciones[descripcion] + ' y ' + g.slug + ' tienen la misma descripción. Agrega "description:" al inicio de una de ellas.');
  descripciones[descripcion] = g.slug;
  const hayH1 = /^#\s+/m.test(g.cuerpo);
  const cuerpoHtml = (hayH1 ? '' : '<h1>' + esc(g.titulo) + '</h1>\n') + mdAHtml(g.cuerpo);
  const html = paginaGuia({
    slug: g.slug, titulo: g.titulo, descripcion, cuerpoHtml, reg,
    previa: guiasLista[idx - 1], siguiente: guiasLista[idx + 1]
  });
  escribir(path.join(dirRecursos, g.slug, 'index.html'), html);
});
console.log('🤖 Guías: ' + guiasLista.length + ' en total (' + guiasLista.filter((g) => g.origen === 'md').length + ' generadas por el robot).');

// 8.6 Página /recursos/ (lista de guías)
guiasLista.forEach((g) => { if (!g.categoria) g.categoria = 'Dudas generales sobre seguros'; });
const htmlRecursos = paginaRecursos(guiasLista);
const huellaRecursos = hash(VERSION_PLANTILLA + '|' + guiasLista.map((g) => g.slug + g.titulo).join('|'));
const rutaRecursos = path.join(dirRecursos, 'index.html');
if (existe(rutaRecursos) && !leer(rutaRecursos).includes(MARCA_ROBOT)) {
  console.log('ℹ️  recursos/index.html anterior será reemplazado por la lista generada por el robot.');
}
escribir(rutaRecursos, htmlRecursos);
fechaDe(DOMINIO + '/recursos/', huellaRecursos);

// 8.7 Secciones: el robot solo las revisa (no las modifica)
const seccionesActivas = [];
SECCIONES.forEach(([slug, prioridad]) => {
  const archivo = path.join(raiz, slug, 'index.html');
  if (!existe(archivo)) { aviso('Falta la sección /' + slug + '/ (no existe ' + slug + '/index.html). No se incluye en el sitemap.'); return; }
  const html = leer(archivo);
  if (esCopiaDePortada(html) || html === htmlPortada) {
    aviso('/' + slug + '/ es una copia de la portada (canonical apunta a "/"). No se incluye en el sitemap. Crea su propia página o elimina la carpeta.');
    return;
  }
  seccionesActivas.push({ slug, prioridad });
  fechaDe(DOMINIO + '/' + slug + '/', hash(html));
});
fechaDe(DOMINIO + '/', hash(htmlPortada));

// 8.8 Sitemap
const urls = [{ loc: DOMINIO + '/', prioridad: 1.0 }];
urls.push({ loc: DOMINIO + '/recursos/', prioridad: 0.8 });
seccionesActivas.forEach((s) => urls.push({ loc: DOMINIO + '/' + s.slug + '/', prioridad: s.prioridad }));
guiasLista.forEach((g) => urls.push({ loc: DOMINIO + '/recursos/' + g.slug + '/', prioridad: 0.7 }));

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
urls.forEach((u) => {
  const reg = fechasNuevas[u.loc];
  xml += '  <url><loc>' + esc(u.loc) + '</loc><lastmod>' + (reg ? reg.fecha : HOY) + '</lastmod><priority>' + u.prioridad.toFixed(1) + '</priority></url>\n';
});
xml += '</urlset>\n';
escribir(archivoSitemap, xml);

// 8.9 Guardar las fechas para la próxima ejecución
const ordenadas = {};
Object.keys(fechasNuevas).sort().forEach((k) => { ordenadas[k] = fechasNuevas[k]; });
escribir(archivoFechas, JSON.stringify(ordenadas, null, 2) + '\n');

// ------------------------------------------------------------
// 9. RESUMEN
// ------------------------------------------------------------
console.log('🤖 Sitemap: ' + urls.length + ' URLs.');
console.log('🤖 Archivos → creados: ' + conteo.creados + ' · actualizados: ' + conteo.actualizados +
  ' · sin cambios: ' + conteo.iguales + ' · duplicados borrados: ' + conteo.borrados);
if (avisos.length) {
  console.log('\n⚠️  AVISOS (' + avisos.length + '): revisa estos puntos en el registro de GitHub Actions.');
} else {
  console.log('✅ Sin avisos.');
}
