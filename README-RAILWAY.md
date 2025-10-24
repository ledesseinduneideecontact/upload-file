# Déploiement Railway

## 🚀 Instructions de déploiement

### 1. Créer un compte Railway
- Allez sur [railway.app](https://railway.app)
- Connectez-vous avec GitHub

### 2. Déployer l'application
```bash
# Option 1: Via Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up

# Option 2: Via GitHub (recommandé)
# 1. Poussez le code sur GitHub
# 2. Connectez Railway à votre repo GitHub
# 3. Railway déploie automatiquement
```

### 3. Configuration automatique
- Railway détecte automatiquement Node.js
- Le port est géré automatiquement
- L'IP publique est détectée automatiquement

### 4. Variables d'environnement (optionnelles)
```
PORT=8080
NODE_ENV=production
```

## ✅ Fonctionnalités cloud-ready

- ✅ Détection automatique d'IP
- ✅ QR codes dynamiques
- ✅ Pas d'IP en dur
- ✅ Sessions persistantes
- ✅ Upload illimité
- ✅ Socket.IO temps réel

## 🌐 Après déploiement

L'application sera accessible via :
- URL Railway : `https://votre-app.railway.app`
- QR code généré automatiquement avec la bonne URL
- Fonctionne sur mobile et desktop
