const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('КРИТИЧЕСКАЯ ОШИБКА: Переменная BOT_TOKEN не найдена!');
}

const bot = new Telegraf(token);

// НАСТРОЙКИ
const ADMIN_ID = 1681547868; // Твой Telegram ID
const MANAGER_USERNAME = 'cargo2828';

// Файлы данных
const RATES_FILE = path.join(__dirname, 'rates.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// Кэш пользователей в памяти (чтобы не долбить диск синхронно)
let usersCache = new Set();

function initStorage() {
  try {
    if (fsSync.existsSync(USERS_FILE)) {
      const data = JSON.parse(fsSync.readFileSync(USERS_FILE, 'utf8'));
      if (Array.isArray(data)) usersCache = new Set(data);
    }
  } catch (e) {
    console.error('Ошибка загрузки users.json:', e);
  }
}
initStorage();

async function saveUser(userId) {
  if (userId === ADMIN_ID || usersCache.has(userId)) return;
  usersCache.add(userId);
  try {
    await fs.writeFile(USERS_FILE, JSON.stringify([...usersCache], null, 2));
  } catch (e) {
    console.error('Ошибка сохранения users.json:', e);
  }
}

// Курс валют
function loadRate() {
  try {
    if (fsSync.existsSync(RATES_FILE)) {
      const data = JSON.parse(fsSync.readFileSync(RATES_FILE, 'utf8'));
      if (data && data.baseCnyRate) return data.baseCnyRate;
    }
  } catch (e) {
    console.error('Ошибка чтения rates.json:', e);
  }
  return 13.5;
}

async function saveRate(rate) {
  try {
    await fs.writeFile(RATES_FILE, JSON.stringify({ baseCnyRate: rate }, null, 2));
  } catch (e) {
    console.error('Ошибка записи rates.json:', e);
  }
}

const CONFIG = {
  baseCnyRate: loadRate(),
  clientDeliveryPerKg: 1250,
  hiddenCompensatedFee: 150
};

const userState = new Map();

// ГЛОБАЛЬНЫЙ ТРЕКЕР
bot.use(async (ctx, next) => {
  try {
    const from = ctx.from;
    if (from) {
      saveUser(from.id);

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
  } catch (err) {
    console.error('Ошибка в трекере:', err);
  }
  return next();
});

// Расчет
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

// Меню
const mainMenu = Markup.keyboard([
  ['📦 Рассчитать заказ', '📏 Таблица размеров'],
  ['ℹ️ Условия и FAQ', '💬 Связь с менеджером']
]).resize();

const sizeMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('👟 Nike / Jordan', 'size_nike'), Markup.button.callback('👟 Adidas / Yeezy', 'size_adidas')],
  [Markup.button.callback('👕 Одежда (Китай/Poizon)', 'size_apparel')],
  [Markup.button.callback('📐 Как правильно измерить стопу', 'size_measure')]
]);

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
  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageText('📏 *РАЗМЕРНЫЕ СЕТКИ И ГИД ПО ВЫБОРУ*\nВыберите категорию:', { parse_mode: 'Markdown', ...sizeMenuKeyboard });
});

bot.action('size_nike', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageText(
    '👟 *СЕТКА NIKE / JORDAN:*\n• **EU 40** = **25.0 см**\n• **EU 41** = **26.0 см**\n• **EU 42** = **26.5 см**\n• **EU 43** = **27.5 см**\n• **EU 44** = **28.0 см**\n• **EU 45** = **29.0 см**\n\n💡 _Берите строго по длине стопы в см._',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к выбору', 'size_menu')]]) }
  );
});

bot.action('size_adidas', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageText(
    '👟 *СЕТКА ADIDAS / YEEZY:*\n• **EU 40 2/3** = **25.0 см**\n• **EU 41 1/3** = **25.5 см**\n• **EU 42 2/3** = **26.5 см**\n• **EU 43 1/3** = **27.0 см**\n• **EU 44 2/3** = **28.0 см**\n\n⚠️ _Yeezy и Samba маломерят — берите на 0.5-1 размер больше._',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к выбору', 'size_menu')]]) }
  );
});

bot.action('size_apparel', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageText(
    '👕 *ОДЕЖДА (АЗИЯ):*\n⚠️ Китайские бренды маломерят на 1-2 размера.\n• **S:** 160-168 см | 50-60 кг\n• **M:** 168-174 см | 60-68 кг\n• **L:** 174-180 см | 68-78 кг\n• **XL:** 180-185 см | 78-88 кг',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к выбору', 'size_menu')]]) }
  );
});

bot.action('size_measure', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
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

bot.hears('💬 Свя
