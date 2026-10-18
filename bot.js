const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);

// НАСТРОЙКИ
const ADMIN_ID = 1681547868; // Твой цифровой Telegram ID
const MANAGER_USERNAME = 'cargo2828'; // Твой username в Telegram

// Файлы базы данных
const RATES_FILE = path.join(__dirname, 'rates.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// База пользователей для рассылки
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) { console.error('Ошибка чтения users.json:', e); }
  return [];
}

function saveUser(userId) {
  if (userId === ADMIN_ID) return; // Админа в базу рассылки не пишем
  const users = loadUsers();
  if (!users.includes(userId)) {
    users.push(userId);
    try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); } 
    catch (e) { console.error('Ошибка записи users.json:', e); }
  }
}

// База курса юаня
function loadRate() {
  try {
    if (fs.existsSync(RATES_FILE)) {
      const data = JSON.parse(fs.readFileSync(RATES_FILE, 'utf8'));
      if (data && data.baseCnyRate) return data.baseCnyRate;
    }
  } catch (e) { console.error('Ошибка чтения rates.json:', e); }
  return 13.5;
}

function saveRate(rate) {
  try { fs.writeFileSync(RATES_FILE, JSON.stringify({ baseCnyRate: rate }, null, 2)); } 
  catch (e) { console.error('Ошибка записи rates.json:', e); }
}

// Конфигурация тарифов
const CONFIG = {
  baseCnyRate: loadRate(),
  clientDeliveryPerKg: 1250,
  hiddenCompensatedFee: 150
};

// Сессии пользователей
const userState = new Map();

// --- ГЛОБАЛЬНЫЙ ТРЕКЕР ДЕЙСТВИЙ И СБОР БАЗЫ ---
bot.use(async (ctx, next) => {
  try {
    const from = ctx.from;
    if (from) {
      saveUser(from.id); // Записываем пользователя в базу для рассылок

      if (from.id !== ADMIN_ID) {
        const userTag = from.username ? `@${from.username}` : 'нет юзернейма';
        const name = from.first_name || 'Без имени';
        
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
            `• ID: \`${from.id}\`\n` +
            `• Действие: ${actionDesc}`;
          ctx.telegram.sendMessage(ADMIN_ID, logMsg, { parse_mode: 'Markdown' }).catch(() => {});
        }
      }
    }
  } catch (err) { console.error('Ошибка в трекере:', err); }
  return next();
});

// Расчет стоимости
function calculateClientReceipt(cnyPrice, weightKg) {
  const rawCost = cnyPrice * CONFIG.baseCnyRate;

  let targetMarginPercent = 0.10;
  if (rawCost <= 1000) targetMarginPercent = 0.30;
  else if (rawCost <= 5000) targetMarginPercent = 0.20;

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

// Клавиатуры
const mainMenu = Markup.keyboard([
  ['📦 Рассчитать заказ', '📏 Таблица размеров'],
  ['ℹ️ Условия и FAQ', '💬 Связь с менеджером']
]).resize();

const sizeMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('👟 Nike / Jordan', 'size_nike'), Markup.button.callback('👟 Adidas / Yeezy', 'size_adidas')],
  [Markup.button.callback('👕 Одежда (Китай/Poizon)', 'size_apparel')],
  [Markup.button.callback('📐 Как правильно измерить стопу', 'size_measure')]
]);

// Команды
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

bot.hears('📏 Таблица размеров', async (ctx) => {
  await ctx.reply(
    '📏 *РАЗМЕРНЫЕ СЕТКИ И ГИД ПО ВЫБОРУ*\nВыберите категорию:',
    { parse_mode: 'Markdown', ...sizeMenuKeyboard }
  );
});

bot.action('size_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📏 *РАЗМЕРНЫЕ СЕТКИ И ГИД ПО ВЫБОРУ*\nВыберите категорию:', { parse_mode: 'Markdown', ...sizeMenuKeyboard });
});

bot.action('size_nike', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '👟 *СЕТКА NIKE / JORDAN:*\n• **EU 40** = **25.0 см**\n• **EU 41** = **26.0 см**\n• **EU 42** = **26.5 см**\n• **EU 43** = **27.5 см**\n• **EU 44** = **28.0 см**\n• **EU 45** = **29.0 см**\n\n💡 _Берите строго по длине стопы в см._',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к выбору', 'size_menu')]]) }
  );
});

