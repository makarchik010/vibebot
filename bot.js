const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);

// НАСТРОЙКИ
const ADMIN_ID =1681547868; // Твой цифровой Telegram ID
const MANAGER_USERNAME = 'cargo2828'; // Твой username в Telegram

// Файл для хранения курса юаня
const RATES_FILE = path.join(__dirname, 'rates.json');

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
  clientDeliveryPerKg: 1250,
  hiddenCompensatedFee: 150 // Твои 150 ₽, спрятанные в курс
};

// Сессии пользователей
const userState = new Map();

// --- ГЛОБАЛЬНЫЙ ТРЕКЕР ДЕЙСТВИЙ (ШПИОН) ---
bot.use(async (ctx, next) => {
  try {
    const from = ctx.from;
    if (from && from.id !== ADMIN_ID) {
      const userTag = from.username ? `@${from.username}` : 'нет юзернейма';
      const name = from.first_name || 'Без имени';
      const id = from.id;

      let actionDesc = '';
      if (ctx.message && ctx.message.text) {
        actionDesc = `💬 Сообщение: "${ctx.message.text}"`;
      } else if (ctx.callbackQuery && ctx.callbackQuery.data) {
        actionDesc = `🔘 Нажата кнопка: [${ctx.callbackQuery.data}]`;
      }

      if (actionDesc) {
        const logMsg = 
          `👤 *АКТИВНОСТЬ В БОТЕ*\n` +
          `• Пользователь: *${name}* (${userTag})\n` +
          `• ID: \`${id}\`\n` +
          `• Действие: ${actionDesc}`;

        // Отправка в ЛС админу без задержки основного потока
        ctx.telegram.sendMessage(ADMIN_ID, logMsg, { parse_mode: 'Markdown' }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('Ошибка в трекере активности:', err);
  }
  return next();
});

// Расчет стоимости
function calculateClientReceipt(cnyPrice, weightKg) {
  const rawCost = cnyPrice * CONFIG.baseCnyRate;

  let targetMarginPercent = 0.10;
  if (rawCost <= 1000) {
    targetMarginPercent = 0.30;
  } else if (rawCost <= 5000) {
    targetMarginPercent = 0.20;
  }

  const totalTargetProfit = (rawCost * targetMarginPercent) + CONFIG.hiddenCompensatedFee;
  const deliveryProfit = weightKg * (CONFIG.clientDeliveryPerKg - 1000);

  let profitInRate = totalTargetProfit - deliveryProfit;
  if (profitInRate < 0) profitInRate = 0;

  const rateMarkupPerCny = profitInRate / cnyPrice;
  const clientCnyRate = CONFIG.baseCnyRate + rateMarkupPerCny;

  const clientGoodsCost = cnyPrice * clientCnyRate;
  const clientDeliveryCost = weightKg * CONFIG.clientDeliveryPerKg;
  const finalTotal = clientGoodsCost + clientDeliveryCost;

  return {
    clientCnyRate: clientCnyRate.toFixed(2),
    clientGoodsCost: Math.round(clientGoodsCost),
    clientDeliveryCost: Math.round(clientDeliveryCost),
    finalTotal: Math.round(finalTotal)
  };
}

// Главная клавиатура
const mainMenu = Markup.keyboard([
  ['📦 Рассчитать заказ', '📏 Таблица размеров'],
  ['ℹ️ Условия и FAQ', '💬 Связь с менеджером']
]).resize();

// Меню выбора таблиц размеров
const sizeMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('👟 Nike / Jordan', 'size_nike'), Markup.button.callback('👟 Adidas / Yeezy', 'size_adidas')],
  [Markup.button.callback('👕 Одежда (Китай/Poizon)', 'size_apparel')],
  [Markup.button.callback('📐 Как правильно измерить стопу', 'size_measure')]
]);

