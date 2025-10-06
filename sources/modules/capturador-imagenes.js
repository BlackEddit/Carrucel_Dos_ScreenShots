// Módulo de captura y procesamiento real de imágenes
// Maneja viewport, navegación, screenshot con recorte, división y reintentos
import path from 'path';
import sharp from 'sharp';

// Configuración del viewport para capturas (3200x1800)
const VIEWPORT = {
  width: 3200,
  height: 1800,
  deviceScaleFactor: 1
};

// Función para dividir una imagen en 2 partes horizontales usando Sharp
async function dividirImagen(page, shotsDir, targetId, section) {
  try {
    // Capturar zona optimizada con coordenadas PERFECTAS
    const fullScreenshot = await page.screenshot({
      clip: {
        x: 15,          // Margen izquierdo perfecto
        y: 72,          // Header exacto - ajuste perfecto
        width: 1870,    // Ancho perfecto para grilla completa
        height: 1320,   // Alto perfecto para 4 filas completas
      },
      encoding: 'binary'
    });

    // Dimensiones optimizadas para división HORIZONTAL perfecta
    const fullWidth = 1870;   // Ancho perfecto
    const fullHeight = 1320;  // Alto perfecto (4 filas completas)
    const halfHeight = section === 'top' ? 670 : 650;   // PRUEBA: Top 670px, Bottom 650px

    let cropY = 0;
    if (section === 'top') {
      cropY = 0; // Mitad superior - PRUEBA (670px)
    } else if (section === 'bottom') {
      cropY = 670; // Mitad inferior - PRUEBA (comienza en 670px)
    }

    // Procesar y guardar la sección específica
    const outputPath = path.join(shotsDir, `${targetId}.png`);
    
    await sharp(fullScreenshot)
      .extract({
        left: 0,
        top: cropY,
        width: fullWidth,
        height: halfHeight
      })
      .png()
      .toFile(outputPath);

    console.log(`✂️  ${targetId} (${section === 'top' ? 'superior (2 filas)' : 'inferior (2 filas)'}) guardado: ${fullWidth}x${halfHeight}px`);
    return true;

  } catch (error) {
    console.error(`❌ Error dividiendo imagen para ${targetId}:`, error.message);
    return false;
  }
}

