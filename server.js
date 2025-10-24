const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 8080;

// Fonction pour obtenir l'adresse IP locale
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignorer les adresses non-IPv4 et loopback
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIPAddress();

// Configuration du stockage Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const sessionId = req.params.sessionId;
    const uploadDir = path.join(__dirname, 'uploads', sessionId);
    
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Préserver le nom original avec extension
    const timestamp = Date.now();
    const randomId = Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, extension);
    
    // Format: timestamp-randomId-originalname.ext
    const filename = `${timestamp}-${randomId}-${nameWithoutExt}${extension}`;
    cb(null, filename);
  }
});

// Filtrer les types de fichiers
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non supporté. Seulement images et vidéos.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: Infinity, // Pas de limite de taille
    files: 50 // Maximum 50 fichiers par upload
  }
});

// Middleware
app.use(express.json({ limit: '50gb' })); // Augmenter la limite JSON
app.use(express.urlencoded({ limit: '50gb', extended: true })); // Augmenter la limite URL encoded
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Stockage des sessions en mémoire (pour le MVP)
const sessions = new Map();

// Socket.IO
io.on('connection', (socket) => {
  console.log('Nouveau client connecté:', socket.id);
  
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`Client ${socket.id} a rejoint la session ${sessionId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client déconnecté:', socket.id);
  });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route pour obtenir l'adresse IP du serveur
app.get('/api/server-info', (req, res) => {
  res.json({ 
    ip: LOCAL_IP,
    port: PORT 
  });
});

// Créer une nouvelle session
app.post('/api/session', (req, res) => {
  const sessionId = uuidv4();
  sessions.set(sessionId, {
    id: sessionId,
    files: [],
    createdAt: new Date()
  });
  
  console.log('Nouvelle session créée:', sessionId);
  res.json({ sessionId });
});

// Upload de fichiers
app.post('/api/upload/:sessionId', upload.array('files', 20), (req, res) => {
  const sessionId = req.params.sessionId;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session non trouvée' });
  }
  
  const session = sessions.get(sessionId);
  const uploadedFiles = req.files.map(file => ({
    id: uuidv4(),
    filename: file.filename,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: `/uploads/${sessionId}/${file.filename}`,
    uploadedAt: new Date()
  }));
  
  session.files.push(...uploadedFiles);
  
  // Notifier tous les clients connectés à cette session
  io.to(sessionId).emit('files-uploaded', uploadedFiles);
  
  console.log(`${uploadedFiles.length} fichier(s) uploadé(s) pour la session ${sessionId}`);
  res.json({ success: true, files: uploadedFiles });
});

// Récupérer les fichiers d'une session
app.get('/api/session/:sessionId/files', (req, res) => {
  const sessionId = req.params.sessionId;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session non trouvée' });
  }
  
  const session = sessions.get(sessionId);
  res.json({ files: session.files });
});

// Télécharger un fichier avec le nom original
app.get('/api/download/:sessionId/:fileId', (req, res) => {
  const { sessionId, fileId } = req.params;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session non trouvée' });
  }
  
  const session = sessions.get(sessionId);
  const file = session.files.find(f => f.id === fileId);
  
  if (!file) {
    return res.status(404).json({ error: 'Fichier non trouvé' });
  }
  
  const filePath = path.join(__dirname, file.path);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier physique non trouvé' });
  }
  
  // Définir les headers pour le téléchargement avec le nom original
  res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
  res.setHeader('Content-Type', file.mimetype);
  
  // Envoyer le fichier
  res.sendFile(filePath);
});

// Télécharger tous les fichiers d'une session en ZIP
app.get('/api/download-all/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session non trouvée' });
  }
  
  const session = sessions.get(sessionId);
  
  if (session.files.length === 0) {
    return res.status(404).json({ error: 'Aucun fichier à télécharger' });
  }
  
  // Créer un nom de fichier ZIP avec timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipFilename = `fichiers-${timestamp}.zip`;
  
  // Configurer les headers pour le téléchargement ZIP
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
  
  // Créer l'archive ZIP
  const archive = archiver('zip', {
    zlib: { level: 9 } // Compression maximale
  });
  
  // Gérer les erreurs d'archive
  archive.on('error', (err) => {
    console.error('Erreur création ZIP:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la création du ZIP' });
    }
  });
  
  // Connecter l'archive à la réponse
  archive.pipe(res);
  
  // Ajouter chaque fichier au ZIP avec son nom original
  session.files.forEach((file) => {
    const filePath = path.join(__dirname, file.path);
    
    if (fs.existsSync(filePath)) {
      // Ajouter le fichier avec son nom original
      archive.file(filePath, { name: file.originalName });
      console.log(`Ajout au ZIP: ${file.originalName}`);
    } else {
      console.warn(`Fichier non trouvé: ${file.originalName}`);
    }
  });
  
  // Finaliser l'archive
  archive.finalize();
  
  console.log(`ZIP créé avec ${session.files.length} fichier(s) pour la session ${sessionId}`);
});

// Supprimer un fichier
app.delete('/api/session/:sessionId/file/:fileId', (req, res) => {
  const { sessionId, fileId } = req.params;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session non trouvée' });
  }
  
  const session = sessions.get(sessionId);
  const fileIndex = session.files.findIndex(f => f.id === fileId);
  
  if (fileIndex === -1) {
    return res.status(404).json({ error: 'Fichier non trouvé' });
  }
  
  const file = session.files[fileIndex];
  const filePath = path.join(__dirname, file.path);
  
  // Supprimer le fichier physique
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  session.files.splice(fileIndex, 1);
  
  // Notifier tous les clients
  io.to(sessionId).emit('file-deleted', fileId);
  
  console.log(`Fichier ${fileId} supprimé de la session ${sessionId}`);
  res.json({ success: true });
});

// Démarrer le serveur
server.listen(PORT, () => {
  console.log(`\n🚀 Serveur démarré !`);
  console.log(`📱 Accès local: http://localhost:${PORT}`);
  console.log(`🌐 Accès réseau: http://${LOCAL_IP}:${PORT}`);
  console.log(`📱 Scannez le QR code pour uploader des fichiers depuis votre mobile\n`);
});

// Augmenter les timeouts pour les gros uploads
server.timeout = 0; // Pas de timeout
server.keepAliveTimeout = 0; // Pas de timeout keepalive
server.headersTimeout = 0; // Pas de timeout headers
