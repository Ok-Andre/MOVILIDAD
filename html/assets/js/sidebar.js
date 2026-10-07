// ===== Datos de prueba (sustituye por tu backend/auth cuando lo tengas) =====
const ROLES = {
    '591bb8f9-20cd-4eb3-bc5f-206ced4b1d12': 'Administrador',
    'cc08bf5b-d772-4e9e-8bfe-873f1b74c154': 'Entrenador'
};

// Equivalente a useAuth().entrenador (null = usa los valores por defecto)
let entrenador = null;
// Ejemplo:
// entrenador = { nombre: 'Tania', imagen: '', rol_id: '591bb8f9-20cd-4eb3-bc5f-206ced4b1d12' };

function logout() {
    // TODO: aquí va tu lógica de cierre de sesión
    console.log('logout');
}

// ===== Elementos =====
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const logoutBtn = document.getElementById('logoutBtn');
const submenuItems = document.querySelectorAll('.nav-links li.has-submenu');

// ===== Estado =====
let openMenu = null;   // índice del submenú abierto
let isClosed = true;   // sidebar cerrado por defecto

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
    arrow.addEventListener('click', () => toggleMenu(index));
});

// ===== Sidebar =====
function toggleSidebar(e) {
    if (e) e.preventDefault();
    isClosed = !isClosed;
    sidebar.classList.toggle('close', isClosed);
}

toggleSidebarBtn.addEventListener('click', toggleSidebar);

// ===== Perfil =====
function renderProfile() {
    document.getElementById('profileName').textContent =
        entrenador?.nombre || 'Nombre del entrenador';

    if (entrenador?.imagen) {
        document.getElementById('profileImg').src = entrenador.imagen;
    }

    document.getElementById('profileJob').textContent =
        ROLES[entrenador?.rol_id] || '';
}

logoutBtn.addEventListener('click', logout);

// ===== Init =====
renderMenus();
renderProfile();