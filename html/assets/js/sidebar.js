// ===== Sidebar compartida (index.html / index2.html) =====

const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const submenuItems = document.querySelectorAll('.nav-links li.has-submenu');
const navItems = document.querySelectorAll('.nav-links > li');

// ===== Estado =====
let openMenu = null;   // índice del submenú abierto
let isClosed = sidebar ? sidebar.classList.contains('close') : true;
let backdrop = null;

const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

// El mapa (Leaflet) recalcula su tamaño cuando termina la transición CSS (0.5s)
function resizeMapLater() {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 500);
}

// ===== Submenús =====
function renderMenus() {
    submenuItems.forEach((li, index) => {
        li.classList.toggle('showMenu', openMenu === index);
    });
}

function toggleMenu(index) {
    openMenu = openMenu === index ? null : index;
    renderMenus();
}

submenuItems.forEach((li, index) => {
    const arrow = li.querySelector('.arrow');
    if (arrow) {
        arrow.addEventListener('click', (e) => {
            e.preventDefault();
            toggleMenu(index);
        });
    }
    const link = li.querySelector('a');
    if (link) {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            toggleMenu(index);
        });
    }
});

// ===== Sidebar =====
function setSidebar(closed) {
    if (!sidebar) return;
    isClosed = closed;
    sidebar.classList.toggle('close', isClosed);
    if (backdrop) backdrop.classList.toggle('show', !isClosed && isMobile());
    resizeMapLater();
}

function toggleSidebar(e) {
    if (e) e.preventDefault();
    setSidebar(!isClosed);
}

if (toggleSidebarBtn) toggleSidebarBtn.addEventListener('click', toggleSidebar);

// ===== Móvil: hamburguesa + backdrop (se crean aquí para no tocar los HTML) =====
if (sidebar) {
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'mobile-menu-btn';
    menuBtn.setAttribute('aria-label', 'Abrir menú');
    menuBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
    menuBtn.addEventListener('click', () => setSidebar(false));
    document.body.appendChild(menuBtn);

    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.addEventListener('click', () => setSidebar(true));
    document.body.appendChild(backdrop);

    window.addEventListener('resize', () => {
        if (!isMobile()) backdrop.classList.remove('show');
    });
}

// ===== Link activo =====
function setActiveLink(li) {
    if (!li) return;
    navItems.forEach(item => item.classList.toggle('active', item === li));
}

navItems.forEach(li => {
    const link = li.querySelector('a');
    if (!link || li.classList.contains('has-submenu')) return;

    link.addEventListener('click', (e) => {
        if (link.classList.contains('disabled')) {
            e.preventDefault();
            return;
        }
        if (link.id === 'toggleSidebarBtn') return;   // el toggle no cambia la sección activa
        setActiveLink(li);
        if (isMobile()) setSidebar(true);
    });
});

// Submenú de Predicciones: dispara los botones del mapa (solo existen en index.html)
document.querySelectorAll('.sub-menu .pred-btn').forEach(a => {
    a.addEventListener('click', (e) => {
        const btn = document.getElementById(a.dataset.target);
        if (!btn) return;                 // sin botón en esta página: deja navegar (href)
        e.preventDefault();
        btn.click();
        setActiveLink(a.closest('li.has-submenu'));
        if (isMobile()) setSidebar(true);
    });
});

// Sincroniza el link activo con los botones del mapa (solo en index.html)
const syncActive = (btnId, liId) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.addEventListener('click', () => setActiveLink(document.getElementById(liId)));
};
['btn-original'].forEach(id => syncActive(id, 'nav-mapa'));
['btn-2030', 'btn-2035'].forEach(id => syncActive(id, 'nav-predicciones'));

// ===== Init =====
renderMenus();