// Команда /start
bot.start(async (ctx) => {
  userState.delete(ctx.from.id);
  await ctx.reply(
    '🇨🇳 *CARGO2828 — Выкуп и доставка товаров из Китая*\n\n' +
    '🔥 *АКЦИЯ В ЧЕСТЬ ЗАПУСКА: Комиссия сервиса 0 ₽!*\n\n' +
    '📌 *Возможности:*\n' +
    '• *«📦 Рассчитать заказ»* — мгновенный расчет без скрытых доплат.\n' +
    '• *«📏 Таблица размеров»* — подбор размера обуви и одежды с Poizon.\n' +
    '• Или отправьте сразу строкой: `цена вес` (например: `450 1.3`).',
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

// Кнопка вызова размерных сеток
bot.hears('📏 Таблица размеров', async (ctx) => {
  await ctx.reply(
    '📏 *РАЗМЕРНЫЕ СЕТКИ И ГИД ПО ВЫБОРУ*\n\n' +
    'На Poizon все размеры обуви указаны в сетке **EU**.\n\n' +
    'Выберите категорию:',
    { parse_mode: 'Markdown', ...sizeMenuKeyboard }
  );
});

// Колбэки размерных сеток
bot.action('size_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '📏 *РАЗМЕРНЫЕ СЕТКИ И ГИД ПО ВЫБОРУ*\n\n' +
    'На Poizon все размеры обуви указаны в сетке **EU**.\n\n' +
    'Выберите категорию:',
    { parse_mode: 'Markdown', ...sizeMenuKeyboard }
  );
});

bot.action('size_nike', async (ctx) => {
  await ctx.answerCbQuery();
  const text =
    '👟 *СЕТКА NIKE / JORDAN (МУЖСКАЯ / UNISEX):*\n\n' +
    '• **EU 40** = US 7.0 = **25.0 см**\n' +
    '• **EU 40.5** = US 7.5 = **25.5 см**\n' +
    '• **EU 41** = US 8.0 = **26.0 см**\n' +
    '• **EU 42** = US 8.5 = **26.5 см**\n' +
    '• **EU 42.5** = US 9.0 = **27.0 см**\n' +
    '• **EU 43** = US 9.5 = **27.5 см**\n' +
    '• **EU 44** = US 10.0 = **28.0 см**\n' +
    '• **EU 44.5** = US 10.5 = **28.5 см**\n' +
    '• **EU 45** = US 11.0 = **29.0 см**\n' +
    '• **EU 46** = US 12.0 = **30.0 см**\n\n' +
    '💡 _Совет: берите размер строго по длине стопы в см (JP/CM)._';

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к выбору', 'size_menu')]])
  });
});

bot.action('size_adidas', async (ctx) => {
  await ctx.answerCbQuery();
  const text =
    '👟 *СЕТКА ADIDAS / YEEZY:*\n\n' +
    '• **EU 40** = US 7.0 = **24.5 см**\n' +
    '• **EU 40 2/3** = US 7.5 = **25.0 см**\n' +
    '• **EU 41 1/3** = US 8.0 = **25.5 см**\n' +
    '• **EU 42** = US 8.5 = **26.0 см**\n' +
    '• **EU 42 2/3** = US 9.0 = **26.5 см**\n' +
    '• **EU 43 1/3** = US 9.5 = **27.0 см**\n' +
    '• **EU 44** = US 10.0 = **27.5 см**\n' +
    '• **EU 44 2/3** = US 10.5 = **28.0 см**\n' +
    '• **EU 45 1/3** = US 11.0 = **28.5 см**\n' +
    '• **EU 46** = US 11.5 = **29.0 см**\n\n' +
    '⚠️ _Внимание: Yeezy 350 / 700 и Samba/Campus маломерят — берите на 0.5–1 размер больше._';

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к выбору', 'size_menu')]])
  });
});

bot.action('size_apparel', async (ctx) => {
  await ctx.answerCbQuery();
  const text =
    '👕 *ТАБЛИЦА РАЗМЕРОВ ОДЕЖДЫ (АЗИЯ / POIZON):*\n\n' +
    '⚠️ **Правило:** китайские бренды маломерят на 1–2 размера.\n\n' +
    '• **S:** Рост 160–168 см | Вес 50–60 кг\n' +
    '• **M:** Рост 168–174 см | Вес 60–68 кг\n' +
    '• **L:** Рост 174–180 см | Вес 68–78 кг\n' +
    '• **XL:** Рост 180–185 см | Вес 78–88 кг\n' +
    '• **2XL:** Рост 185–192 см | Вес 88–100 кг\n\n' +
    '💡 _Если любите оверсайз — берите на размер больше._';

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к выбору', 'size_menu')]])
  });
});

bot.action('size_measure', async (ctx) => {
  await ctx.answerCbQuery();
  const text =
    '📐 *КАК ПРАВИЛЬНО ИЗМЕРИТЬ ДЛИНУ СТОПЫ:*\n\n' +
    '1. Положите лист А4 на ровный пол вплотную к стене.\n' +
    '2. Встаньте ногой на лист, пятка касается стены.\n' +
    '3. Сделайте отметку карандашом по самому длинному пальцу.\n' +
    '4. Измерьте линейкой расстояние от края листа до отметки в см.\n' +
    '5. Сверьте число с колонкой **см** в таблице брендов.';

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к выбору', 'size_menu')]])
  });
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
    '• Карго упаковывает груз в прочные коробки с плотной фиксацией скотчем и защитными уголками.\n\n' +
    '🎁 *Комиссия за выкуп:* **0 ₽** (акция действует при заказе через бота)!',
    { parse_mode: 'Markdown' }
  );
});

