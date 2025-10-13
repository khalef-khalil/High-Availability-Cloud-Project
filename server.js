import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import os from 'os'
import sqlite3 from 'sqlite3'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

// Charger les variables d'environnement
dotenv.config()

// Toutes les explications dans le code sont en français.

const app = express()

// Configuration
const PORT = process.env.PORT ? Number(process.env.PORT) : 8000
const SERVER_NUMBER = process.env.SERVER_NUMBER || '1'
const ROOT_DIR = path.resolve(process.cwd())
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const DB_PATH = path.join(DATA_DIR, 'app.db')

// DB: SQLite par défaut, MySQL optionnel pour HA
const DB_DRIVER = (process.env.DB_DRIVER || 'sqlite').toLowerCase()
const MYSQL_HOST = process.env.MYSQL_HOST || '127.0.0.1'
const MYSQL_PORT = process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306
const MYSQL_USER = process.env.MYSQL_USER || 'root'
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || ''
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'cloud_app'

// S'assurer que les répertoires existent
for (const dir of [PUBLIC_DIR, UPLOADS_DIR, DATA_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// Base de données (SQLite ou MySQL)
sqlite3.verbose()
let sqliteDb = null
let mysqlPool = null

async function initDatabase() {
  if (DB_DRIVER === 'mysql') {
    // MySQL: crée un pool et s'assure que la table existe
    mysqlPool = await mysql.createPool({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      connectionLimit: 5,
    })
    await mysqlPool.query(
      `CREATE TABLE IF NOT EXISTS images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        image_path VARCHAR(1024) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`
    )
  } else {
    // SQLite: crée le fichier et la table si nécessaire
    sqliteDb = new sqlite3.Database(DB_PATH)
    sqliteDb.serialize(() => {
      sqliteDb.run(
        `CREATE TABLE IF NOT EXISTS images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          image_path TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      )
    })
  }
}

async function insertImageRecord(name, relativePath) {
  if (DB_DRIVER === 'mysql') {
    const [result] = await mysqlPool.execute(
      'INSERT INTO images (name, image_path) VALUES (?, ?)',
      [name, relativePath]
    )
    return Number(result.insertId)
  }
  return await new Promise((resolve, reject) => {
    sqliteDb.run(
      'INSERT INTO images (name, image_path) VALUES (?, ?)',
      [name, relativePath],
      function (err) {
        if (err) return reject(err)
        resolve(this.lastID)
      }
    )
  })
}

async function selectLatestImage() {
  if (DB_DRIVER === 'mysql') {
    const [rows] = await mysqlPool.query(
      'SELECT id, name, image_path, created_at FROM images ORDER BY created_at DESC, id DESC LIMIT 1'
    )
    return rows[0] || null
  }
  return await new Promise((resolve, reject) => {
    sqliteDb.get(
      'SELECT id, name, image_path, created_at FROM images ORDER BY created_at DESC, id DESC LIMIT 1',
      (err, row) => {
        if (err) return reject(err)
        resolve(row || null)
      }
    )
  })
}

// Multer pour la gestion des uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR)
  },
  filename: (req, file, cb) => {
    const time = Date.now()
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')
    cb(null, `${time}-${safeOriginal}`)
  },
})
const upload = multer({ storage })

// En-tête pour exposer le numéro du serveur
app.use((req, res, next) => {
  res.setHeader('X-Server-Number', String(SERVER_NUMBER))
  next()
})

// Servir les fichiers statiques avec headers no-cache pour CSS
app.use('/uploads', express.static(UPLOADS_DIR))
app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    }
  }
}))

// Parser JSON
app.use(express.json())

// Route: récupérer le dernier enregistrement (image + nom)
app.get('/api/latest', async (req, res) => {
  try {
    const row = await selectLatestImage()
    if (!row) return res.json({ item: null, serverNumber: SERVER_NUMBER })
    const imageUrl = `/${String(row.image_path).replace(/^\/+/, '')}`
    return res.json({
      item: { id: row.id, name: row.name, imageUrl, createdAt: row.created_at },
      serverNumber: SERVER_NUMBER,
    })
  } catch (err) {
    return res.status(500).json({ error: 'Erreur base de données' })
  }
})

// Route: enregistrer (nom + image)
app.post('/api/upload', upload.single('image'), async (req, res) => {
  const name = req.body?.name?.trim()
  const file = req.file

  if (!name) return res.status(400).json({ error: 'Le nom est obligatoire' })
  if (!file) return res.status(400).json({ error: 'Le fichier image est obligatoire' })

  // Stocker uniquement le chemin relatif dans la BDD (bonnes pratiques)
  const relativePath = path.posix.join('uploads', path.basename(file.filename))

  try {
    const id = await insertImageRecord(name, relativePath)
    const imageUrl = `/${relativePath}`
    return res.status(201).json({ id, name, imageUrl })
  } catch (err) {
    return res.status(500).json({ error: 'Erreur base de données' })
  }
})

// Route: info serveur (IP locale + numéro)
app.get('/api/info', (req, res) => {
  res.json({ ip: getLocalIp(), port: PORT, serverNumber: SERVER_NUMBER })
})

// Endpoint de santé pour le Load Balancer
app.get('/health', async (req, res) => {
  try {
    if (DB_DRIVER === 'mysql' && mysqlPool) await mysqlPool.query('SELECT 1')
    res.status(200).send('OK')
  } catch {
    res.status(500).send('DOWN')
  }
})

await initDatabase()
app.listen(PORT, () => {
  const ip = getLocalIp()
  // Affiche l'IP LAN et le numéro du serveur pour les tests
  console.log(`Serveur démarré sur http://${ip}:${PORT} (serveur #${SERVER_NUMBER}, DB=${DB_DRIVER})`)
})

// Utilitaire: IP locale (LAN)
function getLocalIp() {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const isV4 = net.family === 'IPv4' || net.family === 4
      if (isV4 && !net.internal) return net.address
    }
  }
  return '127.0.0.1'
}
