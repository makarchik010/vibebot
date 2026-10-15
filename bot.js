const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Получение курсов с API
async function getRates() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error('Ошибка API');
    const data = await res.json();
    return data.rates;
  } catch (e) {
    console.error('Ошибка получения курсов:', e);
    return null;
  }
}

// 1. Команда /start
bot.start(async (ctx) => {
  await ctx.reply(
    'Привет! Это вайб макар ✌️\n\n' +
    '📌 *Что я умею:*\n' +
    '1. Показывать курсы валют по кнопкам ниже.\n' +
    '2. *Конвертировать на лету:* просто напиши мне сумму и валюту.\n' +
    'Например: `150 cny`, `50 usd`, `2500 lkr` или `300 юаней`.',
    {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        ['💵 Курсы валют', '⚡ Пинг сервера']
      ]).resize()
    }
  );
});

// 2. Пинг
bot.hears('⚡ Пинг сервера', async (ctx) => {
  await ctx.reply('Понг! Сервер на связи 🚀');
});

// 3. Классическое меню курсов
bot.hears('💵 Курсы валют', async (ctx) => {
  await ctx.reply(
    'Выбери валюту для просмотра курса:',
    Markup.inlineKeyboard([
      [
        Markup.button.callback('Доллар (USD → RUB)', 'rate_USD'),
        Markup.button.callback('Юань (CNY → RUB)', 'rate_CNY')
      ],
      [
        Markup.button.callback('Рупия Шри-Ланки (LKR)', 'rate_LKR')
      ]
    ])
  );
});

// 4. Инлайн-кнопки курсов
bot.action(/rate_(.+)/, async (ctx) => {
  const currency = ctx.match[1];
  await ctx.answerCbQuery('Запрашиваю курс...');

  const rates = await getRates();
  if (!rates) {
    return ctx.editMessageText('Не удалось получить данные с биржи. Попробуй позже.');
  }

  let text = '';
  const rubPerUsd = rates.RUB;
  const lkrPerUsd = rates.LKR;
  const cnyPerUsd = rates.CNY;

  if (currency === 'USD') {
    text = `💵 *Курс Доллара США:*\n\n• 1 USD ≈ *${rubPerUsd.toFixed(2)} RUB*`;
  } else if (currency === 'CNY') {
    const rubPerCny = rubPerUsd / cnyPerUsd;
    text = `🇨🇳 *Курс Китайского юаня:*\n\n• 1 CNY ≈ *${rubPerCny.toFixed(2)} RUB*\n• 1 USD ≈ *${cnyPerUsd.toFixed(2)} CNY*`;
  } else if (currency === 'LKR') {
    const rubPerLkr = rubPerUsd / lkrPerUsd;
    text = `🇱🇰 *Курс Шри-ланкийской рупии (LKR):*\n\n• 1 LKR ≈ *${rubPerLkr.toFixed(4)} RUB*\n• 1 USD ≈ *${lkrPerUsd.toFixed(2)} LKR*`;
  }

  const timeStr = new Date().toLocaleTimeString('ru-RU');
  text += `\n\n_Обновлено: ${timeStr}_`;

  await ctx.editMessageText(
    text,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('Доллар (USD → RUB)', 'rate_USD'),
          Markup.button.callback('Юань (CNY → RUB)', 'rate_CNY')
        ],
        [
          Markup.button.callback('Рупия Шри-Ланки (LKR)', 'rate_LKR')
        ]
      ])
    }
  );
});

// 5. Умный конвертер текста (middleware / message handler)
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text.trim().toLowerCase();

  // И