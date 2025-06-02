#!/usr/bin/env npx ts-node
/**
 * Тестовый скрипт для проверки работы очереди и обработки заданий
 *
 * Использование:
 * npm run test-queue
 */

import { addImageEffectJob } from '../src/queues/imageEffectQueue';
import { getQueuesStats } from '../src/utils/queue-cleanup';
import { v4 as uuidv4 } from 'uuid';

// Загружаем переменные окружения
require('dotenv').config();

async function testQueue() {
  console.log('🧪 Тестируем очередь изображений...\n');

  try {
    // 1. Проверяем статистику до добавления
    console.log('📊 Статистика очереди ДО добавления задания:');
    const statsBefore = await getQueuesStats();
    console.log(JSON.stringify(statsBefore, null, 2));

    // 2. Создаем тестовое задание
    const testJobData = {
      generationId: uuidv4(),
      userId: 'test-user-123',
      effect: 'pixar' as any,
      fileIds: ['test-file-id-123'],
      chatId: '123456789',
      messageId: 1,
      language: 'ru',
      resolution: 'SQUARE' as any,
      apiProvider: 'openai' as any,
    };

    console.log('\n🚀 Добавляем тестовое задание:');
    console.log(JSON.stringify(testJobData, null, 2));

    // 3. Добавляем задание в очередь
    const job = await addImageEffectJob(testJobData);
    console.log(`\n✅ Задание добавлено с ID: ${job.id}`);

    // 4. Ждем немного и проверяем статистику
    console.log('\n⏳ Ждем 5 секунд для обработки...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\n📊 Статистика очереди ПОСЛЕ добавления задания:');
    const statsAfter = await getQueuesStats();
    console.log(JSON.stringify(statsAfter, null, 2));

    console.log('\n🎯 Тест завершен!');
  } catch (error) {
    console.error('💥 Ошибка при тестировании очереди:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Запускаем тест
testQueue().catch(console.error);
