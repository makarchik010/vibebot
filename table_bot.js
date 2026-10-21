const http = require('http');

// 1. МГНОВЕННЫЙ ЗАПУСК СЕРВЕРА ДЛЯ RENDER (чтобы не было 'Application exited early')
const port = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Inventory Bot is Online and Running');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`>>> HTTP сервер успешно запущен на порту ${port} <<<`);
  initBot();
});

// Глобальные перехватчики ошибок
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// 2. ЛОГИКА ТЕЛЕГРАМ-БОТА
async function initBot() {
  const token = process.env.TABLE_BOT_TOKEN;
  
  if (!token) {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('ОШИБКА: Переменная TABLE_BOT_TOKEN не задана на Render!');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    return;
  }

  const { Telegraf, Markup } = require('telegraf');
  const bot = new Telegraf(token);

  const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || 'ВСТАВЬ_СЮДА_СВОЙ_APPS_SCRIPT_URL';
  const BOT_PASSWORD = '2888';

  const userSessions = new Map();
  const authorizedUsers = new Set();

  const adminMenu = Markup.keyboard([
    ['➕ Добавить товар'],
    ['📦 Внести Карго', '🚚 Внести СДЭК'],
    ['💰 Зафиксировать продажу', '❌ Отмена']
  ]).resize();

  // Функция запросов к Apps Script
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

  // 4. Продажа (всеядный парсинг полей от таблицы)
  bot.hears('💰 Зафиксировать продажу', async (ctx) => {
    await ctx.reply('⏳ Загружаю актуальные товары на продажу...');
    const res = await sendToGAS({ action: 'search_products' });
    
    if (!res || res.status !== 'ok') {
      return ctx.reply(`⚠️ Ошибка от таблицы: ${res?.error || 'Не удалось получить список'}`, adminMenu);
    }

    const rawItems = res.items || [];
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return ctx.reply('Нет активных товаров для продажи.', adminMenu);
    }

    const validItems = [];
    rawItems.forEach((item, index) => {
      let id, name, batch;

      if (Array.isArray(item)) {
        id = item[0];
        name = item[1];
        batch = item[2];
      } else if (typeof item === 'object' && item !== null) {
        id = item.id ?? item.ID ?? item.Id ?? (index + 1);
        name = item.name ?? item.Name ?? item.title ?? item.наименование ?? item['Наименование'];
        batch = item.batch ?? item.Batch ?? item.партия ?? item.объединение ?? item['Объединение'];
      }

      const cleanName = name ? String(name).trim() : '';
      if (cleanName && cleanName !== '0' && cleanName !== 'ИТОГО:' && cleanName !== 'Наименование') {
        validItems.push({
          id: id !== undefined && id !== null ? String(id).trim() : String(index + 1),
          name: cleanName,
          batch: batch ? String(batch).trim() : ''
        });
      }
    });

    if (validItems.length === 0) {
      return ctx.reply('В таблице не найдено доступных товаров с названиями.', adminMenu);
    }

    const buttons = validItems.map(item => {
      const batchPart = item.batch ? ` (${item.batch})` : '';
      const title = `#${item.id} ${item.name}${batchPart}`;
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

  // Обработка ввода текста
  bot.on('text', async (ctx, next) => {
    const uid = ctx.from.id;
    const state = userSessions.get(uid);
    if (!state) return next();

    const text = ctx.message.text.trim();
    if (text === '❌ Отмена') {
      userSessions.delete(uid);
      return ctx.reply('Отменено.', adminMenu);
    }

    // Ветка товара
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
        'Введите в формате `Где/Куда` (например: `Пойзон/авито`, `Тао/себе`):',
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

    // Ветка Карго
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

    // Ветка СДЭК
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

    // Ветка фиксации продажи
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

  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch();
    console.log('>>> Бот учета успешно запущен и подключен к Telegram! <<<');
  } catch (err) {
    console.error('Ошибка при запуске bot.launch():', err);
  }

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
