document.addEventListener('DOMContentLoaded', () => {
    // Плавная прокрутка для якорных ссылок
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if(targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            
            if(targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Простая реализация мобильного меню (по клику на бургер)
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const nav = document.querySelector('.nav');

    if(mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            if(nav.style.display === 'block') {
                nav.style.display = 'none';
            } else {
                nav.style.display = 'block';
                nav.style.position = 'absolute';
                nav.style.top = '100%';
                nav.style.left = '0';
                nav.style.width = '100%';
                nav.style.backgroundColor = '#fff';
                nav.style.padding = '20px';
                nav.style.boxShadow = '0 5px 10px rgba(0,0,0,0.1)';
                
                const ul = nav.querySelector('ul');
                ul.style.flexDirection = 'column';
                ul.style.gap = '15px';
            }
        });
    }
});