const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// НАСТРОЙКИ
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbzVMFAdOuj63GvM6Xy23WYQutPnrCfsLg_1BaQhjRpSEIYAtpnV66pxTHWJ0vcbWW5y/exec';
const BOT_PASSWORD = '2888';

const token = process.env.TABLE_BOT_TOKEN;
if (!token) {
  console.error('КРИТИЧЕСКАЯ ОШИБКА: TABLE_BOT_TOKEN не задан в переменных Render!');
}

const bot = new Telegraf(token);

const userSessions = new Map();
const authorizedUsers = new Set();

const adminMenu = Markup.keyboard([
  ['➕ Добавить товар'],
  ['📦 Внести Карго', '🚚 Внести СДЭК'],
  ['💰 Зафиксировать продажу', '❌ Отмена']
]).resize();

// Безопасная отправка в Google Apps Script
async function sendToGAS(payload) {
  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    
    const rawText = await res.text();
    try {
      return JSON.parse(rawText);
    } catch (e) {
      console.error('Ответ не JSON:', rawText.slice(0, 200));
      return { status: 'error', error: 'Скрипт таблицы вернул ошибку или HTML' };
    }
  } catch (err) {
    console.error('Сетевой сбой при обращении к Google Sheets:', err);
    return { status: 'error', error: err.message };
  }
}

// Проверка пароля 2888
bot.use(async (ctx, next) => {
  const uid = ctx.from?.id;
  if (!uid) return;

  if (authorizedUsers.has(uid)) {
    return next();
  }

  const text = ctx.message?.text?.trim();
  if (text === BOT_PASSWORD) {
    authorizedUsers.add(uid);
    return ctx.reply('🔓 Доступ разрешен. Бот готов к работе.', adminMenu);
  }

  return ctx.reply('🔒 Введите пароль доступа:');
});

bot.start(async (ctx) => {
  userSessions.delete(ctx.from.id);
  await ctx.reply('📊 Система учета готова к работе.', adminMenu);
});

bot.hears('❌ Отмена', async (ctx) => {
  userSessions.delete(ctx.from.id);
  await ctx.reply('Действие отменено.', adminMenu);
});

// 1. Добавить товар
bot.hears('➕ Добавить товар', async (ctx) => {
  userSessions.set(ctx.from.id, { step: 'PROD_NAME' });
  await ctx.reply('📝 *Шаг 1 из 5:*\nВведите наименование товара (например: `Nike Blazer 77`):', {
    parse_mode: 'Markdown',
    ...Markup.keyboard([['❌ Отмена']]).resize()
  });
});

// 2. Карго
bot.hears('📦 Внести Карго', async (ctx) => {
  userSessions.set(ctx.from.id, { step: 'CARGO_BATCH' });
  await ctx.reply('📦 Номер объединения для Карго (например: `910`):', {
    parse_mode: 'Markdown',
    ...Markup.keyboard([['❌ Отмена']]).resize()
  });
});

// 3. СДЭК
bot.hears('🚚 Внести СДЭК', async (ctx) => {
  userSessions.set(ctx.from.id, { step: 'CDEK_BATCH' });
  await ctx.reply('🚚 Номер объединения для СДЭК (например: `910`):', {
    parse_mode: 'Markdown',
    ...Markup.keyboard([['❌ Отмена']]).resize()
  });
});

// 4. Продажа с фильтром пустых позиций
bot.hears('💰 Зафиксировать продажу', async (ctx) => {
  await ctx.reply('⏳ Загружаю актуальные товары на продажу...');
  const res = await sendToGAS({ action: 'search_products' });
  
  if (!res || res.status !== 'ok') {
    return ctx.reply(`⚠️ Ошибка: ${res?.error || 'Не удалось получить список'}`, adminMenu);
  }

  // Фильтруем пустые и битые записи (где нет названия или ID равен 0/пусто)
  const validItems = (res.items || []).filter(item => {
    const hasName = item.name && String(item.name).trim() !== '' && String(item.name) !== '0';
    const hasId = item.id !== undefined && item.id !== null && String(item.id).trim() !== '';
    return hasName && hasId;
  });

  if (validItems.length === 0) {
    return ctx.reply('Нет активных товаров для продажи (все продано или товары с пометкой "себе").', adminMenu);
  }

  const buttons = validItems.map(item => {
    const title = `#${item.id} ${item.name} ${item.batch ? `(${item.batch})` : ''}`.trim();
    return [Markup.button.callback(title, `sell_${item.id}`)];
  });

  await ctx.reply('Выберите товар из списка:', Markup.inlineKeyboard(buttons));
});

