const http = require('http');

const PORT = 3000;

const server = http.createServer((req, res) => {
    if (req.url === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toLocaleTimeString(),
            message: 'Локальный бэкенд на Node.js работает стабильно!'
        }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>Vibe Server Dashboard</title>
            <style>
                body { background: #0b0f19; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: #161f30; padding: 30px; border-radius: 12px; border: 1px solid #233554; text-align: center; max-width: 400px; }
                h1 { color: #38bdf8; margin-bottom: 10px; }
                .status { background: #052e16; color: #4ade80; display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: bold; margin-bottom: 20px; }
                button { background: #38bdf8; border: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; color: #0b0f19; }
                #log { margin-top: 15px; font-size: 13px; color: #94a3b8; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="status">● Сервер запущен</div>
                <h1>Node.js Backend</h1>
                <p>Твой собственный локальный сервер обрабатывает запросы без сторонних блокировок.</p>
                <button onclick="checkServer()">Пинг сервера</button>
                <div id="log"></div>
            </div>
            <script>
                async function checkServer() {
                    const res = await fetch('/api/stats');
                    const data = await res.json();
                    document.getElementById('log').innerText = 'Ответ в ' + data.timestamp + ': аптайм ' + data.uptime + ' сек.';
                }
            </script>
        </body>
        </html>
    `);
});

server.listen(PORT, () => {
    console.log(`>>> СЕРВЕР ЗАПУЩЕН НА http://localhost:${PORT}`);
});