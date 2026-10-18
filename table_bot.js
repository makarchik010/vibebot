const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// Токен второго бота берем из переменной среды
const bot = new Telegraf(process.env.TABLE_BOT_TOKEN);

// НАСТРОЙКИ
// Вставь сюда URL, полученный после развертывания Google Apps Script
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyf7taWVt-_lN6bJpUeCPRsI9VlJQpK1xw4UeoR6EKrutali-y2UQXRicxYF2DfIocf/exec';
const ADMIN_ID = 1681547868;

// Сессии для пошагового ввода данных
const userSessions = new Map();

// Главное меню
const adminMenu = Markup.keyboard([
  ['➕ Добавить товар'],
  ['📦 Внести Карго', '🚚 Внести СДЭК'],
  ['💰 Зафиксировать продажу', '❌ Отмена']
]).resize();

// Отправка запроса в Google Apps Script
async function sendToGoogleSheets(payload) {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    return await response.json();
  } catch (err) {
    console.error('Ошибка связи с Google Sheets:', err);
    return { status: 'error', error: err.message };
  }
}

// Проверка доступа: бот отвечает ТОЛЬКО тебе
bot.use(async (ctx, next) => {
  if (ctx.from && ctx.from.id !== ADMIN_ID) {
    return ctx.reply('⛔ Доступ запрещен. Бот только для личного пользования.');
  }
  return next();
});

// Старт
bot.start(async (ctx) => {
  userSessions.delete(ctx.from.id);
  await ctx.reply(
    '📊 *Бот учета Поизон010*\n\n' +
    'Нажмите кнопку *«➕ Добавить товар»*, чтобы внести новую позицию по шагам.',
    { parse_mode: 'Markdown', ...adminMenu }
  );
});

// Сброс
bot.hears('❌ Отмена', async (ctx) => {
  userSessions.delete(ctx.from.id);
  await ctx.reply('Действие отменено.', adminMenu);
});

// --- СЦЕНАРИЙ А: ПОШАГОВЫЙ ВВОД ТОВАРА ---

bot.hears('➕ Добавить товар', async (ctx) => {
  userSessions.set(ctx.from.id, { step: 'NAME' });
  await ctx.reply(
    '📝 *Шаг 1 из 6:*\nВведите наименование товара:\n_Пример: Штаны Nike или Nike Blazer 77_',
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ Отмена']]).resize() }
  );
});

