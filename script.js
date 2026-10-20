document.addEventListener('DOMContentLoaded', () => {
    // 1. Плавный скролл по якорным ссылкам шапки
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
            modal.classList.add('active');
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
                nav.style.boxShadow = '0 8px 15px rgba(0,0,0,0.1)';

                const ul = nav.querySelector('ul');
                ul.style.flexDirection = 'column';
                ul.style.gap = '15px';
            }
        });
    }
});
