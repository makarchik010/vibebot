const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);

// НАСТРОЙКИ АДМИНИСТРАТОРА
const ADMIN_ID = 123456789; // Твой цифровой ID
const MANAGER_USERNAME = 'cargo2828'; // Например: makar_cargo

// Файл для автосохранения курса
const RATES_FILE = path.join(__dirname, 'rates.json');

// Загрузка сохраненного курса или дефолт
function loadRate() {
  try {
    if (fs.existsSync(RATES_FILE)) {
      const data = JSON.parse(fs.readFileSync(RATES_FILE, 'utf8'));
      if (data && data.baseCnyRate) return data.baseCnyRate;
    }
  } catch (e) {
    console.error('Ошибка чтения rates.json:', e);
  }
  return 13.5;
}

function saveRate(rate) {
  try {
    fs.writeFileSync(RATES_FILE, JSON.stringify({ baseCnyRate: rate }, null, 2));
  } catch (e) {
    console.error('Ошибка записи rates.json:', e);
  }
}

// Конфигурация тарифов
const CONFIG = {
  baseCnyRate: loadRate(),
  clientDeliveryPerKg: 1250, // Клиентская ставка за 1 кг
  fixedServiceFee: 150       // Символическая комиссия в чеке
};

// Сессии диалогов
const userState = new Map();

