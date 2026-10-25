// Подключение к Google Apps Script веб-приложению
const API_URL = "https://script.google.com/macros/s/AKfycbzQI7L2Adv8O00hiFRNWKFySy6S67-5DknOH986T8g0hlRAhXE_TtJwQO2dc3H8F5e_0Q/exec";

document.addEventListener('DOMContentLoaded', () => {

    // -------------------------------------------------------------
    // АБСОЛЮТНАЯ ЗАЧИСТКА ПАРАЗИТНЫХ СНОСОК
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
    // 1. ПЛАВНЫЕ АНИМАЦИИ ПРИ СКРОЛЛЕ (INTERSECTION OBSERVER)
    // -------------------------------------------------------------
    const revealElements = document.querySelectorAll('.scroll-reveal');
    
    revealElements.forEach((el, index) => {
        // Каскадная микро-задержка для карточек в сетках
        const delay = (index % 3) * 0.1;
        el.style.transitionDelay = `${delay}s`;
    });

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.12,
        rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // -------------------------------------------------------------
    // 2. ДИНАМИЧЕСКИЙ СЧЕТЧИК ЧИСЕЛ (ОПЫТ И ЧАСЫ)
    // -------------------------------------------------------------
    const counters = document.querySelectorAll('.counter');
    let countersStarted = false;

    const startCounters = () => {
        counters.forEach(counter => {
            const target = +counter.getAttribute('data-target');
            const duration = 1600;
            const step = target / (duration / 25);
            let current = 0;

            const update = () => {
                current += step;
                if (current < target) {
                    counter.textContent = Math.ceil(current);
                    setTimeout(update, 25);
                } else {
                    counter.textContent = target;
                }
            };
            update();
        });
    };

    const statsBlock = document.querySelector('.stats-section');
    if (statsBlock) {
        const counterObserver = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !countersStarted) {
                countersStarted = true;
                startCounters();
            }
        }, { threshold: 0.3 });
        counterObserver.observe(statsBlock);
    }

    // -------------------------------------------------------------
    // 3. ПЛАВАЮЩИЙ ВИДЖЕТ СВЯЗИ (FAB-КНОПКА ВНИЗУ ЭКРАНА)
    // -------------------------------------------------------------
    const fabWidget = document.getElementById('fab-widget');
    const fabBtn = document.getElementById('fab-main-btn');

    if (fabBtn && fabWidget) {
        fabBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fabWidget.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!fabWidget.contains(e.target)) {
                fabWidget.classList.remove('open');
            }
        });
    }

    // -------------------------------------------------------------
    // 4. МОДАЛЬНОЕ ОКНО КОНТАКТОВ
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
    // 5. МОБИЛЬНОЕ МЕНЮ ШАПКИ
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
                nav.style.boxShadow = '0 10px 20px rgba(0,0,0,0.08)';

                const ul = nav.querySelector('ul');
                if (ul) {
                    ul.style.flexDirection = 'column';
                    ul.style.gap = '14px';
                }
            }
        });
    }

    // -------------------------------------------------------------
    // 6. СИНХРОНИЗАЦИЯ С GOOGLE ТАБЛИЦЕЙ (ДАННЫЕ ИЗ БОТА)
    // -------------------------------------------------------------
    if (API_URL && API_URL.startsWith('http')) {
        fetch(API_URL)
            .then(res => res.json())
            .then(data => {
                if (!data) return;

                // Цвета и цены
                if (data.config) {
                    const root = document.documentElement;
                    if (data.config.theme_color) root.style.setProperty('--primary', data.config.theme_color);
                    if (data.config.theme_secondary) root.style.setProperty('--secondary', data.config.theme_secondary);

                    const pOnlineSingle = document.getElementById('price-online-single');
                    const pOnlinePack = document.getElementById('price-online-pack');
                    if (pOnlineSingle && data.config.price_online_single) pOnlineSingle.textContent = data.config.price_online_single;
                    if (pOnlinePack && data.config.price_online_pack) pOnlinePack.textContent = data.config.price_online_pack;

                    const pOfflineSingle = document.getElementById('price-offline-single');
                    const pOfflinePack = document.getElementById('price-offline-pack');
                    if (pOfflineSingle && data.config.price_offline_single) pOfflineSingle.textContent = data.config.price_offline_single;
                    if (pOfflinePack && data.config.price_offline_pack) pOfflinePack.textContent = data.config.price_offline_pack;

                    // Баннер акции
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

                // Мысли и статьи
                if (data.articles && data.articles.length > 0) {
                    const articlesContainer = document.getElementById('articles-container');
                    if (articlesContainer) {
                        articlesContainer.innerHTML = '';
                        data.articles.forEach(item => {
                            const card = document.createElement('div');
                            card.className = 'quote-card scroll-reveal revealed';
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
document.addEventListener('DOMContentLoaded', () => {
    // Находим карточки и блоки для плавного появления
    const animElements = document.querySelectorAll('.card, .price-card, .quote-card, .project-mini-card, .mediation-content-card');
    
    animElements.forEach((el, index) => {
        el.classList.add('scroll-animate');
        el.style.transitionDelay = `${(index % 3) * 0.1}s`;
    });

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                obs.unobserve(entry.target);
            }
        });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.1 });

    animElements.forEach(el => observer.observe(el));
});

