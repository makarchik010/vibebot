document.addEventListener('DOMContentLoaded', () => {
    // 1. Плавная навигация по якорным ссылкам
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // 2. Всплывающее окно контактов
    const modal = document.getElementById('contact-modal');
    const closeBtn = document.getElementById('modal-close');
    const openButtons = document.querySelectorAll('.open-modal-btn');

    openButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (modal) modal.classList.add('active');
        });
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }

    // 3. Мобильное бургер-меню
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const nav = document.querySelector('.nav');

    if (mobileBtn && nav) {
        mobileBtn.addEventListener('click', () => {
            if (nav.style.display === 'block') {
                nav.style.display = 'none';
            } else {
                nav.style.display = 'block';
                nav.style.position = 'absolute';
                nav.style.top = '100%';
                nav.style.left = '0';
                nav.style.width = '100%';
                nav.style.backgroundColor = '#ffffff';
                nav.style.padding = '20px';
                nav.style.boxShadow = '0 8px 15px rgba(0,0,0,0.08)';

                const ul = nav.querySelector('ul');
                ul.style.flexDirection = 'column';
                ul.style.gap = '14px';
            }
        });
    }

    // 4. Поддержка автопостинга заметок из Google Таблицы через Telegram-бота
    const GOOGLE_SHEET_API_URL = ''; 

    if (GOOGLE_SHEET_API_URL) {
        fetch(GOOGLE_SHEET_API_URL)
            .then(res => res.json())
            .then(posts => {
                const container = document.getElementById('articles-container');
                if (!posts || posts.length === 0 || !container) return;
                
                container.innerHTML = '';
                posts.forEach(post => {
                    const card = document.createElement('div');
                    card.className = 'quote-card';
                    card.innerHTML = `
                        <div class="quote-icon">“</div>
                        <div class="quote-body">
                            <p class="quote-text">${post.text}</p>
                            <div class="quote-author-row">
                                <img src="about (7).jpg" alt="Светлана Соковикова" class="quote-avatar">
                                <div>
                                    <span class="quote-name">Светлана Соковикова</span>
                                    <span class="quote-date">${post.date || 'Новая запись'}</span>
                                </div>
                            </div>
                        </div>
                    `;
                    container.appendChild(card);
                });
            })
            .catch(err => console.log('Синхронизация заметок:', err));
    }
});