// Умный расчет стоимости
function calculateClientReceipt(cnyPrice, weightKg) {
  const rawCost = cnyPrice * CONFIG.baseCnyRate;

  let targetMarginPercent = 0.10;
  if (rawCost <= 1000) {
    targetMarginPercent = 0.30;
  } else if (rawCost <= 5000) {
    targetMarginPercent = 0.20;
  }

  const totalTargetProfit = rawCost * targetMarginPercent;
  const deliveryProfit = weightKg * (CONFIG.clientDeliveryPerKg - 1000);
  const visibleServiceFee = CONFIG.fixedServiceFee;

  let profitInRate = totalTargetProfit - deliveryProfit - visibleServiceFee;
  if (profitInRate < 0) profitInRate = 0;

  const rateMarkupPerCny = profitInRate / cnyPrice;
  const clientCnyRate = CONFIG.baseCnyRate + rateMarkupPerCny;

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

// Меню бота
const mainMenu = Markup.keyboard([
  ['📦 Рассчитать заказ', 'ℹ️ Условия и FAQ'],
  ['💬 Связь с менеджером']
]).resize();

bot.start(async (ctx) => {
  userState.delete(ctx.from.id);
  await ctx.reply(
    '🇨🇳 *CARGO2828 — Доставка и выкуп товаров из Китая*\n\n' +
    '📌 *Как рассчитать заказ:*\n' +
    '• Нажми *«📦 Рассчитать заказ»* и выбери готовый шаблон.\n' +
    '• Или отправь строкой: `цена вес` (например, `320 1.1`).\n\n' +
    `⚡ Фиксированная комиссия за выкуп: всего *${CONFIG.fixedServiceFee} ₽*!`,
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

// Условия и FAQ
bot.hears('ℹ️ Условия и FAQ', async (ctx) => {
  await ctx.reply(
    '📋 *ИНФОРМАЦИЯ И УСЛОВИЯ ДОСТАВКИ:*\n\n' +
    '⏱ *Сроки доставки:*\n' +
    '• В среднем *20–25 дней* со склада в Китае до Москвы.\n\n' +
    '📦 *Получение посылки:*\n' +
    '• Все заказы отправляются по России компанией **СДЭК**.\n' +
    '• ⚠️ *Доставка СДЭКом оплачивается клиентом отдельно* при получении в пункте выдачи.\n\n' +
    '🛡 *Упаковка:*\n' +
    '• Карго упаковывает груз в прочные коробки с плотной фиксацией скотчем и уголками.\n\n' +
    `💰 *Комиссия сервиса:* фиксированные *${CONFIG.fixedServiceFee} ₽* за выкуп!`,
    { parse_mode: 'Markdown' }
  );
});

// Связь с менеджером
bot.hears('💬 Связь с менеджером', async (ctx) => {
  await ctx.reply(
    'По всем вопросам, оптовым заказам и нестандартным грузам:\n' +
    `👉 [Написать менеджеру](https://t.me/${MANAGER_USERNAME})`,
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
});

// Запуск расчета
bot.hears('📦 Рассчитать заказ', async (ctx) => {
  userState.set(ctx.from.id, { step: 'WAITING_PRICE' });
  await ctx.reply(
    'Введите стоимость товара в **юанях (¥)**:\nНапример: `280`',
    { parse_mode: 'Markdown' }
  );
});

// Выбор категории веса
bot.action(/cat_(.+)/, async (ctx) => {
  const cat = ctx.match[1];
  await ctx.answerCbQuery();

  const state = userState.get(ctx.from.id);
  if (!state || state.step !== 'WAITING_WEIGHT') {
    return ctx.reply('Начните расчет заново через меню.');
  }

  let weight = 1.0;
  if (cat === 'tshirt') weight = 0.27; // Футболка 265г
  else if (cat === 'polo') weight = 0.40;   // Поло 400г
  else if (cat === 'hoodie') weight = 1.0;  // Кофта 1кг
  else if (cat === 'backpack') weight = 1.1; // Рюкзак 1.1кг
  else if (cat === 'shoes') weight = 1.3;   // Обувь 1.3кг
  else if (cat === 'jacket') weight = 2.0;  // Куртка 2кг

  state.weight = weight;
  await sendReceipt(ctx, state.price, state.weight);
});

// Генерация чека с кнопкой оформления
async function sendReceipt(ctx, price, weight) {
  const res = calculateClientReceipt(price, weight);
  const userId = ctx.from.id;

  // Сохраняем расчет в сессии на случай нажатия "Оформить"
  userState.set(userId, {
    step: 'ORDER_READY',
    price,
    weight,
    total: res.finalTotal,
    calcDetails: res
  });

  const receipt =
    `🧾 *РАСЧЕТ СТОИМОСТИ ЗАКАЗА:*\n\n` +
    `• Товар (${price} ¥ по курсу ${res.clientCnyRate} ₽): *${res.clientGoodsCost} ₽*\n` +
    `• Доставка в РФ (${weight} кг × ${CONFIG.clientDeliveryPerKg} ₽): *${res.clientDeliveryCost} ₽*\n` +
    `• Комиссия за оформление: *${res.visibleServiceFee} ₽*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *ИТОГО К ОПЛАТЕ: ${res.finalTotal} ₽*\n\n` +
    `_Срок: 20–25 дней до Мск. Отправка по РФ через СДЭК (оплата при получении)._`;

  const inlineKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📩 Оформить этот заказ', 'start_order')]
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(receipt, { parse_mode: 'Markdown', ...inlineKeyboard });
  } else {
    await ctx.reply(receipt, { parse_mode: 'Markdown', ...inlineKeyboard });
  }
}

// Старт оформления заказа
bot.action('start_order', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const state = userState.get(userId);

  if (!state || !state.total) {
    return ctx.reply('Сначала сделайте расчет через кнопку «📦 Рассчитать заказ».');
  }

  state.step = 'WAITING_ORDER_DETAILS';
  userState.set(userId, state);

  await ctx.reply(
    '📝 *Отлично, оформляем заказ!*\n\n' +
    'Отправьте в одном сообщении:\n' +
    '1. Ссылку на товар (Poizon, Dewu, Taobao и т.д.)\n' +
    '2. Нужный размер (европейский или в сантиметрах) и цвет\n\n' +
    'Пример:\n_https://dw4.co/... размер 42 EU, цвет черный_',
    { parse_mode: 'Markdown' }
  );
});

// Слушатель входящих текстовых сообщений
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;
  const state = userState.get(userId);

  // 1. АДМИНКА: смена курса с сохранением в JSON-файл
  const adminMatch = text.match(/^курс\s+([\d.,]+)$/i);
  if (adminMatch) {
    if (userId !== ADMIN_ID) {
      return ctx.reply('У вас нет прав администратора.');
    }

    const rate = parseFloat(adminMatch[1].replace(',', '.'));
    if (isNaN(rate) || rate <= 0) {
      return ctx.reply('Введите корректное число.');
    }

    CONFIG.baseCnyRate = rate;
    saveRate(rate); // Сохраняем в rates.json

    return ctx.reply(
      `✅ *Курс юаня сохранен!*\nТекущий базовый курс: *${rate} ₽ / 1 ¥*.\nЗначение записано в файл и переживет перезапуск сервера.`,
      { parse_mode: 'Markdown' }
    );
  }

  // 2. Оформление заказа: получение ссылки и деталей от клиента
  if (state && state.step === 'WAITING_ORDER_DETAILS') {
    const userContact = ctx.from.username ? `@${ctx.from.username}` : `tg://user?id=${ctx.from.id}`;
    const userName = ctx.from.first_name || 'Клиент';

    // Формируем карточку заказа для администратора
    const adminNotification =
      `🔥 *НОВАЯ ЗАЯВКА НА ВЫКУП!*\n\n` +
      `👤 Клиент: ${userName} (${userContact})\n` +
      `💰 Сумма к оплате: *${state.total} ₽*\n` +
      `📦 Расчетные параметры: *${state.price} ¥*, вес ~*${state.weight} кг*\n\n` +
      `📋 *Детали заказа от клиента:*\n${text}`;

    // Отправляем админу в ЛС
    try {
      await ctx.telegram.sendMessage(ADMIN_ID, adminNotification, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error('Ошибка отправки админу:', e);
    }

    userState.delete(userId);

    return ctx.reply(
      '✅ *Заявка успешно отправлена менеджеру!*\n\n' +
      'Мы проверим наличие товара и свяжемся с вами в Telegram для подтверждения и оплаты.',
      { parse_mode: 'Markdown', ...mainMenu }
    );
  }

  // 3. Пошаговый ввод цены
  if (state && state.step === 'WAITING_PRICE') {
    const price = parseFloat(text.replace(',', '.'));
    if (isNaN(price) || price <= 0) {
      return ctx.reply('Введите цену числом:');
    }

    state.price = price;
    state.step = 'WAITING_WEIGHT';
    userState.set(userId, state);

    return ctx.reply(
      `Цена: *${price} ¥*.\nВыбери категорию товара (с учетом упаковки) или укажи вес в кг (например, \`0.4\`):`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('👕 Футболка (~0.27 кг)', 'cat_tshirt'), Markup.button.callback('👔 Поло (~0.40 кг)', 'cat_polo')],
          [Markup.button.callback('🧥 Кофта / Худи (~1.0 кг)', 'cat_hoodie'), Markup.button.callback('🎒 Рюкзак (~1.1 кг)', 'cat_backpack')],
          [Markup.button.callback('👟 Обувь (~1.3 кг)', 'cat_shoes'), Markup.button.callback('🥾 Куртка (~2.0 кг)', 'cat_jacket')]
        ])
      }
    );
  }

  // 4. Пошаговый ввод веса вручную
  if (state && state.step === 'WAITING_WEIGHT') {
    const weight = parseFloat(text.replace(',', '.').replace('кг', '').replace('kg', ''));
    if (isNaN(weight) || weight <= 0) {
      return ctx.reply('Введите вес числом (например, `1.1`) или выберите кнопку выше:');
    }

    return sendReceipt(ctx, state.price, weight);
  }

  // 5. Быстрый расчет строкой: "350 1.1"
  const quickMatch = text.match(/^(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)(?:\s*(?:кг|kg))?$/i);
  if (quickMatch) {
    const price = parseFloat(quickMatch[1].replace(',', '.'));
    const weight = parseFloat(quickMatch[2].replace(',', '.'));
    return sendReceipt(ctx, price, weight);
  }

  return next();
});

bot.launch().then(() => console.log('>>> CARGO2828 БОТ С АВТОСОХРАНЕНИЕМ И ЗАКАЗАМИ ЗАПУЩЕН! <<<'));

// Порт для Render
const port = process.env.PORT || 3000;
http.createServer((req, res) => res.end('CARGO2828 is running')).listen(port, () => {
  console.log(`Сервер слушает порт ${port}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));