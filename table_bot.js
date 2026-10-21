const http = require('http');
const { Telegraf, Markup } = require('telegraf');

const port = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Inventory Bot Online');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${port}`);
  startBot();
});

process.on('unhandledRejection', (r) => console.error('Rejection:', r));
process.on('uncaughtException', (e) => console.error('Exception:', e));

async function startBot() {
  const token = process.env.TABLE_BOT_TOKEN;
  if (!token) {
    console.error('ОШИБКА: TABLE_BOT_TOKEN не задан!');
    return;
  }

  const bot = new Telegraf(token);
  const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbzVMFAdOuj63GvM6Xy23WYQutPnrCfsLg_1BaQhjRpSEIYAtpnV66pxTHWJ0vcbWW5y/exec';
  const BOT_PASSWORD = '2888';

  const userSessions = new Map();
  const authorizedUsers = new Set();

  const adminMenu = Markup.keyboard([
    ['➕ Добавить товар'],
    ['📦 Внести Карго', '🚚 Внести СДЭК'],
    ['💰 Зафиксировать продажу', '❌ Отмена']
  ]).resize();

  async function sendToGAS(payload) {
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      return await res.json();
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }

  bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    if (authorizedUsers.has(uid)) return next();

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

  // Добавить товар
  bot.hears('➕ Добавить товар', async (ctx) => {
    userSessions.set(ctx.from.id, { step: 'PROD_NAME' });
    await ctx.reply('📝 *Шаг 1 из 5:*\nНаименование товара (например: `Nike Blazer 77`):', {
      parse_mode: 'Markdown',
      ...Markup.keyboard([['❌ Отмена']]).resize()
    });
  });

  // Карго
  bot.hears('📦 Внести Карго', async (ctx) => {
    userSessions.set(ctx.from.id, { step: 'CARGO_BATCH' });
    await ctx.reply('📦 Номер объединения для Карго:');
  });

  // СДЭК
  bot.hears('🚚 Внести СДЭК', async (ctx) => {
    userSessions.set(ctx.from.id, { step: 'CDEK_BATCH' });
    await ctx.reply('🚚 Номер объединения для СДЭК:');
  });

  // Продажа
  bot.hears('💰 Зафиксировать продажу', async (ctx) => {
    await ctx.reply('⏳ Загружаю актуальные товары...');
    const res = await sendToGAS({ action: 'search_products' });

    if (!res || res.status !== 'ok') {
      return ctx.reply(`⚠️ Ошибка от таблицы: ${res?.error || 'Сбой связи'}`, adminMenu);
    }

    const items = res.items || [];
    if (items.length === 0) {
      return ctx.reply('Все позиции уже проданы либо лист «Товары» пуст.', adminMenu);
    }

    const buttons = items.map(item => {
      const batchStr = item.batch ? ` (${item.batch})` : '';
      return [Markup.button.callback(`#${item.id} ${item.name}${batchStr}`, `sell_${item.id}`)];
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

  bot.on('text', async (ctx, next) => {
    const uid = ctx.from.id;
    const state = userSessions.get(uid);
    if (!state) return next();

    const text = ctx.message.text.trim();
    if (text === '❌ Отмена') {
      userSessions.delete(uid);
      return ctx.reply('Отменено.', adminMenu);
    }

    if (state.step === 'PROD_NAME') {
      state.name = text;
      state.step = 'PROD_BATCH';
      return ctx.reply('📦 Номер объединения:');
    }

    if (state.step === 'PROD_BATCH') {
      state.batch = text;
      state.step = 'PROD_PRICE_CNY';
      return ctx.reply('💴 Цена покупки в юанях (¥):');
    }

    if (state.step === 'PROD_PRICE_CNY') {
      const cny = parseFloat(text.replace(',', '.'));
      if (isNaN(cny) || cny <= 0) return ctx.reply('Введите корректное число для цены в юанях:');
      state.cnyPrice = cny;
      state.step = 'PROD_RATE';
      return ctx.reply('📈 Курс юаня к рублю:');
    }

    if (state.step === 'PROD_RATE') {
      const rate = parseFloat(text.replace(',', '.'));
      if (isNaN(rate) || rate <= 0) return ctx.reply('Введите курс числом:');
      state.rate = rate;
      state.step = 'PROD_WEIGHT';
      return ctx.reply('⚖️ Складской вес в граммах:');
    }

    if (state.step === 'PROD_WEIGHT') {
      const weight = parseFloat(text.replace(/[^\d.]/g, ''));
      if (isNaN(weight) || weight <= 0) return ctx.reply('Введите вес числом в граммах:');
      state.weight = weight;
      state.step = 'PROD_SOURCE';
      return ctx.reply('🏷 Назначение (например: `Пойзон/авито`):');
    }

    if (state.step === 'PROD_SOURCE') {
      state.sourceDest = text;
      await ctx.reply('⏳ Записываю позицию...');
      const res = await sendToGAS({ action: 'add_product', ...state });
      userSessions.delete(uid);

      if (res && res.status === 'ok') {
        return ctx.reply(`✅ Товар #${res.id} "${state.name}" успешно добавлен!`, adminMenu);
      }
      return ctx.reply(`⚠️ Ошибка: ${res?.error || 'Сбой'}`, adminMenu);
    }

    // Карго
    if (state.step === 'CARGO_BATCH') {
      state.batch = text;
      state.step = 'CARGO_WEIGHT';
      return ctx.reply('⚖️ Общий вес Карго (в граммах):');
    }

    if (state.step === 'CARGO_WEIGHT') {
      state.weight = parseFloat(text.replace(/[^\d.]/g, ''));
      state.step = 'CARGO_PRICE';
      return ctx.reply('💰 Стоимость доставки Карго в рублях:');
    }

    if (state.step === 'CARGO_PRICE') {
      state.price = parseFloat(text.replace(',', '.'));
      await ctx.reply('⏳ Сохраняю Карго...');
      const res = await sendToGAS({ action: 'add_cargo', ...state });
      userSessions.delete(uid);
      if (res && res.status === 'ok') return ctx.reply(`✅ Карго на партию ${state.batch} записано!`, adminMenu);
      return ctx.reply(`⚠️ Ошибка: ${res?.error || 'Сбой'}`, adminMenu);
    }

    // СДЭК
    if (state.step === 'CDEK_BATCH') {
      state.batch = text;
      state.step = 'CDEK_WEIGHT';
      return ctx.reply('⚖️ Общий вес СДЭК (в граммах):');
    }

    if (state.step === 'CDEK_WEIGHT') {
      state.weight = parseFloat(text.replace(/[^\d.]/g, ''));
      state.step = 'CDEK_PRICE';
      return ctx.reply('💰 Стоимость СДЭК в рублях:');
    }

    if (state.step === 'CDEK_PRICE') {
      state.price = parseFloat(text.replace(',', '.'));
      await ctx.reply('⏳ Заношу СДЭК...');
      const res = await sendToGAS({ action: 'add_cdek', ...state });
      userSessions.delete(uid);
      if (res && res.status === 'ok') return ctx.reply(`✅ СДЭК на партию ${state.batch} записан!`, adminMenu);
      return ctx.reply(`⚠️ Ошибка: ${res?.error || 'Сбой'}`, adminMenu);
    }

    // Продажа
    if (state.step === 'SELL_PRICE') {
      const sellPrice = parseFloat(text.replace(',', '.'));
      if (isNaN(sellPrice) || sellPrice <= 0) return ctx.reply('Введите корректную сумму:');
      await ctx.reply('⏳ Обновляю статус...');
      const res = await sendToGAS({ action: 'sell_product', id: state.prodId, sellPrice });
      userSessions.delete(uid);

      if (res && res.status === 'ok') {
        return ctx.reply(`🎉 Товар "${res.name}" продан за ${sellPrice} ₽!`, adminMenu);
      }
      return ctx.reply(`⚠️ Ошибка: ${res?.error || 'Сбой'}`, adminMenu);
    }

    return next();
  });

  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch();
    console.log('Бот успешно запущен!');
  } catch (err) {
    console.error('Ошибка launch():', err);
  }
}
