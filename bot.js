const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);

// УКАЖИ СВОЙ TELEGRAM ID (число из @userinfobot)
const ADMIN_ID = 1681547868;

// Конфигурация тарифов
const CONFIG = {
  cargoRubPerKg: 1000, // 1000 руб за 1 кг
  currentCnyRate: 13.5 // Базовый курс по умолчанию, если утром не обновил
};

// Сессии пользователей для пошагового ввода
const userState = new Map();

// Расчет наценки в зависимости от стоимости выкупа в рублях
function getMarkupPercent(goodsCostRub) {
  if (goodsCostRub <= 1000) return 0.30; // 30%
  if (goodsCostRub <= 5000) return 0.20; // 20%
  return 0.10;                          // 10%
}

// Расчет стоимости под ключ
function calculateFullPrice(cnyPrice, weightKg) {
  const goodsCostRub = cnyPrice * CONFIG.currentCnyRate;
  const markupPercent = getMarkupPercent(goodsCostRub);
  const commissionRub = goodsCostRub * markupPercent;
  const deliveryRub = weightKg * CONFIG.cargoRubPerKg;
  const totalCost = goodsCostRub + commissionRub + deliveryRub;

  return {
    cnyRate: CONFIG.currentCnyRate,
    goodsCostRub,
    markupPercent: Math.round(markupPercent * 100),
    commissionRub,
    deliveryRub,
    totalCost
  };
}

// Старт
bot.start(async (ctx) => {
  userState.delete(ctx.from.id);
  await ctx.reply(
    '🇨🇳 *Калькулятор доставки товаров из Китая*\n\n' +
    '📌 *Как рассчитать:*\n' +
    '1. Нажми кнопку *«📦 Рассчитать товар»* для выбора категории.\n' +
    '2. Или отправь в чат строкой: `цена вес`\n' +
    'Пример: `300 1.3` (300 юаней, вес 1.3 кг).\n\n' +
    `Текущий курс выкупа: *${CONFIG.currentCnyRate} ₽ / 1 ¥*`,
    {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        ['📦 Рассчитать товар', '📊 Текущий курс']
      ]).resize()
    }
  );
});

// Кнопка проверки текущего курса
bot.hears('📊 Текущий курс', async (ctx) => {
  await ctx.reply(
    `📊 *Параметры расчета:*\n\n` +
    `• Курс юаня: *${CONFIG.currentCnyRate} ₽*\n` +
    `• Доставка: *${CONFIG.cargoRubPerKg} ₽ / кг*\n\n` +
    `*Сетка комиссии:*\n` +
    `• До 1 000 ₽: *30%*\n` +
    `• 1 000 – 5 000 ₽: *20%*\n` +
    `• От 5 000 ₽: *10%*`,
    { parse_mode: 'Markdown' }
  );
});

// Запуск пошагового мастера
bot.hears('📦 Рассчитать товар', async (ctx) => {
  userState.set(ctx.from.id, { step: 'WAITING_PRICE' });
  await ctx.reply(
    'Введите стоимость товара в **юанях (¥)**:\nНапример: `240`',
    { parse_mode: 'Markdown' }
  );
});

// Обработка выбора шаблона веса
bot.action(/cat_(.+)/, async (ctx) => {
  const cat = ctx.match[1];
  await ctx.answerCbQuery();

  const state = userState.get(ctx.from.id);
  if (!state || state.step !== 'WAITING_WEIGHT') {
    return ctx.reply('Начните расчет заново через меню.');
  }

  let weight = 1.0;
  if (cat === 'shoes') weight = 1.3;        // Кроссовки
  else if (cat === 'hoodie') weight = 0.8;  // Худи / свитшот
  else if (cat === 'tshirt') weight = 0.35; // Футболка / аксессуары
  else if (cat === 'heavy') weight = 2.0;   // Куртка / ботинки

  state.weight = weight;
  await sendReceipt(ctx, state.price, state.weight);
  userState.delete(ctx.from.id);
});

