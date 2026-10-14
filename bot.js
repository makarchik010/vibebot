const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);

// База данных учебников и номеров
// Сюда можно заносить ссылки на сканы или текстовые решения
const database = {
  merzlyak_10: {
    title: 'Мерзляк 10 класс (Алгебра)',
    tasks: {
      '1': {
        type: 'text',
        content: '📌 **Задание 1 (Мерзляк 10 класс):**\n\n1) D(f) = (-∞; +∞)\n2) Функция четная: f(-x) = (-x)² = x² = f(x)\n3) Ответ: D(f) = R, функция четная.'
      },
      '2': {
        type: 'photo',
        url: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb', // пример прямой ссылки на фото
        caption: '📌 **Задание 2 (Мерзляк 10 класс):** Пошаговое оформление на скане.'
      }
    }
  },
  atanasyan_10: {
    title: 'Атанасян 10-11 класс (Геометрия)',
    tasks: {
      '1': {
        type: 'text',
        content: '📌 **Задание 1 (Атанасян 10-11):**\n\nДано: плоскость α, точки A, B ∉ α.\nРешение: Через любые три точки, не лежащие на одной прямой, проходит плоскость, и притом только одна (Аксиома А1).'
      }
    }
  }
};

// Хранилище текущего состояния пользователей в памяти (какой учебник выбран)
const userState = new Map();

// Стартовое меню
bot.start(async (ctx) => {
  userState.delete(ctx.from.id);
  await ctx.reply(
    '📚 **ГДЗ Математика:**\nВыбери нужный учебник из каталога:',
    Markup.inlineKeyboard([
      [Markup.button.callback('Мерзляк 10 кл (Алгебра)', 'book_merzlyak_10')],
      [Markup.button.callback('Атанасян 10-11 кл (Геометрия)', 'book_atanasyan_10')]
    ])
  );
});

// Обработка выбора учебника
bot.action(/book_(.+)/, async (ctx) => {
  const bookId = ctx.match[1];
  await ctx.answerCbQuery();

  if (!database[bookId]) {
    return ctx.reply('Учебник пока наполняется базой.');
  }

  // Запоминаем, что этот пользователь сейчас ищет номер в этой книге
  userState.set(ctx.from.id, bookId);

  await ctx.editMessageText(
    `📖 Выбран: *${database[bookId].title}*\n\nНапиши номер задания в чат (например: 1 или 2):`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Назад к учебникам', 'back_to_books')]
      ])
    }
  );
});

// Кнопка "Назад"
bot.action('back_to_books', async (ctx) => {
  userState.delete(ctx.from.id);
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '📚 Выбери нужный учебник из каталога:',
    Markup.inlineKeyboard([
      [Markup.button.callback('Мерзляк 10 кл (Алгебра)', 'book_merzlyak_10')],
      [Markup.button.callback('Атанасян 10-11 кл (Геометрия)', 'book_atanasyan_10')]
    ])
  );
});

// Обработка текстового сообщения с номером задания
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const currentBookId = userState.get(userId);

  // Если учебник еще не выбран
  if (!currentBookId) {
    return ctx.reply(
      'Сначала выбери учебник через команду /start',
      Markup.inlineKeyboard([
        [Markup.button.callback('Выбрать учебник', 'back_to_books')]
      ])
    );
  }

  const taskNumber = ctx.message.text.trim();
  const book = database[currentBookId];
  const task = book.tasks[taskNumber];

  if (!task) {
    return ctx.reply(
      `Задание №${taskNumber} в "${book.title}" пока не добавлено.\nПопробуй ввести 1 или 2.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Сменить учебник', 'back_to_books')]
      ])
    );
  }

  // Отправляем решение в зависимости от типа (текст или скан)
  if (task.type === 'text') {
    await ctx.reply(task.content, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Другой учебник', 'back_to_books')]
      ])
    });
  } else if (task.type === 'photo') {
    await ctx.replyWithPhoto(task.url, {
      caption: task.caption,
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Другой учебник', 'back_to_books')]
      ])
    });
  }
});

bot.launch().then(() => console.log('>>> БОТ УСПЕШНО ЗАПУЩЕН! <<<'));

// Заглушка для Render Web Service
const port = process.env.PORT || 3000;
http.createServer((req, res) => res.end('Bot is running')).listen(port, () => {
  console.log(`Сервер слушает порт ${port}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));