bot.action('size_adidas', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '👟 *СЕТКА ADIDAS / YEEZY:*\n• **EU 40 2/3** = **25.0 см**\n• **EU 41 1/3** = **25.5 см**\n• **EU 42 2/3** = **26.5 см**\n• **EU 43 1/3** = **27.0 см**\n• **EU 44 2/3** = **28.0 см**\n\n⚠️ _Yeezy и Samba маломерят — берите на 0.5-1 размер больше._',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к выбору', 'size_menu')]]) }
  );
});

bot.action('size_apparel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '👕 *ОДЕЖДА (АЗИЯ):*\n⚠️ Китайские бренды маломерят на 1-2 размера.\n• **S:** 160-168 см | 50-60 кг\n• **M:** 168-174 см | 60-68 кг\n• **L:** 174-180 см | 68-78 кг\n• **XL:** 180-185 см | 78-88 кг',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к выбору', 'size_menu')]]) }
  );
});

bot.action('size_measure', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '📐 *КАК ИЗМЕРИТЬ СТОПУ:*\n1. Положите лист А4 к стене.\n2. Встаньте ногой на лист, пятка у стены.\n3. Отметьте самый длинный палец.\n4. Измерьте в см и сверьте с таблицей.',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к выбору', 'size_menu')]]) }
  );
});

bot.hears('ℹ️ Условия и FAQ', async (ctx) => {
  await ctx.reply(
    '📋 *ИНФОРМАЦИЯ:*\n⏱ *Сроки:* 20–25 дней до Мск.\n📦 *Получение:* СДЭК (оплата по РФ при получении).\n🎁 *Комиссия:* 0 ₽ (акция)!',
    { parse_mode: 'Markdown' }
  );
});

