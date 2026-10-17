const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);

// НАСТРОЙКИ
const DIRECTOR_ID = 1681547868; // Твой Telegram ID
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzlw7d3kuH8XKGwV3h7zBZ2RT9bLaOvQMBSfaDpWZSajLOzmBewmcg60xHyMc0gK8EVjQ/exec';

// Локальный кэш ролей (чтобы не дергать скрипт на каждый клик)
let rolesCache = new Map();

// Функция обращения к Google Таблице
async function callSheets(action, payload = {}) {
  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    return await res.json();
  } catch (e) {
    console.error('Ошибка обращения к Google Таблице:', e);
    return null;
  }
}

// Загрузка сотрудников при старте
async function syncRoles() {
  const res = await callSheets('get_employees');
  if (res && res.status === 'ok') {
    rolesCache.clear();
    res.employees.forEach(emp => {
      rolesCache.set(String(emp.id), emp.role);
    });
  }
  // Директор всегда вшит намертво
  rolesCache.set(String(DIRECTOR_ID), 'директор');
}

// Определение роли пользователя
function getUserRole(userId) {
  if (userId === DIRECTOR_ID) return 'директор';
  return rolesCache.get(String(userId)) || 'гость';
}

// Генерация клавиатуры под роль
function getMenuByRole(role) {
  if (role === 'директор') {
    return Markup.keyboard([
      ['📊 Полный P&L отчет', '💰 Текущий баланс'],
      ['➕ Добавить расход', '📈 Добавить доход'],
      ['👥 Управление штатом']
    ]).resize();
  }
  if (role === 'бухгалтер') {
    return Markup.keyboard([
      ['📊 Отчет по кассе', '💰 Текущий баланс'],
      ['➕ Добавить расход', '📈 Добавить доход']
    ]).resize();
  }
  if (role === 'сотрудник') {
    return Markup.keyboard([
      ['➕ Добавить расход', '📈 Добавить доход']
    ]).resize();
  }
  return Markup.keyboard([['🔑 Запросить доступ']]).resize();
}

// Сессии для пошагового внесения
const userState = new Map();

// Стартовое приветствие
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const role = getUserRole(userId);

  if (role === 'директор') {
    await ctx.reply(
      '👑 *Добро пожаловать, Директор!*\n\n' +
      'Вам доступен полный контроль финансов, отчёты и управление сотрудниками.\n\n' +
      '💡 *Быстрый ввод расходов/доходов:*\n' +
      '• `минус 1500 скотч и коробки`\n' +
      '• `+ 25000 оплата за заказ #102`',
      { parse_mode: 'Markdown', ...getMenuByRole(role) }
    );
  } else if (role === 'бухгалтер') {
    await ctx.reply(
      '💼 *Панель Бухгалтера*\n\n' +
      'Вы можете просматривать общую кассу и фиксировать финансовые операции.',
      { parse_mode: 'Markdown', ...getMenuByRole(role) }
    );
  } else if (role === 'сотрудник') {
    await ctx.reply(
      '👷 *Рабочий кабинет сотрудника*\n\n' +
      'Здесь вы можете быстро фиксировать рабочие расходы и поступления.',
      { parse_mode: 'Markdown', ...getMenuByRole(role) }
    );
  } else {
    await ctx.reply(
      `👋 Здравствуйте, ${ctx.from.first_name}!\n\n` +
      `У вас пока нет доступа к финансовой системе.\n` +
      `Ваш ID: \`${userId}\`\n\n` +
      `Передайте этот ID директору для выдачи прав.`,
      { parse_mode: 'Markdown', ...getMenuByRole('гость') }
    );
  }
});

// Кнопка P&L отчета (Директор)
bot.hears('📊 Полный P&L отчет', async (ctx) => {
  const role = getUserRole(ctx.from.id);
  if (role !== 'директор') return ctx.reply('⛔ Доступ разрешён только директору.');

  await ctx.reply('⏳ Формирую отчет из Google Таблицы...');
  const stats = await callSheets('get_stats');

  if (!stats || stats.status !== 'ok') {
    return ctx.reply('Ошибка получения данных.');
  }

  const pnl =
    `📊 *ОТЧЁТ О ПРИБЫЛЯХ И УБЫТКАХ (P&L):*\n\n` +
    `📈 Общий доход: *${stats.income.toLocaleString('ru-RU')} ₽*\n` +
    `📉 Общий расход: *${stats.expense.toLocaleString('ru-RU')} ₽*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *ЧИСТАЯ ПРИБЫЛЬ: ${stats.balance.toLocaleString('ru-RU')} ₽*\n` +
    `📝 Всего операций: *${stats.count}*`;

  await ctx.reply(pnl, { parse_mode: 'Markdown' });
});

// Кнопка баланса (Директор / Бухгалтер)
bot.hears(['💰 Текущий баланс', '📊 Отчет по кассе'], async (ctx) => {
  const role = getUserRole(ctx.from.id);
  if (role !== 'директор' && role !== 'бухгалтер') {
    return ctx.reply('⛔ У вас нет доступа к просмотру кассы.');
  }

  const stats = await callSheets('get_stats');
  if (!stats) return ctx.reply('Не удалось получить баланс.');

  await ctx.reply(
    `💵 *Остаток в кассе компании:* *${stats.balance.toLocaleString('ru-RU')} ₽*`,
    { parse_mode: 'Markdown' }
  );
});