// Отправка чека клиенту
async function sendReceipt(ctx, price, weight) {
  const calc = calculateFullPrice(price, weight);

  const receipt =
    `🧾 *РАСЧЕТ СТОИМОСТИ ПОД КЛЮЧ:*\n\n` +
    `• Товар: *${price} ¥* × ${calc.cnyRate} ₽ = *${calc.goodsCostRub.toFixed(0)} ₽*\n` +
    `• Наша комиссия (${calc.markupPercent}%): *${calc.commissionRub.toFixed(0)} ₽*\n` +
    `• Доставка (${weight} кг × ${CONFIG.cargoRubPerKg} ₽): *${calc.deliveryRub.toFixed(0)} ₽*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *ИТОГО К ОПЛАТЕ: ${calc.totalCost.toFixed(0)} ₽*`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(receipt, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply(receipt, { parse_mode: 'Markdown' });
  }
}

// Главный обработчик текстовых сообщений
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;

  // 1. АДМИН-КОМАНДА: установка курса каждое утро
  // Формат: "курс 13.8" или "курс 14"
  const adminRateMatch = text.match(/^курс\s+([\d.,]+)$/i);
  if (adminRateMatch) {
    if (userId !== ADMIN_ID) {
      return ctx.reply('У вас нет прав для изменения курса.');
    }

    const newRate = parseFloat(adminRateMatch[1].replace(',', '.'));
    if (isNaN(newRate) || newRate <= 0) {
      return ctx.reply('Укажи корректное число для курса.');
    }

    CONFIG.currentCnyRate = newRate;
    return ctx.reply(`✅ *Курс юаня успешно обновлен!*\nНовый рабочий курс: *${newRate} ₽ / 1 ¥*`, { parse_mode: 'Markdown' });
  }

  // 2. Пошаговый ввод: цена
  const state = userState.get(userId);
  if (state && state.step === 'WAITING_PRICE') {
    const price = parseFloat(text.replace(',', '.'));
    if (isNaN(price) || price <= 0) {
      return ctx.reply('Введи стоимость числом:');
    }

    state.price = price;
    state.step = 'WAITING_WEIGHT';
    userState.set(userId, state);

    return ctx.reply(
      `Цена: *${price} ¥*.\nВыбери категорию или введи точный вес в кг (например, \`1.2\`):`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('👟 Кроссовки (~1.3 кг)', 'cat_shoes')],
          [Markup.button.callback('🧥 Худи (~0.8 кг)', 'cat_hoodie')],
          [Markup.button.callback('👕 Футболка (~0.35 кг)', 'cat_tshirt')],
          [Markup.button.callback('🥾 Куртка (~2.0 кг)', 'cat_heavy')]
        ])
      }
    );
  }

  // 3. Пошаговый ввод: вес вручную
  if (state && state.step === 'WAITING_WEIGHT') {
    const weight = parseFloat(text.replace(',', '.').replace('кг', '').replace('kg', ''));
    if (isNaN(weight) || weight <= 0) {
      return ctx.reply('Введи вес числом (например, `0.9`) или выбери кнопку выше:');
    }

    userState.delete(userId);
    return sendReceipt(ctx, state.price, weight);
  }

  // 4. Быстрый ввод одной строкой: "280 1.3" (цена и вес)
  const quickMatch = text.match(/^(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)(?:\s*(?:кг|kg))?$/i);
  if (quickMatch) {
    const price = parseFloat(quickMatch[1].replace(',', '.'));
    const weight = parseFloat(quickMatch[2].replace(',', '.'));
    return sendReceipt(ctx, price, weight);
  }

  return next();
});

bot.launch().then(() => console.log('>>> БОТ КАРГО-РАСЧЕТНИК ЗАПУЩЕН! <<<'));

// Заглушка для Render
const port = process.env.PORT || 3000;
http.createServer((req, res) => res.end('Cargo calc is running')).listen(port, () => {
  console.log(`Сервер слушает порт ${port}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));