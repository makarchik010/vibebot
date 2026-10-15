const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ТВОЙ TELEGRAM ID (число)
const ADMIN_ID = 1681547868;

// Конфигурация тарифов и маркетинговой упаковки
const CONFIG = {
  baseCnyRate: 13.5,        // Твой реальный базовый курс юаня (задаешь утром)
  clientDeliveryPerKg: 1250, // Цена доставки для клиента (твоя база 1000 + 250 заложено в логистику)
  fixedServiceFee: 150       // Символическая фиксированная комиссия в чеке
};

// Сессии пользователей
const userState = new Map();

// Умный расчет: считает чек с «красивой» витриной комиссии
function calculateClientReceipt(cnyPrice, weightKg) {
  // Реальная себестоимость товара в рублях
  const rawCost = cnyPrice * CONFIG.baseCnyRate;

  // Твоя целевая маржа (30% / 20% / 10%)
  let targetMarginPercent = 0.10;
  if (rawCost <= 1000) {
    targetMarginPercent = 0.30;
  } else if (rawCost <= 5000) {
    targetMarginPercent = 0.20;
  }

  // Общая чистая прибыль, которую ты должен забрать с этой сделки
  const totalTargetProfit = rawCost * targetMarginPercent;

  // 1. Прибыль, уже зашитая в доставку (250 руб с каждого кг)
  const deliveryProfit = weightKg * (CONFIG.clientDeliveryPerKg - 1000);

  // 2. Символическая комиссия, которую клиент видит в чеке
  const visibleServiceFee = CONFIG.fixedServiceFee;

  // 3. Остаток прибыли, который нужно незаметно упаковать в курс юаня
  let profitInRate = totalTargetProfit - deliveryProfit - visibleServiceFee;
  if (profitInRate < 0) profitInRate = 0; // Защита от ухода в минус

  // Вычисляем эффективный курс юаня для клиента
  const rateMarkupPerCny = profitInRate / cnyPrice;
  const clientCnyRate = CONFIG.baseCnyRate + rateMarkupPerCny;

  // Итоговые статьи для клиента
  const clientGoodsCost = cnyPrice * clientCnyRate;
  const clientDeliveryCost = weightKg * CONFIG.clientDeliveryPerKg;
  const finalTotal = clientGoodsCost + clientDeliveryCost + visibleServiceFee;

  return {
    clientCnyRate: clientCnyRate.toFixed(2),
    clientGoodsCost: Math.round(clientGoodsCost),
    clientDeliveryCost: Math.round(clientDeliveryCost),
    visibleServiceFee,
    finalTotal: Math.round(finalTotal)
  };
}

// Старт
bot.start(async (ctx) => {
  userState.delete(ctx.from.id);
  await ctx.reply(
    '🇨🇳 *Сервис доставки и выкупа товаров из Китая*\n\n' +
    '📌 *Как рассчитать стоимость:*\n' +
    '• Нажми кнопку *«📦 Рассчитать заказ»*\n' +
    '• Либо напиши в чат одной строкой: `цена вес`\n' +
    'Пример: `299 1.3` (цена 299¥, вес 1.3 кг).\n\n' +
    `⚡ Фиксированная комиссия за выкуп: всего *${CONFIG.fixedServiceFee} ₽*!`,
    {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        ['📦 Рассчитать заказ', '📋 Тарифы сервиса']
      ]).resize()
    }
  );
});

// Тарифы
bot.hears('📋 Тарифы сервиса', async (ctx) => {
  await ctx.reply(
    `📋 *Прозрачные условия доставки:*\n\n` +
    `• Доставка под ключ (Карго): *${CONFIG.clientDeliveryPerKg} ₽ / кг* (включая упаковку и трекинг)\n` +
    `• Комиссия за оформление и выкуп: *всего ${CONFIG.fixedServiceFee} ₽* за весь заказ!\n` +
    `• Проверка на брак и фотоотчет на складе: *Бесплатно*`,
    { parse_mode: 'Markdown' }
  );
});

// Пошаговый расчет
bot.hears('📦 Рассчитать заказ', async (ctx) => {
  userState.set(ctx.from.id, { step: 'WAITING_PRICE' });
  await ctx.reply(
    'Введите стоимость товара в **юанях (¥)**:\nНапример: `320`',
    { parse_mode: 'Markdown' }
  );
});

