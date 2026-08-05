import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, collectionGroup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCoIVVXK3csLvtg9E7wDCjGt--fam_szzQ",
    authDomain: "admin-de-zory.firebaseapp.com",
    projectId: "admin-de-zory",
    storageBucket: "admin-de-zory.firebasestorage.app",
    messagingSenderId: "199468715480",
    appId: "1:199468715480:web:2a7a188258237c0b5db6ad",
    measurementId: "G-WKGL0G4WK4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let tabActual = 'pendientes';
let listaPedidosCache = [];
let rutaActivaTipo = 'raiz'; 

window.iniciarSesion = function() {
    signInWithPopup(auth, provider).catch((error) => {
        console.error("Error al iniciar sesión:", error);
        alert("No se pudo iniciar sesión: " + error.message);
    });
}

window.cerrarSesion = function() {
    signOut(auth).catch((error) => {
        console.error("Error al cerrar sesión:", error);
    });
}

onAuthStateChanged(auth, (user) => {
    const loginOverlay = document.getElementById('loginOverlay');
    const appContainer = document.getElementById('appContainer');

    if (user) {
        console.log("Usuario autenticado correctamente:", user.email);
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'block';
        conectarYBuscarPedidos();
    } else {
        console.log("Usuario no autenticado.");
        loginOverlay.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

window.cambiarTab = function(tab) {
    tabActual = tab;
    document.getElementById('tabPendientes').classList.toggle('active', tab === 'pendientes');
    document.getElementById('tabHistorial').classList.toggle('active', tab === 'historial');
    renderAdmin(listaPedidosCache);
}

// Búsqueda inteligente en múltiples rutas para evitar que la pantalla quede en blanco
async function conectarYBuscarPedidos() {
    console.log("Conectando y buscando pedidos en Firestore...");
    try {
        let querySnapshot;
        
        // 1. Intentar primero en la colección raíz "pedidos"
        const qRaiz = query(collection(db, "pedidos"));
        querySnapshot = await getDocs(qRaiz);
        
        if (!querySnapshot.empty) {
            rutaActivaTipo = 'raiz';
            console.log("¡Pedidos encontrados en la colección raíz 'pedidos'!");
        } else {
            // 2. Si está vacía, intentar en la subcolección específica
            const qSub = query(collection(db, "pedidos", "3ETXZyXntbGj33MM0sOL", "pedidos"));
            querySnapshot = await getDocs(qSub);
            
            if (!querySnapshot.empty) {
                rutaActivaTipo = 'subcoleccion';
                console.log("¡Pedidos encontrados en la subcolección!");
            } else {
                // 3. Como último recurso, buscar globalmente por grupo de colección
                const qGroup = query(collectionGroup(db, "pedidos"));
                querySnapshot = await getDocs(qGroup);
                if (!querySnapshot.empty) {
                    rutaActivaTipo = 'grupo';
                    console.log("¡Pedidos encontrados mediante CollectionGroup!");
                } else {
                    console.log("No se encontraron pedidos en ninguna ruta. La base de datos está vacía.");
                }
            }
        }
        
        listaPedidosCache = [];
        querySnapshot.forEach((docSnap) => {
            listaPedidosCache.push({
                idFirebase: docSnap.id,
                refDoc: docSnap.ref,
                ...docSnap.data()
            });
        });
        
        renderAdmin(listaPedidosCache);
        escucharPedidosEnVivo();

    } catch (error) {
        console.error("ERROR CRÍTICO DE FIREBASE:", error);
        alert("Error al conectar con Firestore: " + error.message + "\n\nRevisa si tus Reglas de Seguridad permiten lectura.");
    }
}

function escucharPedidosEnVivo() {
    let refEscucha;
    if (rutaActivaTipo === 'subcoleccion') {
        refEscucha = collection(db, "pedidos", "3ETXZyXntbGj33MM0sOL", "pedidos");
    } else {
        refEscucha = collection(db, "pedidos");
    }

    onSnapshot(refEscucha, (snapshot) => {
        listaPedidosCache = [];
        snapshot.forEach((docSnap) => {
            if (!listaPedidosCache.some(p => p.idFirebase === docSnap.id)) {
                listaPedidosCache.push({
                    idFirebase: docSnap.id,
                    refDoc: docSnap.ref,
                    ...docSnap.data()
                });
            }
        });
        console.log("Actualización en tiempo real. Total en caché:", listaPedidosCache.length);
        renderAdmin(listaPedidosCache);
    }, (err) => {
        console.error("Error en la escucha en vivo:", err);
    });
}

function renderAdmin(pedidos) {
    const contenedor = document.getElementById('contenedorAdmin');
    const resumenDiv = document.getElementById('resumenDia');

    if (!contenedor || !resumenDiv) return;

    let totalVentasDia = 0;
    let cantidadHechos = 0;

    pedidos.forEach(p => {
        if (p.estado === 'completado') {
            totalVentasDia += Number(p.total || 0);
            cantidadHechos++;
        }
    });
    resumenDiv.innerText = `Ventas de hoy: Gs. ${totalVentasDia.toLocaleString('es-PY')} (${cantidadHechos} listos)`;

    let pedidosFiltrados = pedidos.filter(p => {
        if (tabActual === 'pendientes') return p.estado !== 'completado';
        if (tabActual === 'historial') return p.estado === 'completado';
    });

    if (pedidosFiltrados.length === 0) {
        contenedor.innerHTML = `<div class="vacio">${tabActual === 'pendientes' ? 'No hay pedidos pendientes en este momento. 🍔' : 'Todavía no hay pedidos completados en el historial. 📋'}</div>`;
        return;
    }

    let html = '';
    pedidosFiltrados.forEach((p, indexOriginal) => {
        // Encontrar el índice real dentro del array principal para que el botón no falle al filtrar por pestañas
        let index = listaPedidosCache.findIndex(item => item.idFirebase === p.idFirebase);

        let productosHTML = '';
        if (p.productos && Array.isArray(p.productos)) {
            p.productos.forEach(prod => {
                productosHTML += `<div>• <strong>${prod.cantidad}x</strong> ${prod.nombre}</div>`;
            });
        }

        let hecho = p.estado === 'completado';

        html += `
            <div class="card ${hecho ? 'completado' : ''}">
                <div>
                    <div class="card-header">
                        <span>${p.tienda || 'Local'} (${p.id || p.idFirebase.substring(0,5)})</span>
                        <span>🕒 ${p.hora || 'Reciente'}</span>
                    </div>
                    <div class="cliente">👤 ${p.cliente || 'Cliente'}</div>
                    <div class="items">
                        ${productosHTML}
                    </div>
                </div>
                <div class="card-footer">
                    <span class="precio">Gs. ${Number(p.total || 0).toLocaleString('es-PY')}</span>
                    <button class="btn-accion ${hecho ? 'btn-regresar' : 'btn-pendiente'}" onclick="window.cambiarEstadoFirebase(${index}, '${p.estado}')">
                        ${hecho ? '↩ Deshacer' : '✔ Marcar Hecho'}
                    </button>
                </div>
            </div>
        `;
    });

    contenedor.innerHTML = html;
}

window.cambiarEstadoFirebase = async function(indexItem, estadoActual) {
    try {
        const item = listaPedidosCache[indexItem];
        if (!item) return;

        const nuevoEstado = estadoActual === 'completado' ? 'pendiente' : 'completado';
        const docRef = item.refDoc || (rutaActivaTipo === 'raiz' ? doc(db, "pedidos", item.idFirebase) : doc(db, "pedidos", "3ETXZyXntbGj33MM0sOL", "pedidos", item.idFirebase));
        
        await updateDoc(docRef, { estado: nuevoEstado });
    } catch (error) {
        console.error("Error al actualizar estado:", error);
        alert("Hubo un error al actualizar el estado: " + error.message);
    }
}

window.borrarTodo = async function() {
    if (confirm("¿Estás seguro de vaciar el historial de pedidos completados?")) {
        try {
            let refColeccion = rutaActivaTipo === 'raiz' ? collection(db, "pedidos") : collection(db, "pedidos", "3ETXZyXntbGj33MM0sOL", "pedidos");
            const querySnapshot = await getDocs(refColeccion);
            const batchDeletes = [];
            
            querySnapshot.forEach((docSnap) => {
                if(docSnap.data().estado === 'completado') {
                    batchDeletes.push(deleteDoc(docSnap.ref));
                }
            });
            
            await Promise.all(batchDeletes);
            alert("Historial limpiado correctamente.");
        } catch (error) {
            console.error("Error al borrar historial:", error);
            alert("Error al borrar: " + error.message);
        }
    }
}
import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(async ({ getFirestore, collection, getDocs }) => {
    const db = window.firebase_db || eval(`
        import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js").then(({getApps}) => getApps()[0])
    `);
    // O más simple, probemos leyendo directo la ruta raíz y la subcolección:
    console.log("--- PROBANDO LECTURA MANUAL ---");
});
listaPedidosCache = [];
        querySnapshot.forEach((docSnap) => {
            console.log("DOCUMENTO ENCONTRADO EN FIREBASE:", docSnap.id, docSnap.data()); // <--- Añade esto
            listaPedidosCache.push({
                idFirebase: docSnap.id,
                refDoc: docSnap.ref,
                ...docSnap.data()
            });
        });