const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);

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

bot.hears('⚡ Пинг сервера', async (ctx) => {
  await ctx.reply('Понг! Сервер на связи 🚀');
});

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

bot.on('text', async (ctx, next) => {
  const text = ctx.message.text.trim().toLowerCase();

  if (text === '💵 курсы валют' || text === '⚡ пинг сервера' || text.startsWith('/')) {
    return next();
  }

  const match = text.match(/^([\d.,]+)\s*([a-zA-Zа-яА-Я$¥]+)$/);

  if (!match) {
    return ctx.reply(
      'Не понял запрос 🤔\n' +
      'Напиши сумму и валюту, например:\n' +
      '• `120 cny` или `120 юаней`\n' +
      '• `50 usd` или `50 баксов`\n' +
      '• `1500 lkr` или `1500 рупий`',
      { parse_mode: 'Markdown' }
    );
  }

  const amount = parseFloat(match[1].replace(',', '.'));
  const rawCurrency = match[2];

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Введи корректную сумму больше нуля.');
  }

  let targetCurrency = null;
  if (/^(usd|\$|доллар|доллара|долларов|бакс|бакса|баксов)$/.test(rawCurrency)) {
    targetCurrency = 'USD';
  } else if (/^(cny|¥|юань|юаня|юаней)$/.test(rawCurrency)) {
    targetCurrency = 'CNY';
  } else if (/^(lkr|рупия|рупии|рупий)$/.test(rawCurrency)) {
    targetCurrency = 'LKR';
  }

  if (!targetCurrency) {
    return ctx.reply('Пока поддерживаю только USD, CNY и LKR.');
  }

  const rates = await getRates();
  if (!rates) {
    return ctx.reply('Ошибка получения биржевых курсов. Попробуй позже.');
  }

  const rubPerUsd = rates.RUB;
  let rateToRub = 0;
  let currencyLabel = '';

  if (targetCurrency === 'USD') {
    rateToRub = rubPerUsd;
    currencyLabel = 'USD';
  } else if (targetCurrency === 'CNY') {
    rateToRub = rubPerUsd / rates.CNY;
    currencyLabel = 'CNY';
  } else if (targetCurrency === 'LKR') {
    rateToRub = rubPerUsd / rates.LKR;
    currencyLabel = 'LKR';
  }

  const totalPure = amount * rateToRub;
  const bankMarkup = 1.04;
  const totalWithMarkup = totalPure * bankMarkup;

  const resultMessage =
    `🧮 *Расчет конвертации:*\n\n` +
    `• Сумма: *${amount.toLocaleString('ru-RU')} ${currencyLabel}*\n` +
    `• По биржевому курсу: *${totalPure.toFixed(2)} ₽*\n` +
    `• С учетом комиссии (~+4%): *${totalWithMarkup.toFixed(2)} ₽*\n\n` +
    `_Курс: 1 ${currencyLabel} ≈ ${rateToRub < 1 ? rateToRub.toFixed(4) : rateToRub.toFixed(2)} RUB_`;

  await ctx.reply(resultMessage, { parse_mode: 'Markdown' });
});

bot.launch().then(() => console.log('>>> БОТ УСПЕШНО ЗАПУЩЕН! <<<'));

const port = process.env.PORT || 3000;
http.createServer((req, res) => res.end('Bot is running')).listen(port, () => {
  console.log(`Сервер слушает порт ${port}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));