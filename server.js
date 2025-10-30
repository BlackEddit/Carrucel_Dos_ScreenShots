// BACKEND < Captura ScreenShots, cada 14 segundos con Puppeteer

// CONFIGURAR ZONA HORARIA DE MÉXICO ANTES DE IMPORTAR OTROS MÓDULOS
process.env.TZ = 'America/Mexico_City';

import express from 'express'; // Framework para servidor web
import fs from 'fs'; // Manejo de archivos
import path from 'path'; // Manejo de rutas
import { fileURLToPath } from 'url'; // Utilidad para rutas en ES Modules
import puppeteer from 'puppeteer-core'; // Navegador automatizado para capturas
import chromium from '@sparticuz/chromium'; // Para producción en Render
import dotenv from 'dotenv'; // Para leer variables de entorno
import { capturarConReintentos, VIEWPORT } from './sources/modules/capturador-imagenes.js'; // Módulo de captura y procesamiento de imágenes
dotenv.config();

// DIAGNOSTICO: Registrar info del proceso al iniciar
const now = new Date();
console.log('🔍 DIAGNÓSTICO - PID:', process.pid, 'UPTIME:', process.uptime().toFixed(2) + 's');
console.log('🕒 TIMESTAMP UTC:', now.toISOString());
console.log('🌍 TIMESTAMP LOCAL:', now.toString());
console.log('⏰ TIMEZONE OFFSET:', now.getTimezoneOffset(), 'minutos desde UTC');
console.log('🌎 TIMEZONE:', Intl.DateTimeFormat().resolvedOptions().timeZone);

// FUNCIONES DE TIEMPO CONSISTENTES PARA MÉXICO
function getMexicoTime() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    local: now.toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }),
    timestamp: now.getTime(),
    mexicoOffset: -6 // UTC-6 (o UTC-5 en horario de verano)
  };
}

