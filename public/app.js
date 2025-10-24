// Variables globales
let sessionId = null;
let socket = null;
let files = [];
let serverIP = null;
let serverPort = null;

// Éléments DOM
const qrcodeElement = document.getElementById('qrcode');
const regenerateBtn = document.getElementById('regenerate-btn');
const filesGrid = document.getElementById('files-grid');
const emptyState = document.getElementById('empty-state');
const fileCount = document.getElementById('file-count');
const downloadAllBtn = document.getElementById('download-all-btn');

// Initialisation
async function init() {
  await getServerInfo();
  
  // Vérifier s'il existe déjà une session dans le localStorage
  const savedSessionId = localStorage.getItem('sessionId');
  if (savedSessionId) {
    console.log('Session existante récupérée:', savedSessionId);
    sessionId = savedSessionId;
    generateQRCode();
    await loadExistingFiles();
  } else {
    await createSession();
  }
  
  initSocket();
  setupEventListeners();
}

// Récupérer les informations du serveur (IP)
async function getServerInfo() {
  try {
    const response = await fetch('/api/server-info');
    const data = await response.json();
    serverIP = data.ip;
    serverPort = data.port;
    console.log('Serveur IP:', serverIP, 'Port:', serverPort);
  } catch (error) {
    console.error('Erreur récupération IP serveur:', error);
    serverIP = window.location.hostname;
    serverPort = window.location.port || 80;
  }
}

// Créer une nouvelle session
async function createSession() {
  try {
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    sessionId = data.sessionId;
    
    // Sauvegarder la session dans le localStorage
    localStorage.setItem('sessionId', sessionId);
    
    // Générer le QR code
    generateQRCode();
    
    console.log('Nouvelle session créée:', sessionId);
  } catch (error) {
    console.error('Erreur création session:', error);
    alert('Erreur lors de la création de la session');
  }
}

// Charger les fichiers d'une session existante
async function loadExistingFiles() {
  try {
    const response = await fetch(`/api/session/${sessionId}/files`);
    
    if (response.ok) {
      const data = await response.json();
      files = data.files || [];
      renderFiles();
      console.log(`${files.length} fichier(s) chargé(s) depuis la session`);
    } else if (response.status === 404) {
      // La session n'existe plus, créer une nouvelle
      console.log('Session expirée, création d\'une nouvelle session');
      localStorage.removeItem('sessionId');
      await createSession();
    }
  } catch (error) {
    console.error('Erreur chargement fichiers:', error);
  }
}

// Générer le QR code
function generateQRCode() {
  // Nettoyer l'ancien QR code
  qrcodeElement.innerHTML = '';
  
  // Construire l'URL correcte
  let uploadUrl;
  
  // Si serverIP contient déjà le protocole (https://...), l'utiliser tel quel
  if (serverIP.startsWith('http://') || serverIP.startsWith('https://')) {
    uploadUrl = `${serverIP}/upload.html?session=${sessionId}`;
  } else {
    // Sinon, construire l'URL avec le protocole approprié
    const protocol = window.location.protocol; // http: ou https:
    const portString = (serverPort === 80 || serverPort === 443) ? '' : `:${serverPort}`;
    uploadUrl = `${protocol}//${serverIP}${portString}/upload.html?session=${sessionId}`;
  }
  
  console.log('QR Code URL:', uploadUrl);
  
  // Générer le QR code
  new QRCode(qrcodeElement, {
    text: uploadUrl,
    width: 256,
    height: 256,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
}

// Initialiser Socket.IO
function initSocket() {
  socket = io();
  
  socket.on('connect', () => {
    console.log('Socket connecté');
    socket.emit('join-session', sessionId);
  });
  
  socket.on('files-uploaded', (newFiles) => {
    console.log('Nouveaux fichiers reçus:', newFiles);
    files.push(...newFiles);
    renderFiles();
  });
  
  socket.on('file-deleted', (fileId) => {
    console.log('Fichier supprimé:', fileId);
    files = files.filter(f => f.id !== fileId);
    renderFiles();
  });
  
  socket.on('disconnect', () => {
    console.log('Socket déconnecté');
  });
}

// Configuration des écouteurs d'événements
function setupEventListeners() {
  regenerateBtn.addEventListener('click', async () => {
    if (confirm('Créer une nouvelle session ? Les fichiers actuels seront perdus et le QR code changera.')) {
      // Supprimer l'ancienne session du localStorage
      localStorage.removeItem('sessionId');
      
      // Réinitialiser les fichiers
      files = [];
      
      // Créer une nouvelle session
      await createSession();
      
      // Rejoindre la nouvelle session avec Socket.IO
      if (socket) {
        socket.emit('join-session', sessionId);
      }
      
      renderFiles();
    }
  });
  
  downloadAllBtn.addEventListener('click', downloadAllFiles);
}

// Afficher les fichiers
function renderFiles() {
  fileCount.textContent = files.length;
  
  if (files.length === 0) {
    filesGrid.style.display = 'none';
    emptyState.style.display = 'block';
    downloadAllBtn.disabled = true;
  } else {
    filesGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    downloadAllBtn.disabled = false;
    
    filesGrid.innerHTML = files.map(file => createFileCard(file)).join('');
    
    // Ajouter les événements aux boutons
    files.forEach(file => {
      const downloadBtn = document.getElementById(`download-${file.id}`);
      const deleteBtn = document.getElementById(`delete-${file.id}`);
      
      if (downloadBtn) {
        downloadBtn.addEventListener('click', () => downloadFile(file));
      }
      
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => deleteFile(file));
      }
    });
  }
}

// Créer une carte de fichier
function createFileCard(file) {
  const isVideo = file.mimetype.startsWith('video/');
  const preview = isVideo 
    ? `<video class="file-preview" src="${file.path}" controls></video>`
    : `<img class="file-preview" src="${file.path}" alt="${file.originalName}">`;
  
  return `
    <div class="file-card">
      ${preview}
      <div class="file-name" title="${file.originalName}">
        ${file.originalName}
      </div>
      <div class="file-actions">
        <button id="download-${file.id}" class="btn btn-primary">
          ⬇️ Télécharger
        </button>
        <button id="delete-${file.id}" class="btn btn-danger">
          🗑️
        </button>
      </div>
    </div>
  `;
}

// Télécharger un fichier
function downloadFile(file) {
  // Utiliser la route de téléchargement dédiée qui préserve le nom original
  const downloadUrl = `/api/download/${sessionId}/${file.id}`;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = file.originalName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Télécharger tous les fichiers en ZIP
async function downloadAllFiles() {
  try {
    // Utiliser la nouvelle route ZIP
    const downloadUrl = `/api/download-all/${sessionId}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `fichiers-${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('Téléchargement ZIP initié');
  } catch (error) {
    console.error('Erreur téléchargement ZIP:', error);
    alert('Erreur lors du téléchargement du ZIP');
  }
}

// Supprimer un fichier
async function deleteFile(file) {
  if (!confirm(`Supprimer "${file.originalName}" ?`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/session/${sessionId}/file/${file.id}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      console.log('Fichier supprimé:', file.id);
      // La mise à jour sera gérée par Socket.IO
    } else {
      throw new Error('Erreur lors de la suppression');
    }
  } catch (error) {
    console.error('Erreur suppression:', error);
    alert('Erreur lors de la suppression du fichier');
  }
}

// Démarrer l'application
init();
