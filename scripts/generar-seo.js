const fs = require('fs');
const path = require('path');

const domain = 'https://jhseguros.mx';
const rootDir = process.cwd();
const guiasDir = path.join(rootDir, 'Guias');
const recursosDir = path.join(rootDir, 'recursos');
const mainHtmlPath = path.join(rootDir, 'index.html');

// Función para crear carpeta física y guardar index.html
function saveIndexHtml(targetDirPath, content) {
    if (!fs.existsSync(targetDirPath)) {
        fs.mkdirSync(targetDirPath, { recursive: true });
    }
    fs.writeFileSync(path.join(targetDirPath, 'index.html'), content);
}

// 1. GENERACIÓN DE CARPETAS DE SECCIONES (/AUTO/INDEX.HTML Y AUTO.HTML)
if (fs.existsSync(mainHtmlPath)) {
    const indexContent = fs.readFileSync(mainHtmlPath, 'utf8');
    const listaSecciones = [
        'danos', 'productos-vida', 'auto', 'embarcaciones', 'hogar', 'negocio', 'rc',
        'vida', 'mujer', 'ppr', 'educacion', 'gmm', 'hospitales', 'autorizaciones',
        'certificaciones', 'recursos', 'redes', 'contacto-form', 'privacidad',
        'mision', 'vision', 'valor'
    ];

    listaSecciones.forEach(sec => {
        saveIndexHtml(path.join(rootDir, sec), indexContent);
        fs.writeFileSync(path.join(rootDir, `${sec}.html`), indexContent);
    });
    console.log('🤖 Robot: Carpetas de secciones generadas correctamente.');
}

// 2. GENERACIÓN DE CARPETAS DE GUIAS (/RECURSOS/SLUG/INDEX.HTML Y .HTML)
if (fs.existsSync(guiasDir)) {
    const files = fs.readdirSync(guiasDir);
    files.forEach(file => {
        if (file.endsWith('.md') && !file.startsWith('.')) {
            const rawName = file.replace('.md', '');
            const mdPath = path.join(guiasDir, file);
            let content = fs.readFileSync(mdPath, 'utf8');

            const titleMatch = content.match(/^#\s+(.+)$/m);
            let title = titleMatch ? titleMatch[1].trim() : rawName.replace(/[-_]/g, ' ');
            title = title.replace(/\].*$/, '').replace(/^\[/, '');

            let htmlBody = content
                .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
                .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
                .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .split(/\n\n+/).map(p => p.startsWith('<h') ? p : '<p>' + p + '</p>').join('\n');

            const htmlFull = `<!DOCTYPE html>
<html lang="es-MX">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | JH División SEGUROS</title>
    <meta name="description" content="Guía especializada sobre ${title}. Asesoría patrimonial y seguros en México por el Agente Certificado Rafael Jiménez Sánchez.">
    <link rel="canonical" href="${domain}/recursos/${rawName}">
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1e293b; max-width: 850px; margin: 0 auto; padding: 20px; }
        header { border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
        .logo { font-weight: bold; font-size: 1.2rem; color: #0f172a; text-decoration: none; }
        h1 { color: #0f172a; font-size: 1.8rem; line-height: 1.3; }
        .cta-btn { display: inline-block; background-color: #25d366; color: white; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-weight: bold; margin-top: 20px; }
        footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 0.9rem; color: #64748b; text-align: center; }
    </style>
</head>
<body>
    <header>
        <a href="/" class="logo">JH DIVISION SEGUROS</a>
        <a href="/recursos" style="color: #2563eb; text-decoration: none;">← Volver a Guías</a>
    </header>
    <main>
        ${htmlBody}
        <div style="text-align: center; margin-top: 30px;">
            <a href="https://wa.me/528343117556?text=Hola%20Rafael,%20necesito%20asesoria%20sobre%20${encodeURIComponent(title)}" class="cta-btn" target="_blank">Consultar con un Agente Certificado</a>
        </div>
    </main>
    <footer>
        <p>© ${new Date().getFullYear()} JH Asesorías - Agente Certificado CNSF Rafael Jiménez Sánchez.</p>
    </footer>
</body>
</html>`;

            // Guarda tanto en /recursos/slug/index.html como en /recursos/slug.html
            saveIndexHtml(path.join(recursosDir, rawName), htmlFull);
            fs.writeFileSync(path.join(recursosDir, `${rawName}.html`), htmlFull);
        }
    });
    console.log('🤖 Robot: Carpetas de guías /recursos/slug/index.html generadas.');
}

// 3. CONSTRUCCIÓN DEL SITEMAP.XML COMPLETO
let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
xml += '  <url>\n    <loc>' + domain + '/</loc>\n    <priority>1.0</priority>\n  </url>\n';

const seccionesFijas = ['danos', 'productos-vida', 'auto', 'embarcaciones', 'hogar', 'negocio', 'rc', 'vida', 'mujer', 'ppr', 'educacion', 'gmm', 'hospitales', 'autorizaciones', 'certificaciones', 'recursos', 'redes', 'contacto-form', 'privacidad', 'mision', 'vision', 'valor'];
seccionesFijas.forEach(seccion => {
    xml += '  <url>\n';
    xml += '    <loc>' + domain + '/' + seccion + '</loc>\n';
    xml += '    <priority>0.9</priority>\n';
    xml += '  </url>\n';
});

if (fs.existsSync(guiasDir)) {
    const files = fs.readdirSync(guiasDir);
    files.forEach(file => {
        if (file.endsWith('.md') && !file.startsWith('.')) {
            const rawName = file.replace('.md', '');
            xml += '  <url>\n';
            xml += '    <loc>' + domain + '/recursos/' + rawName + '</loc>\n';
            xml += '    <priority>0.8</priority>\n';
            xml += '  </url>\n';
        }
    });
}

xml += '</urlset>';
fs.writeFileSync(path.join(rootDir, 'sitemap.xml'), xml);
console.log('🤖 Robot: Sitemap.xml maestro generado exitosamente.');