// Слушатель всех шагов
bot.on('text', async (ctx, next) => {
  const userId = ctx.from.id;
  const state = userSessions.get(userId);
  if (!state) return next();

  const text = ctx.message.text.trim();
  if (text === '❌ Отмена') {
    userSessions.delete(userId);
    return ctx.reply('Действие отменено.', adminMenu);
  }

  // Шаг 1: Название
  if (state.step === 'NAME') {
    state.name = text;
    state.step = 'BATCH';
    userSessions.set(userId, state);
    return ctx.reply(
      `Товар: *${state.name}*\n\n` +
      `📦 *Шаг 2 из 6:*\nВведите номер объединения/партии:\n_Пример: 910 или 925_`,
      { parse_mode: 'Markdown' }
    );
  }

  // Шаг 2: Номер партии
  if (state.step === 'BATCH') {
    state.batch = text;
    state.step = 'CNY_PRICE';
    userSessions.set(userId, state);
    return ctx.reply(
      `Партия: *${state.batch}*\n\n` +
      `💴 *Шаг 3 из 6:*\nВведите цену в юанях (¥):\n_Пример: 44 или 284_`,
      { parse_mode: 'Markdown' }
    );
  }

  // Шаг 3: Цена ¥
  if (state.step === 'CNY_PRICE') {
    const cny = parseFloat(text.replace(',', '.'));
    if (isNaN(cny) || cny <= 0) {
      return ctx.reply('Введите число для цены в юанях:');
    }
    state.cnyPrice = cny;
    state.step = 'RATE';
    userSessions.set(userId, state);
    return ctx.reply(
      `Цена: *${state.cnyPrice} ¥*\n\n` +
      `📈 *Шаг 4 из 6:*\nПо какому курсу куплен юань?\n_Пример: 13.63 или 11.75_`,
      { parse_mode: 'Markdown' }
    );
  }

  // Шаг 4: Курс
  if (state.step === 'RATE') {
    const rate = parseFloat(text.replace(',', '.'));
    if (isNaN(rate) || rate <= 0) {
      return ctx.reply('Введите число для курса:');
    }
    state.rate = rate;
    state.step = 'WEIGHT';
    userSessions.set(userId, state);
    return ctx.reply(
      `Курс: *${state.rate} ₽*\n` +
      `Сумма: *${(state.cnyPrice * state.rate).toFixed(2)} ₽*\n\n` +
      `⚖️ *Шаг 5 из 6:*\nЧистый вес на складе в граммах (по фото):\n_Пример: 265 или 1075_`,
      { parse_mode: 'Markdown' }
    );
  }

  // Шаг 5: Вес
  if (state.step === 'WEIGHT') {
    const weight = parseFloat(text.replace(/[^\d.]/g, ''));
    if (isNaN(weight) || weight <= 0) {
      return ctx.reply('Введите вес числом в граммах (например, 265):');
    }
    state.warehouseWeight = weight;
    state.step = 'SOURCE_DEST';
    userSessions.set(userId, state);
    return ctx.reply(
      `Складской вес: *${state.warehouseWeight} г*\n\n` +
      `🏷 *Шаг 6 из 6:*\nГде куплено и куда пойдет?\n` +
      `_Примеры:_ \`Пойзон/себе\`, \`Рыба/себе+авито\`, \`Тао/себе\`\n\n` +
      `_(Пойзон покрасит ячейку в синий, Рыба — в жёлтый, Тао — в кирпичный)_`,
      { parse_mode: 'Markdown' }
    );
  }

  // Шаг 6: Источник и отправка в таблицу
  if (state.step === 'SOURCE_DEST') {
    const parts = text.split('/');
    state.source = parts[0] ? parts[0].trim() : text;
    state.destination = parts[1] ? parts[1].trim() : 'себе';

    await ctx.reply('⏳ Записываю данные в таблицу *Поизон010*...', { parse_mode: 'Markdown' });

    const payload = {
      action: 'add_product',
      name: state.name,
      batch: state.batch,
      cnyPrice: state.cnyPrice,
      rate: state.rate,
      warehouseWeight: state.warehouseWeight,
      source: state.source,
      destination: state.destination
    };

    const res = await sendToGoogleSheets(payload);

    if (res && res.status === 'ok') {
      await ctx.reply(
        `✅ *Товар записан в таблицу!*\n\n` +
        `• Строка товаров: *№${res.row}*\n` +
        `• Строка доставки: *№${res.deliveryRow}*\n` +
        `• Товар: *${state.name}*\n` +
        `• Партия: *${state.batch}*\n` +
        `• Цена: *${state.cnyPrice} ¥* (по курсу ${state.rate} = ${(state.cnyPrice * state.rate).toFixed(2)} ₽)\n` +
        `• Складской вес: *${state.warehouseWeight} г*\n` +
        `• Маркировка: *${state.source}/${state.destination}*`,
        { parse_mode: 'Markdown', ...adminMenu }
      );
    } else {
      await ctx.reply(
        `⚠️ Ошибка записи в таблицу: ${res.message || res.error || 'Проверь Webhook URL'}\nПопробуйте снова.`,
        adminMenu
      );
    }

    userSessions.delete(userId);
    return;
  }

  return next();
});

bot.launch().then(() => console.log('>>> БОТ УЧЕТА ПОИЗОН010 ЗАПУЩЕН <<<'));

// Поддержание жизнедеятельности
const port = process.env.PORT || 3001;
http.createServer((req, res) => res.end('Table Bot Active')).listen(port, () => {
  console.log(`Table Bot слушает порт ${port}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));