// Función principal de captura con reintentos - MODIFICADA para división
// Parámetros:
// - browser: instancia de Puppeteer
// - target: objeto {id, url} del dashboard
// - waitTime: tiempo de espera para carga completa (ms)
// - shotsDir: directorio donde guardar screenshots
// - auth: objeto con headers y cookies para autenticación
// - pageTimeout: timeout para navegación
// - maxRetries: número máximo de reintentos
// - isInitialLoad: flag para logging de primera carga
async function capturarConReintentos(browser, target, waitTime, shotsDir, auth = {}, pageTimeout = 90000, maxRetries = 2, isInitialLoad = false) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let page;
    try {
      console.log(`Navegando a ${target.id} (${target.section}) (intento ${attempt}/${maxRetries}): ${target.url}`);
      if (isInitialLoad) {
        console.log(`🎯 Carga inicial - esperando ${waitTime/1000}s para renderizado completo`);
      }
      
      // Crear nueva página con viewport configurado
      page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      
      // Configurar timeouts específicos
      page.setDefaultNavigationTimeout(120000); // 2 minutos para navegación
      page.setDefaultTimeout(60000); // 1 minuto para otras operaciones

      // Aplicar headers de autenticación si existen
      if (auth.headers && Object.keys(auth.headers).length) {
        await page.setExtraHTTPHeaders(auth.headers);
      }

      // Inyectar cookies de autenticación si existen
      if (auth.cookies && auth.cookies.length) {
        await page.setCookie(...auth.cookies);
      }

      // Navegar al dashboard y esperar que la red esté tranquila
      await page.goto(target.url, { 
        waitUntil: 'networkidle2',
        timeout: pageTimeout
      });
      
      console.log(`Esperando carga completa para ${target.id} (${target.section})... (${waitTime/1000}s)`);
      
      // Esperar tiempo base de carga
      await new Promise(res => setTimeout(res, waitTime));
      
      // MEJORA: Espera inteligente específica para Dynatrace
      console.log(`🔍 Verificando elementos críticos de Dynatrace para ${target.id}...`);
      
      // Esperar hasta que los elementos críticos estén presentes y cargados
      try {
        // Esperar a que aparezcan elementos específicos de Dynatrace
        await page.waitForFunction(() => {
          // Verificar que hay contenido visible (no solo loading)
          const charts = document.querySelectorAll('[class*="chart"], [class*="Chart"], [class*="tile"], [class*="Tile"], [data-testid*="chart"], [data-testid*="tile"]');
          const svgElements = document.querySelectorAll('svg');
          const canvasElements = document.querySelectorAll('canvas');
          
          // Verificar que no hay spinners/loading activos
          const loadingElements = document.querySelectorAll('[class*="loading"], [class*="Loading"], [class*="spinner"], [class*="Spinner"], .dt-loading');
          const activeLoading = Array.from(loadingElements).filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          });
          
          console.log(`[DEBUG] Charts: ${charts.length}, SVGs: ${svgElements.length}, Canvas: ${canvasElements.length}, Loading: ${activeLoading.length}`);
          
          // Debe haber contenido visual y no elementos de loading activos
          return (charts.length > 0 || svgElements.length > 5 || canvasElements.length > 0) && activeLoading.length === 0;
        }, { timeout: 45000 }); // 45 segundos máximo
        
        console.log(`✅ Elementos de Dynatrace detectados para ${target.id}`);
        
      } catch (e) {
        console.log(`⚠️ Timeout esperando elementos específicos, continuando con captura de ${target.id}`);
      }
      
      // Espera adicional para asegurar renderizado completo de gráficos
      console.log(`⏳ Espera adicional de renderizado para ${target.id}... (15s)`);
      await new Promise(res => setTimeout(res, 15000));
      
      // Verificar una vez más si hay elementos de loading visibles
      try {
        const stillLoading = await page.$$eval('[class*="loading"], [class*="Loading"], [class*="spinner"], [class*="Spinner"], .dt-loading', 
          elements => elements.filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          }).length
        );
        
        if (stillLoading > 0) {
          console.log(`⏳ ${target.id} (${target.section}) aún tiene ${stillLoading} elementos cargando, esperando 20s adicionales...`);
          await new Promise(res => setTimeout(res, 20000));
        }
      } catch (e) {
        // Si falla la evaluación, continuar normalmente
        console.log(`⚠️ Error verificando loading elements para ${target.id}, continuando...`);
      }
      
      // NUEVA LÓGICA: Dividir la captura según la sección
      const success = await dividirImagen(page, shotsDir, target.id, target.section);
      
      if (success) {
        console.log(`[OK] ${target.id} (${target.section}) capturado y dividido exitosamente`);
      } else {
        throw new Error(`Falló la división de imagen para ${target.id}`);
      }
      
      // Limpieza agresiva de memoria después de captura exitosa
      if (global.gc) {
        global.gc();
        console.log(`🧹 Limpieza de memoria ejecutada para ${target.id}`);
      }
      
      return true;
      
    } catch (error) {
      console.error(`[FAIL] ${target.id} (${target.section}) (intento ${attempt}/${maxRetries}):`, error.message);
      if (attempt === maxRetries) {
        return false;
      }
      // Esperar 5 segundos antes del siguiente intento
      await new Promise(res => setTimeout(res, 5000));
    } finally {
      // Cerrar página para liberar memoria
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.log(`Error cerrando página ${target.id}:`, e.message);
        }
      }
    }
  }
  return false;
}

export { capturarConReintentos, VIEWPORT };