bot.action(/sell_(\d+)/, async (ctx) => {
  const prodId = ctx.match[1];
  userSessions.set(ctx.from.id, { step: 'SELL_PRICE', prodId });
  await ctx.answerCbQuery();
  await ctx.reply(`Введите фактическую цену продажи в рублях (₽) для позиции #${prodId}:`, {
    ...Markup.keyboard([['❌ Отмена']]).resize()
  });
});

// Обработка текстового пошагового ввода
bot.on('text', async (ctx, next) => {
  const uid = ctx.from.id;
  const state = userSessions.get(uid);
  if (!state) return next();

  const text = ctx.message.text.trim();
  if (text === '❌ Отмена') {
    userSessions.delete(uid);
    return ctx.reply('Отменено.', adminMenu);
  }

  // Ветка: Добавление товара
  if (state.step === 'PROD_NAME') {
    state.name = text;
    state.step = 'PROD_BATCH';
    return ctx.reply('📦 *Шаг 2 из 5:*\nНомер объединения/партии (например: `910`):', { parse_mode: 'Markdown' });
  }

  if (state.step === 'PROD_BATCH') {
    state.batch = text;
    state.step = 'PROD_PRICE_CNY';
    return ctx.reply('💴 *Шаг 3 из 5:*\nЦена покупки в юанях (¥):', { parse_mode: 'Markdown' });
  }

  if (state.step === 'PROD_PRICE_CNY') {
    const cny = parseFloat(text.replace(',', '.'));
    if (isNaN(cny) || cny <= 0) return ctx.reply('Введите корректное число для цены в юанях:');
    state.cnyPrice = cny;
    state.step = 'PROD_RATE';
    return ctx.reply('📈 *Шаг 4 из 5:*\nКурс юаня к рублю (например: `13.5`):', { parse_mode: 'Markdown' });
  }

  if (state.step === 'PROD_RATE') {
    const rate = parseFloat(text.replace(',', '.'));
    if (isNaN(rate) || rate <= 0) return ctx.reply('Введите корректный курс числом:');
    state.rate = rate;
    state.step = 'PROD_WEIGHT';
    return ctx.reply('⚖️ *Шаг 5 из 5:*\nСкладской чистый вес позиции в граммах (например: `350`):', { parse_mode: 'Markdown' });
  }

  if (state.step === 'PROD_WEIGHT') {
    const weight = parseFloat(text.replace(/[^\d.]/g, ''));
    if (isNaN(weight) || weight <= 0) return ctx.reply('Введите вес числом в граммах:');
    state.weight = weight;
    state.step = 'PROD_SOURCE';
    return ctx.reply(
      '🏷 *Источник и назначение:*\n' +
      'Введите в формате `Где/Куда` (например: `Пойзон/себе`, `Рыба/авито`, `Тао/себе`):',
      { parse_mode: 'Markdown' }
    );
  }

  if (state.step === 'PROD_SOURCE') {
    state.sourceDest = text;
    await ctx.reply('⏳ Записываю позицию в Google Таблицу...');
    
    const res = await sendToGAS({ action: 'add_product', ...state });
    userSessions.delete(uid);

    if (res && res.status === 'ok') {
      return ctx.reply(
        `✅ *Товар успешно добавлен!*\n\n` +
        `• ID позиции: *#${res.id}*\n` +
        `• Товар: *${state.name}*\n` +
        `• Объединение: *${state.batch}*\n` +
        `• Сумма: *${state.cnyPrice} ¥* (${(state.cnyPrice * state.rate).toFixed(2)} ₽)\n` +
        `• Вес: *${state.weight} г*\n` +
        `• Категория: *${state.sourceDest}*`,
        { parse_mode: 'Markdown', ...adminMenu }
      );
    }
    return ctx.reply(`⚠️ Ошибка сохранения: ${res?.error || 'Неизвестный сбой'}`, adminMenu);
  }

  // Ветка: Карго
  if (state.step === 'CARGO_BATCH') {
    state.batch = text;
    state.step = 'CARGO_WEIGHT';
    return ctx.reply('⚖️ Общий вес накладной Карго в граммах (например, `4200`):');
  }

  if (state.step === 'CARGO_WEIGHT') {
    const weight = parseFloat(text.replace(/[^\d.]/g, ''));
    if (isNaN(weight) || weight <= 0) return ctx.reply('Введите вес накладной Карго в граммах:');
    state.weight = weight;
    state.step = 'CARGO_PRICE';
    return ctx.reply('💰 Общая стоимость доставки Карго в рублях (₽):');
  }

  if (state.step === 'CARGO_PRICE') {
    const price = parseFloat(text.replace(',', '.'));
    if (isNaN(price) || price <= 0) return ctx.reply('Введите стоимость доставки числом:');
    state.price = price;

    await ctx.reply('⏳ Сохраняю Карго...');
    const res = await sendToGAS({ action: 'add_cargo', ...state });
    userSessions.delete(uid);

    if (res && res.status === 'ok') {
      return ctx.reply(`✅ Карго на объединение ${state.batch} успешно записано!`, adminMenu);
    }
    return ctx.reply(`⚠️ Ошибка записи Карго: ${res?.error || 'Сбой скрипта'}`, adminMenu);
  }

  // Ветка: СДЭК
  if (state.step === 'CDEK_BATCH') {
    state.batch = text;
    state.step = 'CDEK_WEIGHT';
    return ctx.reply('⚖️ Общий вес коробки СДЭК в граммах (например: `4200`):');
  }

  if (state.step === 'CDEK_WEIGHT') {
    const weight = parseFloat(text.replace(/[^\d.]/g, ''));
    if (isNaN(weight) || weight <= 0) return ctx.reply('Введите вес СДЭК в граммах:');
    state.weight = weight;
    state.step = 'CDEK_PRICE';
    return ctx.reply('💰 Общая сумма доставки СДЭК в рублях (₽):');
  }

  if (state.step === 'CDEK_PRICE') {
    const price = parseFloat(text.replace(',', '.'));
    if (isNaN(price) || price <= 0) return ctx.reply('Введите стоимость СДЭК числом:');
    state.price = price;

    await ctx.reply('⏳ Заношу СДЭК...');
    const res = await sendToGAS({ action: 'add_cdek', ...state });
    userSessions.delete(uid);

    if (res && res.status === 'ok') {
      return ctx.reply(`✅ СДЭК на партию ${state.batch} успешно записан!`, adminMenu);
    }
    return ctx.reply(`⚠️ Ошибка записи СДЭК: ${res?.error || 'Сбой скрипта'}`, adminMenu);
  }

  // Ветка: Фиксация продажи
  if (state.step === 'SELL_PRICE') {
    const sellPrice = parseFloat(text.replace(',', '.'));
    if (isNaN(sellPrice) || sellPrice <= 0) return ctx.reply('Введите корректную сумму продажи:');
    
    await ctx.reply('⏳ Обновляю статус в таблице...');
    const res = await sendToGAS({ action: 'sell_product', id: state.prodId, sellPrice });
    userSessions.delete(uid);

    if (res && res.status === 'ok') {
      return ctx.reply(`🎉 Товар "${res.name}" продан за ${sellPrice} ₽! Статус обновлен на "Продано".`, adminMenu);
    }
    return ctx.reply(`⚠️ Ошибка фиксации продажи: ${res?.error || 'Сбой скрипта'}`, adminMenu);
  }

  return next();
});

// Защита от аварийных падений процесса
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Запуск фейкового веб-сервера для Render
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Inventory Bot is Online');
}).listen(port, async () => {
  console.log(`HTTP сервер слушает порт ${port}`);
  
  if (!token) return;

  try {
    // Сброс старых вебхуков и зависших запросов
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch();
    console.log('>>> Бот учета успешно запущен! <<<');
  } catch (e) {
    console.error('Ошибка старта бота:', e);
  }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
