$token = "8622272382:AAGdyv-_B80g4fRY7zA91N5QbFuSiMiBcak"

$code = @"
import os
import asyncio
import logging
import aiohttp
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from aiohttp import web
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message

TOKEN = "$token"

bot = Bot(token=TOKEN)
dp = Dispatcher()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

async def search_gdz_page(query: str) -> str | None:
    search_query = f"{query} гдз решебник онлайн"
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(search_query, max_results=5))
            for res in results:
                url = res.get("href", "")
                if any(domain in url for domain in ["reshak.ru", "gdz.ru", "megaresheba", "vse-gdz"]):
                    return url
            if results:
                return results[0].get("href")
    except Exception as e:
        logging.error(f"Ошибка при поиске: {e}")
    return None

async def extract_solution_images(url: str) -> list[str]:
    images = []
    try:
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status != 200:
                    return []
                html = await response.text()

        soup = BeautifulSoup(html, "html.parser")

        if "reshak.ru" in url:
            for img in soup.find_all("img"):
                src = img.get("src", "")
                if "reshebnik" in src or "uploads" in src:
                    full_url = f"https://reshak.ru/{src.lstrip('/')}" if not src.startswith("http") else src
                    images.append(full_url)

        if not images:
            for img in soup.find_all("img"):
                src = img.get("src") or img.get("data-src")
                if not src:
                    continue
                if any(term in src.lower() for term in ["task", "nomer", "zadanie", "resh", "solution"]):
                    if src.startswith("//"):
                        images.append(f"https:{src}")
                    elif src.startswith("http"):
                        images.append(src)
    except Exception as e:
        logging.error(f"Ошибка при парсинге страницы {url}: {e}")

    return list(dict.fromkeys(images))

@dp.message(CommandStart())
async def cmd_start(message: Message):
    await message.answer(
        "👋 **Отправь запрос в свободной форме.**\n\n"
        "Формат:\n"
        "`[Класс] [Предмет] [Автор] [Номер]`\n\n"
        "Примеры:\n"
        "• `10 класс алгебра Алимов 125`\n"
        "• `8 геометрия Атанасян 344`\n"
        "• `9 физика Перышкин упр 14`",
        parse_mode="Markdown"
    )

@dp.message(F.text)
async def handle_user_query(message: Message):
    query = message.text.strip()
    status_msg = await message.answer("🔍 Ищу решение в базе учебников...")

    page_url = await search_gdz_page(query)
    if not page_url:
        await status_msg.edit_text("❌ Не удалось найти этот номер. Уточни класс, автора или номер задания.")
        return

    await status_msg.edit_text("📥 Страница найдена. Загружаю ответ...")
    image_urls = await extract_solution_images(page_url)

    if image_urls:
        await status_msg.delete()
        for img_url in image_urls[:2]:
            try:
                await message.answer_photo(
                    photo=img_url,
                    caption=f"📘 **Найдено по запросу:** {query}\n🔗 Источник: {page_url}",
                    parse_mode="Markdown"
                )
            except Exception:
                await message.answer(f"🖼 Картинка решения: {img_url}")
    else:
        await status_msg.edit_text(
            f"✅ Решение найдено на сайте, но картинка защищена от прямого скачивания.\n\n"
            f"🔗 [Открыть страницу с ответом]({page_url})",
            parse_mode="Markdown",
            disable_web_page_preview=False
        )

async def handle_ping(request):
    return web.Response(text="Bot is running!")

async def main():
    logging.basicConfig(level=logging.INFO)
    app = web.Application()
    app.router.add_get("/", handle_ping)
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.environ.get("PORT", 8080))
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
"@

Set-Content -Path solver_bot.py -Value $code -Encoding UTF8
git add solver_bot.py
git commit -m "Update bot token"
git push