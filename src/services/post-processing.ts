import sharp from 'sharp';
import { createCanvas, loadImage } from 'canvas';


// Конфигурация эффектов
const config = {
  sharpen: {
    sigma: 0.8,     // Радиус резкости
    m1: 0.55,       // Smart Sharpen Ratio
    m2: 0.5,        // CAS Amount
  },
  grain: {
    intensity: 0.35, // Интенсивность зерна
    scale: 8,        // Размер зерна
  },
  vignette: {
    intensity: 0.25,  // Интенсивность виньетки (уменьшено для более прозрачного эффекта)
    power: 1.3,      // Степень затемнения к краям (уменьшено для более мягкого эффекта)
  },
  finalSharpen: {
    sigma: 0.8,      // Финальная резкость
    amount: 0.5,     // Уровень финальной резкости
  }
};

// Применение зернистости напрямую
const applyGrain = async (imageBuffer, intensity = config.grain.intensity, scale = config.grain.scale) => {
  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  
  // Рисуем изображение на канвас
  ctx.drawImage(image, 0, 0);
  
  // Получаем данные изображения
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  
  // Применяем зернистость
  for (let i = 0; i < pixels.length; i += 4) {
    const grain = (Math.random() * 2 - 1) * intensity * scale;
    pixels[i] = Math.max(0, Math.min(255, pixels[i] + grain));
    pixels[i + 1] = Math.max(0, Math.min(255, pixels[i + 1] + grain));
    pixels[i + 2] = Math.max(0, Math.min(255, pixels[i + 2] + grain));
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer();
};

// Применение виньетки (оптимизировано)
const applyVignette = async (imageBuffer, intensity = config.vignette.intensity, power = config.vignette.power) => {
  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  
  // Рисуем изображение на канвас
  ctx.drawImage(image, 0, 0);
  
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
  
  // Получаем данные изображения
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  
  // Предрасчет расстояний для повышения производительности
  const distances = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxRadius;
      distances[y * width + x] = Math.pow(dist, power) * intensity;
    }
  }
  
  // Применяем виньетку (однопроходное обработка)
  for (let i = 0; i < pixels.length; i += 4) {
    const idx = i / 4;
    const vignetteAmount = distances[idx];
    
    pixels[i] = Math.max(0, pixels[i] * (1 - vignetteAmount));
    pixels[i + 1] = Math.max(0, pixels[i + 1] * (1 - vignetteAmount));
    pixels[i + 2] = Math.max(0, pixels[i + 2] * (1 - vignetteAmount));
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer();
};

// Применение повышения резкости
const applyCAS = async (imageBuffer, amount = config.finalSharpen.amount) => {
  // Просто используем sharp для этого, так как у него уже есть хороший алгоритм повышения резкости
  return sharp(imageBuffer)
    .sharpen({
      sigma: config.finalSharpen.sigma,
      m1: amount,
      m2: amount * 0.8,
    })
    .toBuffer();
};

export const postProcessingImage = async (inputPath, outputPath) => {
  try {
    // 1. Загружаем изображение
    const image = sharp(inputPath);
    
    // 2. Применяем базовую резкость через Sharp (снижено)
    let processedImage = await image
      .sharpen({
        sigma: config.sharpen.sigma,
        m1: config.sharpen.m1,
        m2: config.sharpen.m2,
      })
      .toBuffer();

    // 3. Добавляем зернистость
    processedImage = await applyGrain(processedImage);

    // 4. Добавляем виньетку
    processedImage = await applyVignette(processedImage);

    // 5. Применяем финальное повышение резкости
    processedImage = await applyCAS(processedImage);

    // 6. Сохраняем результат в формате jpg
    await sharp(processedImage)
      .jpeg({ quality: 100 })
      .toFile(outputPath);
      
    return outputPath;
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
};
