#!/usr/bin/env npx ts-node
/**
 * CLI скрипт для очистки очередей и сброса застрявших задач
 *
 * Использование:
 * npm run clear-queues
 * или
 * npx ts-node scripts/clear-queues.ts
 */

import {
  fullCleanup,
  clearAllQueues,
  resetStuckGenerations,
  getQueuesStats,
  cleanStuckTasks,
} from '../src/utils/queue-cleanup';

// Загружаем переменные окружения
require('dotenv').config();

async function main() {
  console.log('🚀 Запуск утилиты очистки очередей...\n');

  const args = process.argv.slice(2);
  const command = args[0] || 'full';

  try {
    switch (command) {
      case 'stats':
        console.log('📊 Получение статистики очередей...');
        const stats = await getQueuesStats();
        console.log('\n📈 Статистика очередей:');
        console.log(JSON.stringify(stats, null, 2));
        break;

      case 'auto':
        const maxAge = parseInt(args[1]) || 30;
        console.log(`🕐 Автоматическая очистка зависших задач (старше ${maxAge} минут)...`);
        await cleanStuckTasks(maxAge);
        break;

      case 'queues':
        console.log('🧹 Очистка только Redis очередей...');
        await clearAllQueues();
        break;

      case 'db':
        console.log('🔄 Сброс только статусов в базе данных...');
        await resetStuckGenerations();
        break;

      case 'full':
      default:
        console.log('🎯 Полная очистка (очереди + база данных)...');
        await fullCleanup();
        break;
    }

    console.log('\n✅ Операция завершена успешно!');

    // Показываем финальную статистику
    console.log('\n📊 Финальная статистика:');
    const finalStats = await getQueuesStats();
    console.log(JSON.stringify(finalStats, null, 2));
  } catch (error) {
    console.error('💥 Ошибка при выполнении операции:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Показываем справку
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🔧 Утилита очистки очередей

Команды:
  full    - Полная очистка (по умолчанию): очистка очередей + сброс статусов в БД
  queues  - Очистка только Redis очередей
  db      - Сброс только статусов в базе данных
  stats   - Показать статистику очередей без очистки
  auto    - Автоматическая очистка зависших задач (старше N минут)

Примеры:
  npm run clear-queues           # Полная очистка
  npm run clear-queues stats     # Только статистика
  npm run clear-queues queues    # Только очереди
  npm run clear-queues db        # Только база данных
  npm run clear-queues auto      # Автоматическая очистка задач старше 30 минут
  npm run clear-queues auto 15   # Автоматическая очистка задач старше 15 минут
`);
  process.exit(0);
}

// Запускаем main функцию
main().catch(console.error);