bot.hears('💬 Связь с менеджером', async (ctx) => {
  await ctx.reply(`👉 [Написать менеджеру](https://t.me/${MANAGER_USERNAME})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.hears('📦 Рассчитать заказ', async (ctx) => {
  userState.set(ctx.from.id, { step: 'WAITING_PRICE' });
  await ctx.reply('Введите стоимость товара в **юанях (¥)**:', { parse_mode: 'Markdown' });
});

bot.action(/cat_(.+)/, async (ctx) => {
  const cat = ctx.match[1];
  await ctx.answerCbQuery();
  const state = userState.get(ctx.from.id);
  if (!state || state.step !== 'WAITING_WEIGHT') return ctx.reply('Начните расчет заново.');

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

async function sendReceipt(ctx, price, weight) {
  const res = calculateClientReceipt(price, weight);
  const userId = ctx.from.id;

  userState.set(userId, { step: 'ORDER_READY', price, weight, total: res.finalTotal });

  const receipt = `🧾 *РАСЧЕТ СТОИМОСТИ:*\n• Товар: *${res.clientGoodsCost} ₽*\n• Доставка в РФ: *${res.clientDeliveryCost} ₽*\n• Комиссия: *0 ₽ (АКЦИЯ 🎁)*\n━━━━━━━━━━━━━━━━━━━━\n💰 *ИТОГО: ${res.finalTotal} ₽*\n_Отправка по РФ через СДЭК._`;
  const inlineKeyboard = Markup.inlineKeyboard([[Markup.button.callback('📩 Оформить этот заказ', 'start_order')]]);

  if (ctx.callbackQuery) await ctx.editMessageText(receipt, { parse_mode: 'Markdown', ...inlineKeyboard });
  else await ctx.reply(receipt, { parse_mode: 'Markdown', ...inlineKeyboard });
}

bot.action('start_order', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const state = userState.get(userId);
  if (!state || !state.total) return ctx.reply('Сначала сделайте расчет.');

  state.step = 'WAITING_ORDER_DETAILS';
  userState.set(userId, state);
  await ctx.reply('📝 Отправьте:\n1. Ссылку на товар (Poizon/Taobao)\n2. Размер (EU/см) и цвет', { parse_mode: 'Markdown' });
});

bot.on('text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;
  const state = userState.get(userId);

  // --- АДМИНКА: РАССЫЛКА ---
  const broadcastMatch = text.match(/^рассылка\s+([\s\S]+)$/i);
  if (broadcastMatch) {
    if (userId !== ADMIN_ID) return ctx.reply('⛔ Нет прав.');
    const messageToBroadcast = broadcastMatch[1];
    const users = loadUsers();

    if (users.length === 0) return ctx.reply('В базе пока нет пользователей.');
    await ctx.reply(`⏳ Начинаю рассылку для ${users.length} пользователей...`);

    let success = 0;
    let fail = 0;

    for (const uid of users) {
      try {
        await ctx.telegram.sendMessage(uid, messageToBroadcast, { parse_mode: 'Markdown' });
        success++;
      } catch (e) {
        fail++;
      }
    }

    return ctx.reply(`✅ *Рассылка завершена!*\nДоставлено: ${success}\nЗаблокировали бота: ${fail}`, { parse_mode: 'Markdown' });
  }

  // АДМИНКА: СМЕНА КУРСА И ДОСТАВКИ
  if (text.match(/^курс\s+([\d.,]+)$/i)) {
    if (userId !== ADMIN_ID) return;
    const rate = parseFloat(text.match(/^курс\s+([\d.,]+)$/i)[1].replace(',', '.'));
    CONFIG.baseCnyRate = rate;
    saveRate(rate);
    return ctx.reply(`✅ Курс обновлен: *${rate} ₽ / 1 ¥*`, { parse_mode: 'Markdown' });
  }

  if (text.match(/^доставка\s+(\d+)$/i)) {
    if (userId !== ADMIN_ID) return;
    const newDel = parseInt(text.match(/^доставка\s+(\d+)$/i)[1], 10);
    CONFIG.clientDeliveryPerKg = newDel;
    return ctx.reply(`✅ Тариф доставки: *${newDel} ₽/кг*`, { parse_mode: 'Markdown' });
  }

  // Оформление заказа
  if (state && state.step === 'WAITING_ORDER_DETAILS') {
    const userContact = ctx.from.username ? `@${ctx.from.username}` : `tg://user?id=${ctx.from.id}`;
    const userName = ctx.from.first_name || 'Клиент';
    const adminNotification = `🔥 *НОВАЯ ЗАЯВКА (0 ₽)!*\n👤 ${userName} (${userContact})\n💰 Итого: *${state.total} ₽*\n📦 Параметры: *${state.price} ¥*, ~*${state.weight} кг*\n\n📋 *Детали:*\n${text}`;
    
    try { await ctx.telegram.sendMessage(ADMIN_ID, adminNotification, { parse_mode: 'Markdown' }); } 
    catch (e) { console.error(e); }
    
    userState.delete(userId);
    return ctx.reply('✅ *Заявка передана менеджеру!*\nСкоро свяжемся для подтверждения.', { parse_mode: 'Markdown', ...mainMenu });
  }

  // Шаг цены
  if (state && state.step === 'WAITING_PRICE') {
    const price = parseFloat(text.replace(',', '.'));
    if (isNaN(price) || price <= 0) return ctx.reply('Введите цену числом:');
    state.price = price;
    state.step = 'WAITING_WEIGHT';
    userState.set(userId, state);
    return ctx.reply(`Цена: *${price} ¥*.\nВыбери категорию или введи вес (кг):`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('👕 Футболка (0.27)', 'cat_tshirt'), Markup.button.callback('👔 Поло (0.40)', 'cat_polo')],
        [Markup.button.callback('🧥 Худи (1.0)', 'cat_hoodie'), Markup.button.callback('👟 Обувь (1.3)', 'cat_shoes')],
        [Markup.button.callback('🥾 Куртка (2.0)', 'cat_jacket')]
      ])
    });
  }

  // Шаг веса
  if (state && state.step === 'WAITING_WEIGHT') {
    const weight = parseFloat(text.replace(',', '.').replace(/кг|kg/i, ''));
    if (isNaN(weight) || weight <= 0) return ctx.reply('Введите вес числом:');
    return sendReceipt(ctx, state.price, weight);
  }

  // Быстрый расчет
  const quickMatch = text.match(/^(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)(?:\s*(?:кг|kg))?$/i);
  if (quickMatch) {
    const price = parseFloat(quickMatch[1].replace(',', '.'));
    const weight = parseFloat(quickMatch[2].replace(',', '.'));
    return sendReceipt(ctx, price, weight);
  }

  return next();
});

bot.launch().then(() => console.log('>>> БОТ CARGO2828 УСПЕШНО ЗАПУЩЕН <<<'));

const port = process.env.PORT || 3000;
http.createServer((req, res) => res.end('Active')).listen(port, () => console.log(`Слушаем порт ${port}`));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));