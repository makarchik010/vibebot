// Подключение к твоему Google Apps Script веб-приложению
const API_URL = "https://script.google.com/macros/s/AKfycbzQI7L2Adv8O00hiFRNWKFySy6S67-5DknOH986T8g0hlRAhXE_TtJwQO2dc3H8F5e_0Q/exec";

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // ОЧИСТКА ОТ ПАРАЗИТНЫХ СНОСОК
    // -------------------------------------------------------------
    function cleanCitations() {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        const regex = /\|\(cite:\s*\d+\)|\[site:\s*\d+\]|\(site:\s*\d+\)/gi;
        while (node = walker.nextNode()) {
            if (regex.test(node.nodeValue)) {
                node.nodeValue = node.nodeValue.replace(regex, '');
            }
        }
    }
    cleanCitations();

    // -------------------------------------------------------------
    // ПЛАВНАЯ НАВИГАЦИЯ ПО ЯКОРЯМ
    // -------------------------------------------------------------
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

    // -------------------------------------------------------------
    // МОДАЛЬНОЕ ОКНО КОНТАКТОВ
    // -------------------------------------------------------------
    const contactModal = document.getElementById('contact-modal');
    const contactCloseBtn = document.getElementById('modal-close');
    const openButtons = document.querySelectorAll('.open-modal-btn');

    openButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (contactModal) contactModal.classList.add('active');
        });
    });

    if (contactCloseBtn) {
        contactCloseBtn.addEventListener('click', () => {
            contactModal.classList.remove('active');
        });
    }

    if (contactModal) {
        contactModal.addEventListener('click', (e) => {
            if (e.target === contactModal) {
                contactModal.classList.remove('active');
            }
        });
    }

    // -------------------------------------------------------------
    // МОБИЛЬНОЕ МЕНЮ
    // -------------------------------------------------------------
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
                if (ul) {
                    ul.style.flexDirection = 'column';
                    ul.style.gap = '14px';
                }
            }
        });
    }

    // -------------------------------------------------------------
    // СИНХРОНИЗАЦИЯ С GOOGLE ТАБЛИЦЕЙ (ДАННЫЕ ИЗ БОТА)
    // -------------------------------------------------------------
    if (API_URL && API_URL.startsWith('http')) {
        fetch(API_URL)
            .then(res => res.json())
            .then(data => {
                if (!data) return;

                // 1. Применение цветов и цен
                if (data.config) {
                    const root = document.documentElement;
                    if (data.config.theme_color) root.style.setProperty('--primary', data.config.theme_color);
                    if (data.config.theme_secondary) root.style.setProperty('--secondary', data.config.theme_secondary);

                    // Онлайн цены
                    const pOnlineSingle = document.getElementById('price-online-single');
                    const pOnlinePack = document.getElementById('price-online-pack');
                    if (pOnlineSingle && data.config.price_online_single) pOnlineSingle.textContent = data.config.price_online_single;
                    if (pOnlinePack && data.config.price_online_pack) pOnlinePack.textContent = data.config.price_online_pack;

                    // Офлайн цены
                    const pOfflineSingle = document.getElementById('price-offline-single');
                    const pOfflinePack = document.getElementById('price-offline-pack');
                    if (pOfflineSingle && data.config.price_offline_single) pOfflineSingle.textContent = data.config.price_offline_single;
                    if (pOfflinePack && data.config.price_offline_pack) pOfflinePack.textContent = data.config.price_offline_pack;

                    // Всплывающее спецпредложение (баннер)
                    if (data.config.promo_active === 'true' || data.config.promo_active === true) {
                        const promoBanner = document.getElementById('promo-popup');
                        const promoTitle = document.getElementById('promo-title');
                        const promoText = document.getElementById('promo-text');
                        const promoBtn = document.getElementById('promo-btn');
                        
                        if (promoTitle && data.config.promo_title) promoTitle.textContent = data.config.promo_title;
                        if (promoText && data.config.promo_text) promoText.textContent = data.config.promo_text;
                        if (promoBtn && data.config.promo_btn) promoBtn.textContent = data.config.promo_btn;

                        setTimeout(() => {
                            if (promoBanner) promoBanner.classList.add('active');
                        }, 2000);
                    }
                }

                // 2. Подгрузка статей мамы
                if (data.articles && data.articles.length > 0) {
                    const articlesContainer = document.getElementById('articles-container');
                    if (articlesContainer) {
                        articlesContainer.innerHTML = '';
                        data.articles.forEach(item => {
                            const card = document.createElement('div');
                            card.className = 'quote-card';
                            card.innerHTML = `
                                <div class="quote-icon">“</div>
                                <div class="quote-body">
                                    <p class="quote-text">${item.text}</p>
                                    <div class="quote-author-row">
                                        <img src="about (7).jpg" alt="Светлана Соковикова" class="quote-avatar">
                                        <div>
                                            <span class="quote-name">${item.author || 'Светлана Соковикова'}</span>
                                            <span class="quote-date">${item.date || ''}</span>
                                        </div>
                                    </div>
                                </div>
                            `;
                            articlesContainer.appendChild(card);
                        });
                    }
                }

                cleanCitations();
            })
            .catch(err => console.log('Синхронизация данных:', err));
    }

    // Закрытие баннера спецпредложения
    const promoClose = document.getElementById('promo-close');
    const promoPopup = document.getElementById('promo-popup');
    if (promoClose && promoPopup) {
        promoClose.addEventListener('click', () => {
            promoPopup.classList.remove('active');
        });
    }
});