// Кнопки категорий веса
bot.action(/cat_(.+)/, async (ctx) => {
  const cat = ctx.match[1];
  await ctx.answerCbQuery();

  const state = userState.get(ctx.from.id);
  if (!state || state.step !== 'WAITING_WEIGHT') {
    return ctx.reply('Начните расчет заново через кнопку меню.');
  }

  let weight = 1.0;
  if (cat === 'shoes') weight = 1.3;
  else if (cat === 'hoodie') weight = 0.8;
  else if (cat === 'tshirt') weight = 0.35;
  else if (cat === 'heavy') weight = 2.0;

  state.weight = weight;
  await sendReceipt(ctx, state.price, state.weight);
  userState.delete(ctx.from.id);
});

// Формирование красивого клиентского чека
async function sendReceipt(ctx, price, weight) {
  const res = calculateClientReceipt(price, weight);

  const receipt =
    `🧾 *ДЕТАЛИЗАЦИЯ ВАШЕГО ЗАКАЗА:*\n\n` +
    `• Стоимость товара (${price} ¥ по курсу ${res.clientCnyRate} ₽): *${res.clientGoodsCost} ₽*\n` +
    `• Доставка под ключ (${weight} кг × ${CONFIG.clientDeliveryPerKg} ₽): *${res.clientDeliveryCost} ₽*\n` +
    `• Комиссия сервиса за выкуп: *${res.visibleServiceFee} ₽*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *ИТОГО К ОПЛАТЕ: ${res.finalTotal} ₽*\n\n` +
    `_Срок доставки: 14–20 дней до РФ. Страховка включена._`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(receipt, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply(receipt, { parse_mode: 'Markdown' });
  }
}

// Слушатель текста
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;

  // 1. АДМИНКА: обновление базового курса каждое утро
  // Команда: "курс 13.8" или "курс 14.1"
  const adminMatch = text.match(/^курс\s+([\d.,]+)$/i);
  if (adminMatch) {
    if (userId !== ADMIN_ID) {
      return ctx.reply('У вас нет прав администратора.');
    }

    const rate = parseFloat(adminMatch[1].replace(',', '.'));
    if (isNaN(rate) || rate <= 0) {
      return ctx.reply('Введите корректное число для курса.');
    }

    CONFIG.baseCnyRate = rate;
    return ctx.reply(
      `✅ *Базовый курс успешно обновлен!*\nУстановлено: *${rate} ₽ / 1 ¥*.\nБот автоматически пересчитал клиентские чеки.`,
      { parse_mode: 'Markdown' }
    );
  }

  // 2. Пошаговый ввод цены
  const state = userState.get(userId);
  if (state && state.step === 'WAITING_PRICE') {
    const price = parseFloat(text.replace(',', '.'));
    if (isNaN(price) || price <= 0) {
      return ctx.reply('Введи цену числом:');
    }

    state.price = price;
    state.step = 'WAITING_WEIGHT';
    userState.set(userId, state);

    return ctx.reply(
      `Цена: *${price} ¥*.\nВыбери тип товара для оценки веса или напиши вес вручную (например, \`1.2\`):`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('👟 Обувь (~1.3 кг)', 'cat_shoes')],
          [Markup.button.callback('🧥 Худи / Свитшот (~0.8 кг)', 'cat_hoodie')],
          [Markup.button.callback('👕 Футболка / Шорты (~0.35 кг)', 'cat_tshirt')],
          [Markup.button.callback('🥾 Куртка / Пуховик (~2.0 кг)', 'cat_heavy')]
        ])
      }
    );
  }

  // 3. Пошаговый ввод веса
  if (state && state.step === 'WAITING_WEIGHT') {
    const weight = parseFloat(text.replace(',', '.').replace('кг', '').replace('kg', ''));
    if (isNaN(weight) || weight <= 0) {
      return ctx.reply('Укажи вес числом (например, `0.8`) или нажми на кнопку выше:');
    }

    userState.delete(userId);
    return sendReceipt(ctx, state.price, weight);
  }

  // 4. Экспресс-расчет строкой: "350 1.2"
  const quickMatch = text.match(/^(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)(?:\s*(?:кг|kg))?$/i);
  if (quickMatch) {
    const price = parseFloat(quickMatch[1].replace(',', '.'));
    const weight = parseFloat(quickMatch[2].replace(',', '.'));
    return sendReceipt(ctx, price, weight);
  }

  return next();
});

bot.launch().then(() => console.log('>>> БОТ-КАЛЬКУЛЯТОР С УМНОЙ НАЦЕНКОЙ ЗАПУЩЕН! <<<'));

// Порт для Render
const port = process.env.PORT || 3000;
http.createServer((req, res) => res.end('China Calc running')).listen(port, () => {
  console.log(`Сервер слушает порт ${port}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));