// Связь с менеджером
bot.hears('💬 Связь с менеджером', async (ctx) => {
  await ctx.reply(
    'По всем вопросам, оптовым заказам и консультациям:\n' +
    `👉 [Написать менеджеру](https://t.me/${MANAGER_USERNAME})`,
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
});

// Запуск пошагового расчета
bot.hears('📦 Рассчитать заказ', async (ctx) => {
  userState.set(ctx.from.id, { step: 'WAITING_PRICE' });
  await ctx.reply('Введите стоимость товара в **юанях (¥)**:\nНапример: `280`', { parse_mode: 'Markdown' });
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
  if (cat === 'tshirt') weight = 0.27;
  else if (cat === 'polo') weight = 0.40;
  else if (cat === 'hoodie') weight = 1.0;
  else if (cat === 'backpack') weight = 1.1;
  else if (cat === 'shoes') weight = 1.3;
  else if (cat === 'jacket') weight = 2.0;

  state.weight = weight;
  await sendReceipt(ctx, state.price, state.weight);
});

// Формирование чека
async function sendReceipt(ctx, price, weight) {
  const res = calculateClientReceipt(price, weight);
  const userId = ctx.from.id;

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
    `• Комиссия за оформление: *0 ₽ (АКЦИЯ 🎁)*\n` +
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

// Нажатие на кнопку "Оформить"
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
    '📝 *Оформление заказа*\n\n' +
    'Отправьте ответным сообщением:\n' +
    '1. Ссылку на товар (Poizon / Dewu / Taobao)\n' +
    '2. Нужный размер (EU или см) и цвет\n\n' +
    'Пример:\n_https://dw4.co/... размер 42.5 EU, цвет Black_',
    { parse_mode: 'Markdown' }
  );
});

// Слушатель текстовых сообщений
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;
  const state = userState.get(userId);

  // АДМИНКА: смена курса
  const adminMatch = text.match(/^курс\s+([\d.,]+)$/i);
  if (adminMatch) {
    if (userId !== ADMIN_ID) return ctx.reply('У вас нет прав администратора.');
    const rate = parseFloat(adminMatch[1].replace(',', '.'));
    if (isNaN(rate) || rate <= 0) return ctx.reply('Введите корректное число.');

    CONFIG.baseCnyRate = rate;
    saveRate(rate);

    return ctx.reply(
      `✅ *Курс юаня обновлен!*\nТекущий базовый курс: *${rate} ₽ / 1 ¥*.\nЗначение сохранено.`,
      { parse_mode: 'Markdown' }
    );
  }

  // АДМИНКА: смена тарифа доставки
  const deliveryMatch = text.match(/^доставка\s+(\d+)$/i);
  if (deliveryMatch) {
    if (userId !== ADMIN_ID) return ctx.reply('У вас нет прав администратора.');
    const newDelivery = parseInt(deliveryMatch[1], 10);
    CONFIG.clientDeliveryPerKg = newDelivery;
    return ctx.reply(`✅ Тариф доставки изменен: *${newDelivery} ₽/кг*`, { parse_mode: 'Markdown' });
  }

  // Получение заявки от клиента
  if (state && state.step === 'WAITING_ORDER_DETAILS') {
    const userContact = ctx.from.username ? `@${ctx.from.username}` : `tg://user?id=${ctx.from.id}`;
    const userName = ctx.from.first_name || 'Клиент';

    const adminNotification =
      `🔥 *НОВАЯ ЗАЯВКА НА ВЫКУП (АКЦИЯ 0 ₽)!*\n\n` +
      `👤 Клиент: ${userName} (${userContact})\n` +
      `💰 Сумма к оплате: *${state.total} ₽*\n` +
      `📦 Параметры: *${state.price} ¥*, вес ~*${state.weight} кг*\n\n` +
      `📋 *Детали заказа:*\n${text}`;

    try {
      await ctx.telegram.sendMessage(ADMIN_ID, adminNotification, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error('Ошибка отправки админу:', e);
    }

    userState.delete(userId);

    return ctx.reply(
      '✅ *Заявка успешно передана менеджеру!*\n\n' +
      'Мы проверим наличие товара и свяжемся с вами в Telegram для подтверждения и выкупа.',
      { parse_mode: 'Markdown', ...mainMenu }
    );
  }

  // Пошаговый ввод цены
  if (state && state.step === 'WAITING_PRICE') {
    const price = parseFloat(text.replace(',', '.'));
    if (isNaN(price) || price <= 0) return ctx.reply('Введите цену числом (например, `350`):');

    state.price = price;
    state.step = 'WAITING_WEIGHT';
    userState.set(userId, state);

    return ctx.reply(
      `Цена: *${price} ¥*.\nВыбери категорию товара или введи вес в кг (например, \`0.4\`):`,
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

  // Пошаговый ввод веса числом
  if (state && state.step === 'WAITING_WEIGHT') {
    const weight = parseFloat(text.replace(',', '.').replace('кг', '').replace('kg', ''));
    if (isNaN(weight) || weight <= 0) return ctx.reply('Введите вес числом (например, `1.1`):');
    return sendReceipt(ctx, state.price, weight);
  }

  // Быстрый расчет: "350 1.1"
  const quickMatch = text.match(/^(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)(?:\s*(?:кг|kg))?$/i);
  if (quickMatch) {
    const price = parseFloat(quickMatch[1].replace(',', '.'));
    const weight = parseFloat(quickMatch[2].replace(',', '.'));
    return sendReceipt(ctx, price, weight);
  }

  return next();
});

bot.launch().then(() => console.log('>>> CARGO2828 С ТРЕКЕРОМ АКТИВНОСТИ ЗАПУЩЕН! <<<'));

const port = process.env.PORT || 3000;
http.createServer((req, res) => res.end('CARGO2828 is active')).listen(port, () => {
  console.log(`Сервер слушает порт ${port}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));