function formatTimeForMexico(date) {
  return date.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit', 
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// DIAGNOSTICO: Registrar eventos del proceso
process.on('exit', code => console.log('⚠️ EXIT - Código:', code, 'TS:', new Date().toISOString()));
process.on('SIGINT', () => console.log('⚠️ SIGINT recibido - TS:', new Date().toISOString()));
process.on('SIGTERM', () => console.log('⚠️ SIGTERM recibido - TS:', new Date().toISOString()));

// CONFIGURACION DE REGLAS //////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Obtiene la ruta actual del archivo y su carpeta, 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1) Configura aquí tus URLs (orden = orden del carrusel) desde variables de entorno
// Usa DASHBOARD_URLS en .env, separadas por ";;;"
// Para depuración.
//console.log('[DEBUG] DASHBOARD_URLS raw:', process.env.DASHBOARD_URLS); // Ver cuántas URLs se están procesando
// NUEVA CONFIGURACIÓN - Una sola URL que se dividirá en 2 dashboards
const SINGLE_URL = process.env.DASHBOARD_URLS?.replace(/^"(.*)"$/, '$1') || '';
const TARGETS = [
  { id: 'dashboard1', url: SINGLE_URL, section: 'top' },     // Mitad superior
  { id: 'dashboard2', url: SINGLE_URL, section: 'bottom' }   // Mitad inferior
];
console.log(`🎯 Configuración: 1 URL dividida en 2 dashboards horizontalmente`);
console.log(`📄 URL fuente: ${SINGLE_URL}`);
console.log(`🔧 Dashboard 1: mitad superior | Dashboard 2: mitad inferior`);

// 2) Intervalo de refresco de capturas (minutos)
// Cada cuánto tiempo se actualizan las capturas
const CAPTURE_EVERY_MIN = 2; // 2 minutos para capturas rápidas (testing)

// 3) Timeout de carga por página (ms) - REDUCIDO para captura inicial más rápida
// Tiempo máximo para que Puppeteer navegue a la página
const PAGE_TIMEOUT_MS = 90_000; // 1.5 minutos para dashboards pesados

// 4) Configuración de captura SECUENCIAL optimizada para 512MB RAM
const MAX_CONCURRENT_CAPTURES = 1; // Solo 1 dashboard por vez para evitar OOM
const WAIT_TIME_PER_DASHBOARD = 20000; // 20 segundos - aumentado para Dynatrace complejo

// 6) Opcional: headers/cookies de sesión (solo si tu seguridad lo permite)
// Si necesitas autenticación, agrega aquí tus cookies o headers


//////////////////////////////////////////////////////////////////////////////////////////////////////////////



const AUTH = {
  cookies: [
    // { name: 'DTCookie', value: 'XXXX', domain: 'TU-DT', path: '/' }
  ],
  headers: {
    // 'Authorization': 'Api-Token XXXXX',
  }
};

// Inicializa el servidor Express y sirve archivos estáticos
const app = express();

// Headers anti-cache para imágenes de screenshots
app.use('/shots', (req, res, next) => {
  // Prevenir cache en navegador y proxies
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    'Last-Modified': new Date().toUTCString(),
    'ETag': `"${Date.now()}-${Math.random().toString(36).substr(2, 9)}"`
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Carpeta donde se guardan las capturas
const shotsDir = path.join(__dirname, 'public', 'shots');
fs.mkdirSync(shotsDir, { recursive: true });

// Función para crear placeholder mientras se cargan los dashboards reales
function createPlaceholderImages() {
  console.log('🖼️  Creando imágenes placeholder para inicio inmediato...');
  
  // Identificar dashboards que necesitan placeholder
  const missingDashboards = [];
  
  TARGETS.forEach(target => {
    const imagePath = path.join(shotsDir, `${target.id}.png`);
    
    // Solo crear placeholder si no existe la imagen real
    if (!fs.existsSync(imagePath)) {
      missingDashboards.push(target.id);
      try {
        // Crear una imagen placeholder simple (usando SVG como texto)
        const placeholderSVG = `
          <svg width="2133" height="1200" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#1e2836"/>
            <text x="50%" y="45%" text-anchor="middle" fill="#d2f7d0" font-size="48" font-family="Arial">
              🔄 Cargando ${target.id}
            </text>
            <text x="50%" y="55%" text-anchor="middle" fill="#888" font-size="24" font-family="Arial">
              Capturando dashboard en tiempo real...
            </text>
          </svg>
        `;
        
        // Escribir directamente el SVG al archivo de imagen
        fs.writeFileSync(imagePath, placeholderSVG);
        console.log(`📋 Placeholder creado para ${target.id}`);
      } catch (e) {
        console.log(`⚠️  No se pudo crear placeholder para ${target.id}:`, e.message);
      }
    } else {
      console.log(`✅ Imagen existente para ${target.id}, no se necesita placeholder`);
    }
  });

  if (missingDashboards.length > 0) {
    console.log(`📊 Placeholders creados para: ${missingDashboards.join(', ')}`);
  } else {
    console.log(`✅ Todos los dashboards tienen imagen disponible, no se necesitan placeholders`);
  }
}

// Variables para tracking del progreso
let captureInProgress = false;
let captureProgress = 0;
let totalDashboards = 0;
let successfulCaptures = 0;
let failedCaptures = 0;


//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////


// Función para capturar un dashboard individual con reintentos
async function captureWithRetries(browser, target, maxRetries = 2, isInitialLoad = false) {
  const waitTime = WAIT_TIME_PER_DASHBOARD;
  
  // Llamar al módulo de captura con todos los parámetros necesarios
  const success = await capturarConReintentos(
    browser,
    target,
    waitTime,
    shotsDir,
    AUTH,
    PAGE_TIMEOUT_MS,
    maxRetries,
    isInitialLoad
  );
  
  // Actualizar contadores locales
  if (success) {
    successfulCaptures++;
  } else {
    failedCaptures++;
  }
  
  return success;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

// 📌 Archivo centinela para rastrear último dashboard capturado entre reinicios
const CAPTURE_STATE_FILE = path.join(__dirname, '.capture_state.json');

// Función para obtener el estado actual de captura
function getLastCaptureState() {
  try {
    if (fs.existsSync(CAPTURE_STATE_FILE)) {
      const data = fs.readFileSync(CAPTURE_STATE_FILE, 'utf8');
      console.log('📋 Archivo de estado encontrado');
      const state = JSON.parse(data);
      
      // Verificar que el estado es válido (puede contener lastDashboardId como campo adicional)
      if (typeof state.lastIndex !== 'number') {
        console.warn('⚠️ Estado inválido, falta lastIndex');
        state.lastIndex = -1;
      }
      
      // Log más detallado del estado recuperado
      console.log(`📊 Estado recuperado: último índice=${state.lastIndex}, timestamp=${new Date(state.timestamp).toISOString()}`);
      return state;
    } else {
      console.log('⚠️ Archivo de estado no encontrado, creando uno nuevo');
      
      // Crear el archivo con un estado inicial
      const initialState = { 
        lastIndex: -1, 
        capturedDashboards: [],
        timestamp: Date.now(), 
        pid: process.pid 
      };
      fs.writeFileSync(CAPTURE_STATE_FILE, JSON.stringify(initialState, null, 2));
      return initialState;
    }
  } catch (e) {
    console.error('❌ Error leyendo archivo de estado:', e.message);
    // Intentar eliminar el archivo corrupto
    try {
      if (fs.existsSync(CAPTURE_STATE_FILE)) {
        fs.unlinkSync(CAPTURE_STATE_FILE);
        console.log('🗑️ Archivo de estado corrupto eliminado');
      }
    } catch (err) {}
  }
  return { lastIndex: -1, capturedDashboards: [], timestamp: Date.now() };
}

// Función para guardar el estado actual de captura
function saveLastCaptureState(index) {
  try {
    // Obtener estado actual para actualizar lista de capturados
    const currentState = getLastCaptureState();
    let capturedList = currentState.capturedDashboards || [];
    
    // Verificar si este dashboard ya está en la lista de capturados
    const dashboardId = TARGETS[index].id;
    if (!capturedList.includes(dashboardId)) {
      capturedList.push(dashboardId);
    }
    
    // Usar escritura segura con archivo temporal
    const tempFile = CAPTURE_STATE_FILE + '.tmp';
    
    const state = { 
      lastIndex: index,
      lastDashboardId: dashboardId,
      capturedDashboards: capturedList,
      timestamp: Date.now(),
      pid: process.pid
    };
    
    // Escribir a archivo temporal primero
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
    
    // Renombrar para operación atómica
    fs.renameSync(tempFile, CAPTURE_STATE_FILE);
    
    console.log(`🔒 Estado guardado: último dashboard capturado = ${index} (${dashboardId})`);
    console.log(`📊 Total capturados: ${capturedList.length}/${TARGETS.length}`);
  } catch (e) {
    console.error('❌ Error guardando archivo de estado:', e.message);
  }
}

// ✨ NUEVO: Función para capturar UN SOLO dashboard - Incremental
async function captureOne(index) {
  // DIAGNOSTICO: Registrar info antes de capturar
  const mexicoTime = getMexicoTime();
  console.log(`🔍 CAPTURANDO DASHBOARD ${index+1}/${TARGETS.length} - PID: ${process.pid}`);
  console.log(`🕒 UTC: ${mexicoTime.iso} | MX: ${mexicoTime.local}`);
  
  if (index < 0 || index >= TARGETS.length) {
    console.error(`❌ Índice inválido: ${index}, rango válido: 0-${TARGETS.length-1}`);
    return false;
  }

  const target = TARGETS[index];
  console.log(`\n📸 Capturando individualmente: ${target.id}`);
  
  // Guardar estado ANTES de iniciar la captura para persistencia
  saveLastCaptureState(index);
  
  let browser;
  try {
    console.log('🌐 Iniciando navegador para captura individual...');
    
    // Detectar entorno: desarrollo (local) vs producción (Render/Heroku/etc)
    const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || !process.env.LOCALAPPDATA;
    
    let browserConfig;
    if (isProduction) {
      // Configuración para producción (Render)
      console.log('🌍 Entorno de producción detectado - usando Chromium bundled');
      browserConfig = {
        args: [
          ...chromium.args,
          '--max-old-space-size=400',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
        protocolTimeout: 180000,
      };
    } else {
      // Configuración para desarrollo (Chrome local)
      console.log('💻 Entorno de desarrollo detectado - usando Chrome local');
      browserConfig = {
        args: [
          '--max-old-space-size=400',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ],
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        protocolTimeout: 180000,
      };
    }
    
    browser = await puppeteer.launch(browserConfig);

    // Intentar captura con retries
    const result = await captureWithRetries(browser, target);
    
    // Actualizar contadores
    if (result) {
      successfulCaptures++;
      // Re-guardar estado DESPUÉS de captura exitosa
      saveLastCaptureState(index);
    } else {
      failedCaptures++;
    }
    
    console.log(`📊 Dashboard ${index+1}/${TARGETS.length} (${target.id}): ${result ? '✅ Éxito' : '❌ Fallido'}`);
    
    return result;
  } catch (e) {
    console.error(`❌ Error capturando ${target.id}:`, e.message);
    return false;
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(`✅ Navegador cerrado correctamente después de capturar ${target.id}`);
      } catch (e) {
        console.error(`⚠️ Error cerrando navegador:`, e.message);
      }
    }
    
    // Forzar liberación de memoria
    if (global.gc) {
      global.gc();
      console.log(`🧹 Memoria liberada después de captura de ${target.id}`);
    }
  }
}

// Función principal que toma capturas de todas las URLs - VERSIÓN INCREMENTAL
async function captureAll() {
  console.log(`[DEBUG] Iniciando captura INCREMENTAL de dashboards (uno por uno)`);
  console.log(`🔧 Configuración: ${WAIT_TIME_PER_DASHBOARD/1000}s por dashboard`);
  
  // Iniciar contadores
  captureInProgress = true;
  captureProgress = 0;
  successfulCaptures = 0;
  failedCaptures = 0;
  totalDashboards = TARGETS.length;
  
  const startTime = Date.now();
  
  try {
    // VERSIÓN INCREMENTAL: Capturar un dashboard a la vez
    for (let i = 0; i < TARGETS.length; i++) {
      console.log(`\n🔄 Capturando dashboard ${i+1}/${TARGETS.length}: ${TARGETS[i].id}`);
      
      await captureOne(i);
      captureProgress++;
      
      // Pequeña pausa entre dashboards para dejar respirar al sistema
      if (i < TARGETS.length - 1) {
        console.log(`⏸️ Pausa de 5 segundos antes del siguiente dashboard...`);
        await new Promise(res => setTimeout(res, 5000));
      }
    }
    
  } catch (mainError) {
    console.error('❌ Error principal en captureAll:', mainError);
  } finally {
    captureInProgress = false;
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    console.log(`\n🎉 [FINISH] Captura completada en ${duration} segundos:`);
    console.log(`   ✅ Exitosos: ${successfulCaptures}`);
    console.log(`   ❌ Fallidos: ${failedCaptures}`);
    console.log(`   📊 Total: ${totalDashboards} dashboards\n`);
  }
}

// 🚀 INICIO CON SISTEMA INCREMENTAL
console.log('\n🎯 ============ INICIANDO SISTEMA DE DASHBOARDS ============');
console.log(`📊 Total de dashboards configurados: ${TARGETS.length}`);
console.log(`💾 Modo de captura: INCREMENTAL (uno por uno)`);
console.log(`⚡ Tiempo por dashboard: ${WAIT_TIME_PER_DASHBOARD/1000} segundos`);
console.log(`🔄 Intervalo de actualización INCREMENTAL: ${CAPTURE_EVERY_MIN} minutos`);
console.log(`⏱️  Tiempo estimado para primera carga: ~${Math.round(TARGETS.length * (WAIT_TIME_PER_DASHBOARD + 5000) / 1000 / 60)} minutos`);

// Crear placeholders inmediatos para mostrar algo en el carrusel
createPlaceholderImages();

// Verificar si hay estado previo y decidir si empezar desde el inicio o continuar
const lastState = getLastCaptureState();
console.log(`🔍 Estado previo detectado:`, lastState);

// Verificar imágenes existentes
let existingImages = [];
try {
  existingImages = fs.readdirSync(shotsDir)
    .filter(file => file.endsWith('.png'))
    .map(file => file.replace('.png', ''));
  console.log(`🖼️ Imágenes existentes: ${existingImages.length}/${TARGETS.length}`);
} catch (e) {
  console.error('❌ Error verificando imágenes existentes:', e.message);
}

// Iniciar captura incremental con primera ronda
const startCaptures = async (forceRefresh = false) => {
  // Si es regeneración forzada, capturar todo desde cero
  if (forceRefresh) {
    console.log('\n🔄 REGENERACIÓN FORZADA - Capturando todos los dashboards...');
    await captureAll();
    scheduleRotatingCaptures(0);
    return;
  }
  
  // Si es un reinicio y ya tenemos dashboards, capturar solo uno y programar los siguientes
  if (lastState.lastIndex >= 0) {
    console.log(`🔄 REINICIO DETECTADO - Último dashboard capturado: ${lastState.lastIndex}`);
    console.log(`⏱️  Tiempo desde última captura: ${((Date.now() - lastState.timestamp) / 1000 / 60).toFixed(1)} minutos`);
    
    // Verificar lista de dashboards ya capturados
    const capturedList = lastState.capturedDashboards || [];
    console.log(`📊 Dashboards ya capturados: ${capturedList.length}/${TARGETS.length}`);
    
    // Empezar con el siguiente dashboard al último capturado
    let nextIndex = (lastState.lastIndex + 1) % TARGETS.length;
    console.log(`🎯 Comenzando con dashboard ${nextIndex + 1}/${TARGETS.length} (${TARGETS[nextIndex].id})`);
    
    // Capturar el siguiente dashboard
    await captureOne(nextIndex);
    
    // Programar la captura rotativa comenzando con el siguiente
    scheduleRotatingCaptures((nextIndex + 1) % TARGETS.length);
  } else {
    // Primera ejecución O placeholders detectados - capturar todo desde el inicio
    if (existingImages.length > 0) {
      console.log(`🔄 Se encontraron ${existingImages.length} imágenes (posiblemente placeholders)`);
      console.log(`🎯 Forzando captura completa inicial para reemplazar placeholders`);
    } else {
      console.log('\n🚀 Primera ejecución - Iniciando captura completa...');
    }
    
    await captureAll();
    
    // Programar actualizaciones rotativas
    scheduleRotatingCaptures(0);
  }
};

// Programar capturas rotativas (un dashboard a la vez)
function scheduleRotatingCaptures(startIndex) {
  let currentIndex = startIndex;
  
  // Cancelar intervalo previo si existe
  if (global.rotationInterval) {
    clearInterval(global.rotationInterval);
    console.log('⚠️ Intervalo previo cancelado');
  }
  
  // Calcular intervalo para que cada dashboard se actualice aproximadamente cada CAPTURE_EVERY_MIN minutos
  const interval = Math.floor(CAPTURE_EVERY_MIN * 60 * 1000 / TARGETS.length);
  console.log(`⏱️  Programando actualización rotativa: un dashboard cada ${Math.round(interval/1000)} segundos`);
  
  // Programar actualizaciones rotativas
  global.rotationInterval = setInterval(async () => {
    try {
      console.log(`\n🔄 Actualizando dashboard ${currentIndex + 1}/${TARGETS.length} (${TARGETS[currentIndex].id})`);
      
      // Guardar estado ANTES de capturar para mejor persistencia
      saveLastCaptureState(currentIndex);
      
      // Capturar solo un dashboard
      await captureOne(currentIndex);
      
      // Avanzar al siguiente dashboard
      currentIndex = (currentIndex + 1) % TARGETS.length;
      
      // IMPORTANTE: Si completó el ciclo (volvió al inicio), guardar log específico
      if (currentIndex === 0) {
        console.log(`\n🔄 CICLO COMPLETADO: Se ha actualizado todos los ${TARGETS.length} dashboards`);
        console.log(`⏱️ Timestamp ciclo completo: ${new Date().toISOString()}`);
      }
      
    } catch (e) {
      console.error('❌ Error en actualización rotativa:', e);
      // No detener el intervalo si hay un error, intentar con el siguiente
      currentIndex = (currentIndex + 1) % TARGETS.length;
    }
  }, interval);
  
  // Asegurar que el intervalo no impida que Node.js salga
  global.rotationInterval.unref();
  
  console.log(`✅ Sistema de actualización rotativa iniciado correctamente`);
  console.log(`📝 Recordatorio: El sistema guardará el último estado entre reinicios`);
}

// Iniciar el sistema
startCaptures();

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Endpoint para forzar regeneración y limpiar cache
app.get('/api/force-refresh', async (req, res) => {
  try {
    console.log('🔄 FORZANDO REGENERACIÓN - Eliminando imágenes cacheadas...');
    
    // Eliminar todas las imágenes existentes
    TARGETS.forEach(target => {
      const imagePath = path.join(shotsDir, `${target.id}.png`);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log(`🗑️  Eliminada imagen cacheada: ${target.id}.png`);
      }
    });
    
    // Resetear estado
    captureInProgress = false;
    captureProgress = 0;
    successfulCaptures = 0;
    failedCaptures = 0;
    
    // Forzar captura inmediata de todos los dashboards
    console.log('📸 Iniciando captura forzada de todos los dashboards...');
    startCaptures(true); // Pasar flag para indicar que es forzada
    
    res.json({
      success: true,
      message: 'Regeneración forzada iniciada',
      timestamp: new Date().toISOString(),
      dashboards: TARGETS.length
    });
    
  } catch (error) {
    console.error('❌ Error en regeneración forzada:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint que expone la lista actual de capturas para el front - PROGRESIVO
app.get('/api/list', (req, res) => {
  try {
    // Verificar todas las imágenes disponibles
    const availableItems = TARGETS.map(t => {
      const imagePath = path.join(shotsDir, `${t.id}.png`);
      const exists = fs.existsSync(imagePath);
      let lastModified = 0;
      let size = 0;
      
      if (exists) {
        try {
          const stats = fs.statSync(imagePath);
          lastModified = stats.mtime.getTime();
          size = stats.size;
        } catch (e) {
          console.error(`Error obteniendo stats de ${t.id}:`, e.message);
        }
      }
      
      return { 
        id: t.id, 
        img: `/shots/${t.id}.png?t=${lastModified}`, // Cache bust con timestamp real
        title: t.id,
        available: exists,
        lastModified: new Date(lastModified).toISOString(),
        size: size
      };
    });
    
    // Obtener estado actual
    const lastState = getLastCaptureState();
    const now = Date.now();
    const lastStateAge = now - lastState.timestamp;
    
    // Obtener lista de dashboards ya capturados del estado persistente
    const capturedDashboardIds = lastState.capturedDashboards || [];
    console.log(`📊 Dashboards persistidos: ${capturedDashboardIds.length}/${TARGETS.length}`);
    
    // Crear respuesta enriquecida
    const response = {
      items: availableItems, 
      generatedAt: new Date().toISOString(),
      loading: captureInProgress,
      progress: captureProgress,
      total: totalDashboards,
      available: availableItems.filter(i => i.available).length,
      capturedCount: capturedDashboardIds.length,
      server: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        lastState: {
          ...lastState,
          age: Math.round(lastStateAge / 1000),
          ageMinutes: Math.round(lastStateAge / 1000 / 60)
        }
      }
    };
    
    console.log(`📋 API List: ${response.available}/${TARGETS.length} dashboards disponibles (${response.capturedCount} registrados en estado persistente)`);
    res.json(response);
  } catch (error) {
    console.error('Error en /api/list:', error);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
});

// Endpoint de estado de progreso mejorado
app.get('/api/status', (req, res) => {
  try {
    // Obtener estado actual
    const lastState = getLastCaptureState();
    const now = Date.now();
    
    res.json({
      timestamp: now,
      datetime: new Date(now).toISOString(),
      loading: captureInProgress,
      progress: captureProgress,
      total: totalDashboards,
      successful: successfulCaptures,
      failed: failedCaptures,
      percentage: totalDashboards > 0 ? Math.round((captureProgress / totalDashboards) * 100) : 0,
      server: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        lastCaptureState: lastState
      }
    });
  } catch (error) {
    console.error('Error en /api/status:', error);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
});

// Endpoint para información de cache
app.get('/api/cache-info', (req, res) => {
  try {
    const cacheInfo = TARGETS.map(target => {
      const imagePath = path.join(shotsDir, `${target.id}.png`);
      let fileInfo = null;
      
      if (fs.existsSync(imagePath)) {
        const stats = fs.statSync(imagePath);
        const ageInMinutes = (Date.now() - stats.mtime) / 1000 / 60;
        
        fileInfo = {
          exists: true,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          ageMinutes: Math.round(ageInMinutes * 100) / 100,
          isStale: ageInMinutes > CAPTURE_EVERY_MIN + 1, // +1 minuto de tolerancia
          currentTimestamp: Date.now(),
          fileTimestamp: stats.mtime.getTime()
        };
      } else {
        fileInfo = {
          exists: false,
          size: 0,
          created: null,
          modified: null,
          ageMinutes: null,
          isStale: true,
          currentTimestamp: Date.now(),
          fileTimestamp: null
        };
      }
      
      return {
        dashboardId: target.id,
        url: target.url,
        section: target.section,
        file: fileInfo
      };
    });
    
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.json({
      timestamp: new Date().toISOString(),
      captureInterval: CAPTURE_EVERY_MIN,
      dashboards: cacheInfo,
      summary: {
        total: TARGETS.length,
        existing: cacheInfo.filter(d => d.file.exists).length,
        stale: cacheInfo.filter(d => d.file.isStale).length,
        fresh: cacheInfo.filter(d => !d.file.isStale).length
      }
    });
    
  } catch (error) {
    console.error('Error en /api/cache-info:', error);
    res.status(500).json({
      error: 'Error obteniendo información de cache',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint simple para verificar hora
app.get('/api/time', (req, res) => {
  const mexicoTime = getMexicoTime();
  res.json({
    server: 'Carrusel HDI',
    utc: mexicoTime.iso,
    mexico: mexicoTime.local,
    timestamp: mexicoTime.timestamp,
    timezone: process.env.TZ || 'No configurada',
    message: `Hora actual del servidor: ${mexicoTime.local} (México)`
  });
});

// Endpoint para comparar zonas horarias
app.get('/api/timezone', (req, res) => {
  try {
    const now = new Date();
    const timezoneInfo = {
      server: {
        utc: now.toISOString(),
        local: now.toString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: now.getTimezoneOffset(),
        timestamp: now.getTime()
      },
      formatted: {
        utc: now.toUTCString(),
        mexicoCity: now.toLocaleString('es-MX', {
          timeZone: 'America/Mexico_City',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }),
        newYork: now.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
      },
      dashboardFiles: TARGETS.map(target => {
        const imagePath = path.join(shotsDir, `${target.id}.png`);
        if (fs.existsSync(imagePath)) {
          const stats = fs.statSync(imagePath);
          return {
            id: target.id,
            modified: {
              utc: stats.mtime.toISOString(),
              mexicoCity: stats.mtime.toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
              }),
              ageMinutes: Math.round((now - stats.mtime) / 1000 / 60)
            }
          };
        }
        return { id: target.id, modified: null };
      })
    };
    
    res.json(timezoneInfo);
  } catch (error) {
    console.error('Error en /api/timezone:', error);
    res.status(500).json({
      error: 'Error obteniendo información de zona horaria',
      message: error.message
    });
  }
});

// 📊 Nuevo endpoint para diagnóstico
app.get('/api/diagnostics', (req, res) => {
  try {
    // Verificar archivos
    const files = TARGETS.map(t => {
      const imagePath = path.join(shotsDir, `${t.id}.png`);
      let stats = null;
      
      try {
        if (fs.existsSync(imagePath)) {
          stats = fs.statSync(imagePath);
        }
      } catch (e) {}
      
      return {
        id: t.id,
        path: imagePath,
        exists: fs.existsSync(imagePath),
        size: stats ? stats.size : 0,
        modified: stats ? {
          utc: stats.mtime.toISOString(),
          local: stats.mtime.toString(),
          mexicoCity: stats.mtime.toLocaleString('es-MX', {timeZone: 'America/Mexico_City'}),
          timestamp: stats.mtime.getTime()
        } : null,
        age: stats ? (Date.now() - stats.mtime) / 1000 : null
      };
    });
    
    // Obtener información del sistema con zona horaria
    const now = new Date();
    const diagnostics = {
      timestamp: Date.now(),
      datetime: {
        utc: now.toISOString(),
        local: now.toString(),
        mexicoCity: now.toLocaleString('es-MX', {timeZone: 'America/Mexico_City'}),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: now.getTimezoneOffset()
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        versions: process.versions,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PORT: process.env.PORT,
          TZ: process.env.TZ
        }
      },
      capture: {
        inProgress: captureInProgress,
        progress: captureProgress,
        total: totalDashboards,
        successful: successfulCaptures,
        failed: failedCaptures,
        lastState: getLastCaptureState()
      },
      files: files
    };
    
    res.json(diagnostics);
  } catch (error) {
    console.error('Error en /api/diagnostics:', error);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
});

// Arranca el servidor en el puerto configurado
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Carousel listo en http://localhost:${PORT}`);
  console.log(`📊 Diagnósticos disponibles en http://localhost:${PORT}/api/diagnostics`);
});

// Configurar timeouts del servidor para evitar cierres inesperados
server.timeout = 300000; // 5 minutos
server.keepAliveTimeout = 120000; // 2 minutos

// Manejo robusto de señales para evitar que Render reinicie el servicio
process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM recibido, cerrando gracefully...');
  try {
    // Guardar estado actual
    const currentIndex = TARGETS.findIndex(t => t.id === `dashboard${captureProgress}`);
    if (currentIndex >= 0) {
      saveLastCaptureState(currentIndex);
    }
    
    // Cerrar servidor HTTP
    server.close(() => {
      console.log('✅ Servidor HTTP cerrado correctamente');
      process.exit(0);
    });
    
    // Forzar salida después de timeout si el cierre graceful falla
    setTimeout(() => {
      console.log('⚠️ Tiempo de espera agotado, forzando salida...');
      process.exit(1);
    }, 10000);
  } catch (e) {
    console.error('❌ Error durante cierre graceful:', e);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('⚠️ SIGINT recibido, cerrando gracefully...');
  try {
    // Guardar estado actual
    const currentIndex = TARGETS.findIndex(t => t.id === `dashboard${captureProgress}`);
    if (currentIndex >= 0) {
      saveLastCaptureState(currentIndex);
    }
    
    // Cerrar servidor HTTP
    server.close(() => {
      console.log('✅ Servidor HTTP cerrado correctamente');
      process.exit(0);
    });
    
    // Forzar salida después de timeout si el cierre graceful falla
    setTimeout(() => {
      console.log('⚠️ Tiempo de espera agotado, forzando salida...');
      process.exit(1);
    }, 10000);
  } catch (e) {
    console.error('❌ Error durante cierre graceful:', e);
    process.exit(1);
  }
});

// Manejo de errores no capturados para evitar crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Error no capturado:', error);
  
  // Registrar evento de crash para diagnóstico
  try {
    fs.writeFileSync(
      path.join(__dirname, `crash-${Date.now()}.log`),
      JSON.stringify({
        timestamp: Date.now(),
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          memory: process.memoryUsage()
        }
      }, null, 2)
    );
  } catch (e) {
    console.error('❌ Error guardando log de crash:', e);
  }
  
  // No salir del proceso, solo loggear
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rechazada no manejada:', reason);
  
  // Registrar evento para diagnóstico
  try {
    fs.writeFileSync(
      path.join(__dirname, `rejection-${Date.now()}.log`),
      JSON.stringify({
        timestamp: Date.now(),
        reason: reason instanceof Error ? {
          message: reason.message,
          stack: reason.stack,
          name: reason.name
        } : String(reason),
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          memory: process.memoryUsage()
        }
      }, null, 2)
    );
  } catch (e) {
    console.error('❌ Error guardando log de rejection:', e);
  }
  
  // No salir del proceso, solo loggear
});
