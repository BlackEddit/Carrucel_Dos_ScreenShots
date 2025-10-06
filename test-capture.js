// Script simple para probar captura con división horizontal
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const URL = process.env.DASHBOARD_URLS?.replace(/^"(.*)"$/, '$1') || '';
console.log('🔍 URL de prueba:', URL);

const VIEWPORT = {
  width: 3200,
  height: 1800,
  deviceScaleFactor: 1
};

async function testCapture() {
  let browser;
  try {
    console.log('🌐 Iniciando navegador...');
    
    browser = await puppeteer.launch({
      args: [
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
      headless: true,
      // Intenta usar Chrome local primero
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });

    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    
    console.log('📱 Navegando a:', URL);
    await page.goto(URL, { 
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('⏱️ Esperando 10 segundos para carga completa...');
    await new Promise(res => setTimeout(res, 10000));
    
    // Primero capturar pantalla completa para análisis
    console.log('📸 Capturando pantalla completa para análisis...');
    await page.screenshot({
      path: path.join(__dirname, 'public/shots/debug-full.png'),
      timeout: 30000
    });
    
    // Experimentar con recortes optimizados para la grilla de monitores
    console.log('📸 Capturando zona optimizada para grilla de monitores...');
    
    // Opción 1: Zona de monitores completa (ajuste PERFECTO final)
    const monitorArea = await page.screenshot({
      clip: {
        x: 15,          // Margen izquierdo perfecto
        y: 72,          // Ajuste súper fino del header
        width: 1870,    // Ancho ligeramente aumentado
        height: 1320,   // Altura perfecta para 4 filas completas
      },
      encoding: 'binary'
    });
    
    // Esta será nuestra captura principal
    const twoThirdsScreenshot = monitorArea;
    
    // Dimensiones para la zona de monitores optimizada - PRUEBA 670px
    const fullWidth = 1870;   // Ancho perfecto de la zona de monitores
    const fullHeight = 1320;  // Alto perfecto para 4 filas completas
    const topHeight = 670;    // Primera imagen: 670px - PRUEBA
    const bottomHeight = 650; // Segunda imagen: 650px - PRUEBA
    
    console.log(`✂️ Dividiendo grilla de monitores: ${fullWidth}x${fullHeight} -> Top:${fullWidth}x${topHeight}, Bottom:${fullWidth}x${bottomHeight}`);
    console.log(`📊 Primera imagen: ${topHeight}px, Segunda imagen: ${bottomHeight}px`);
    
    // Guardar la zona completa de monitores para referencia
    await sharp(monitorArea)
      .png()
      .toFile(path.join(__dirname, 'public/shots/monitor-area-complete.png'));
    
    // Mitad superior (dashboard1) - 750px
    await sharp(twoThirdsScreenshot)
      .extract({
        left: 0,
        top: 0,
        width: fullWidth,
        height: topHeight
      })
      .png()
      .toFile(path.join(__dirname, 'public/shots/dashboard1.png'));
    
    // Mitad inferior (dashboard2) - 570px
    await sharp(twoThirdsScreenshot)
      .extract({
        left: 0,
        top: topHeight,
        width: fullWidth,
        height: bottomHeight
      })
      .png()
      .toFile(path.join(__dirname, 'public/shots/dashboard2.png'));
    
    console.log('✅ Capturas de prueba completadas exitosamente');
    console.log('📁 Archivos generados: dashboard1.png (superior), dashboard2.png (inferior)');
    
    // Verificar tamaños de archivo
    const stats1 = fs.statSync(path.join(__dirname, 'public/shots/dashboard1.png'));
    const stats2 = fs.statSync(path.join(__dirname, 'public/shots/dashboard2.png'));
    console.log(`📊 dashboard1.png: ${Math.round(stats1.size/1024)}KB`);
    console.log(`📊 dashboard2.png: ${Math.round(stats2.size/1024)}KB`);
    
  } catch (error) {
    console.error('❌ Error en captura de prueba:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

console.log('🚀 Iniciando captura de prueba...');
testCapture();