// Récupérer le session ID depuis l'URL
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session');

// Éléments DOM
const fileInput = document.getElementById('file-input');
const uploadForm = document.getElementById('upload-form');
const previewSection = document.getElementById('preview-section');
const previewGrid = document.getElementById('preview-grid');
const selectedCount = document.getElementById('selected-count');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const successMessage = document.getElementById('success-message');
const uploadMoreBtn = document.getElementById('upload-more-btn');

// Variables
let selectedFiles = [];

// Vérifier que la session existe
if (!sessionId) {
  alert('Session invalide. Scannez le QR code à nouveau.');
}

// Événement de sélection de fichiers
fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  
  if (files.length > 0) {
    selectedFiles = files;
    displayPreview();
  }
});

// Afficher l'aperçu des fichiers sélectionnés
function displayPreview() {
  selectedCount.textContent = selectedFiles.length;
  previewSection.classList.remove('hidden');
  
  previewGrid.innerHTML = '';
  
  selectedFiles.forEach((file, index) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const previewItem = document.createElement('div');
      previewItem.className = 'preview-item';
      
      if (file.type.startsWith('image/')) {
        previewItem.innerHTML = `
          <img src="${e.target.result}" alt="${file.name}">
          <button class="remove-btn" onclick="removeFile(${index})">×</button>
        `;
      } else if (file.type.startsWith('video/')) {
        previewItem.innerHTML = `
          <video src="${e.target.result}"></video>
          <button class="remove-btn" onclick="removeFile(${index})">×</button>
        `;
      }
      
      previewGrid.appendChild(previewItem);
    };
    
    reader.readAsDataURL(file);
  });
}

// Supprimer un fichier de la sélection
function removeFile(index) {
  selectedFiles.splice(index, 1);
  
  if (selectedFiles.length === 0) {
    previewSection.classList.add('hidden');
    fileInput.value = '';
  } else {
    displayPreview();
  }
}

// Upload des fichiers
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (selectedFiles.length === 0) {
    alert('Veuillez sélectionner au moins un fichier');
    return;
  }

  // Afficher la barre de progression
  previewSection.classList.add('hidden');
  uploadProgress.classList.remove('hidden');
  
  try {
    let uploadedCount = 0;
    const totalFiles = selectedFiles.length;
    
    // Upload fichier par fichier
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Mettre à jour le texte de progression
      progressText.textContent = `Upload fichier ${i + 1}/${totalFiles}: ${file.name}`;
      
      // Créer FormData pour un seul fichier
      const formData = new FormData();
      formData.append('files', file);
      
      // Upload du fichier
      const response = await fetch(`/api/upload/${sessionId}`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        uploadedCount++;
        const progress = (uploadedCount / totalFiles) * 100;
        progressFill.style.width = progress + '%';
        
        console.log(`Fichier ${i + 1}/${totalFiles} uploadé: ${file.name}`);
      } else {
        throw new Error(`Erreur upload fichier ${file.name}`);
      }
    }
    
    // Upload terminé
    progressText.textContent = `Upload terminé ! ${uploadedCount}/${totalFiles} fichiers uploadés`;
    
    // Afficher le message de succès
    setTimeout(() => {
      uploadProgress.classList.add('hidden');
      successMessage.classList.remove('hidden');
    }, 1000);
    
  } catch (error) {
    console.error('Erreur upload:', error);
    alert(`Erreur lors de l'upload: ${error.message}`);
    
    // Masquer la progression en cas d'erreur
    uploadProgress.classList.add('hidden');
    previewSection.classList.remove('hidden');
  }
});

// Bouton "Envoyer plus de fichiers"
uploadMoreBtn.addEventListener('click', () => {
  successMessage.classList.add('hidden');
  previewSection.classList.add('hidden');
  fileInput.value = '';
  selectedFiles = [];
  progressFill.style.width = '0%';
});