// Добавить расход
bot.hears('➕ Добавить расход', async (ctx) => {
  const role = getUserRole(ctx.from.id);
  if (role === 'гость') return ctx.reply('⛔ Нет доступа.');

  userState.set(ctx.from.id, { step: 'WAITING_EXPENSE_AMOUNT' });
  await ctx.reply('Введите сумму расхода в рублях:\nНапример: `1450`');
});

// Добавить доход
bot.hears('📈 Добавить доход', async (ctx) => {
  const role = getUserRole(ctx.from.id);
  if (role === 'гость') return ctx.reply('⛔ Нет доступа.');

  userState.set(ctx.from.id, { step: 'WAITING_INCOME_AMOUNT' });
  await ctx.reply('Введите сумму дохода в рублях:\nНапример: `12000`');
});

// Управление персоналом (Только Директор)
bot.hears('👥 Управление штатом', async (ctx) => {
  if (getUserRole(ctx.from.id) !== 'директор') return;

  await ctx.reply(
    '👥 *Управление правами доступа*\n\n' +
    'Чтобы добавить или изменить роль сотрудника, отправь команду:\n' +
    '`/role ID_пользователя роль`\n\n' +
    'Доступные роли:\n' +
    '• `бухгалтер`\n' +
    '• `сотрудник`\n' +
    '• `гость` (заблокировать)\n\n' +
    'Пример:\n`/role 987654321 бухгалтер`',
    { parse_mode: 'Markdown' }
  );
});

// Слушатель текстовых команд
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;
  const role = getUserRole(userId);
  const userName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Сотрудник');

  // 1. Команда назначения роли (только для директора)
  const roleMatch = text.match(/^\/role\s+(\d+)\s+(бухгалтер|сотрудник|директор|гость)$/i);
  if (roleMatch) {
    if (role !== 'директор') return ctx.reply('⛔ Доступ запрещён.');

    const targetId = roleMatch[1];
    const targetRole = roleMatch[2].toLowerCase();

    await ctx.reply(`Сохраняю изменения для пользователя ${targetId}...`);
    const res = await callSheets('upsert_employee', {
      userId: targetId,
      userName: `ID_${targetId}`,
      role: targetRole
    });

    if (res && res.status === 'ok') {
      rolesCache.set(String(targetId), targetRole);
      return ctx.reply(`✅ Пользователю \`${targetId}\` успешно выдана роль: *${targetRole}*`, { parse_mode: 'Markdown' });
    } else {
      return ctx.reply('Ошибка при обновлении таблицы.');
    }
  }

  // 2. Умный экспресс-ввод: "минус 500 такси" или "+ 15000 продажа"
  const quickExpense = text.match(/^(?:минус|расход|-)\s*(\d+(?:[.,]\d+)?)\s*(.*)$/i);
  const quickIncome = text.match(/^(?:плюс|доход|\+)\s*(\d+(?:[.,]\d+)?)\s*(.*)$/i);

  if ((quickExpense || quickIncome) && role !== 'гость') {
    const isIncome = !!quickIncome;
    const amount = parseFloat((isIncome ? quickIncome[1] : quickExpense[1]).replace(',', '.'));
    const comment = (isIncome ? quickIncome[2] : quickExpense[2]).trim() || 'Без комментария';
    const type = isIncome ? 'Доход' : 'Расход';

    await ctx.reply(`Записываю операцию: ${type} ${amount} ₽...`);

    const result = await callSheets('add_transaction', {
      userName,
      userRole: role,
      type,
      category: isIncome ? 'Выручка' : 'Операционные расходы',
      amount,
      comment
    });

    if (result && result.status === 'ok') {
      return ctx.reply(`✅ *${type} учтён!*\n💰 Сумма: *${amount.toLocaleString('ru-RU')} ₽*\n📝 Назначение: ${comment}`, { parse_mode: 'Markdown' });
    } else {
      return ctx.reply('❌ Ошибка связи с таблицей.');
    }
  }

  // 3. Обработка шагов по кнопкам
  const state = userState.get(userId);
  if (state && (state.step === 'WAITING_EXPENSE_AMOUNT' || state.step === 'WAITING_INCOME_AMOUNT')) {
    const amount = parseFloat(text.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return ctx.reply('Введите корректную сумму числом:');

    const isIncome = state.step === 'WAITING_INCOME_AMOUNT';
    state.amount = amount;
    state.type = isIncome ? 'Доход' : 'Расход';
    state.step = 'WAITING_COMMENT';
    userState.set(userId, state);

    return ctx.reply('Укажите комментарий / статью (например, «Упаковка товара» или «Оплата от клиента»):');
  }

  if (state && state.step === 'WAITING_COMMENT') {
    const comment = text;
    const { amount, type } = state;
    userState.delete(userId);

    await ctx.reply('Вношу в таблицу...');
    await callSheets('add_transaction', {
      userName,
      userRole: role,
      type,
      category: type === 'Доход' ? 'Продажи' : 'Текущие расходы',
      amount,
      comment
    });

    return ctx.reply(`✅ *${type} успешно сохранён!*\n• Сумма: *${amount} ₽*\n• Описание: *${comment}*`, { parse_mode: 'Markdown' });
  }

  return next();
});

// Запуск бота
syncRoles().then(() => {
  bot.launch().then(() => console.log('>>> ФИНАНСОВЫЙ АГЕНТ ЗАПУЩЕН! <<<'));
});

// Сервер для Render
const port = process.env.PORT || 3000;
http.createServer((req, res) => res.end('Finance CFO Bot is running')).listen(port, () => {
  console.log(`Сервер слушает порт ${port}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));