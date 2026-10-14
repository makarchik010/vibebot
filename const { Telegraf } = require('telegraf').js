const { Telegraf } = require('telegraf');

const BOT_TOKEN = '8805698597:AAFcJ-Gr7d9xCqmtpQT8ZdRYq3eGzhegDic';

const bot = new Telegraf(BOT_TOKEN);

// Команда /start
bot.start((ctx) => {
    ctx.reply(`Привет, ${ctx.from.first_name || 'бро'}! 🚀\nЯ твой первый бот на Node.js.\n\nКоманды:\n/crypto — курс криптовалют\n/ping — проверка связи`);
});

// Команда /ping
bot.command('ping', (ctx) => {
    ctx.reply('Понг! Связь отличная, сервер в строю ⚡');
});

// Команда /crypto
bot.command('crypto', async (ctx) => {
    await ctx.reply('Запрашиваю биржу...');
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd');
        const data = await response.json();
        
        const btc = data.bitcoin.usd.toLocaleString();
        const eth = data.ethereum.usd.toLocaleString();

        await ctx.reply(` Актуальные курсы:\n\n• Bitcoin: $${btc}\n• Ethereum: $${eth}`);
    } catch (e) {
        await ctx.reply('Не удалось стянуть курсы с биржи, попробуй позже.');
    }
});

// Ответ на любой текст
bot.on('text', (ctx) => {
    ctx.reply(`Ты написал: "${ctx.message.text}". Нажми /start, чтобы увидеть меню.`);
});

bot.launch().then(() => {
    console.log('>>> БОТ УСПЕШНО ЗАПУЩЕН И ЖДЕТ СООБЩЕНИЙ! <<<');
}).catch((err) => {
    console.error('Ошибка запуска:', err);
});

// Корректная остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
const http = require('http');
const port = process.env.PORT || 3000;
http.createServer((req, res) => res.end('Bot is running')).listen(port);
const http = require('http');
const port = process.env.PORT || 3000;
http.createServer((req, res) => res.end('Bot is running')).listen(port, () => {
    console.log(`Сервер слушает порт ${port}`);
});