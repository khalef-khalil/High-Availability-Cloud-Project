import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import os from 'os'
import sqlite3 from 'sqlite3'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { Client as MinioClient } from 'minio'

// Charger les variables d'environnement
dotenv.config()

// Toutes les explications dans le code sont en français.

const app = express()

// Configuration
const PORT = process.env.PORT ? Number(process.env.PORT) : 8000
const SERVER_NUMBER = process.env.SERVER_NUMBER || '1'
const ROOT_DIR = path.resolve(process.cwd())
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const DB_PATH = path.join(DATA_DIR, 'app.db')

// DB: SQLite par défaut, MySQL optionnel pour HA
const DB_DRIVER = (process.env.DB_DRIVER || 'sqlite').toLowerCase()
const MYSQL_MASTER_HOST = process.env.MYSQL_MASTER_HOST || process.env.MYSQL_HOST || '127.0.0.1'
const MYSQL_SLAVE_HOST = process.env.MYSQL_SLAVE_HOST || process.env.MYSQL_HOST || '127.0.0.1'
const MYSQL_MASTER_PORT = process.env.MYSQL_MASTER_PORT ? Number(process.env.MYSQL_MASTER_PORT) : (process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306)
const MYSQL_SLAVE_PORT = process.env.MYSQL_SLAVE_PORT ? Number(process.env.MYSQL_SLAVE_PORT) : (process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306)
const MYSQL_USER = process.env.MYSQL_USER || 'root'
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || ''
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'cloud_app'

// MinIO: Configuration pour le stockage objet S3
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || '192.168.64.17'
const MINIO_PORT = process.env.MINIO_PORT ? Number(process.env.MINIO_PORT) : 9000
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true'
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin'
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minio_secure_2024'
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'uploads'

// S'assurer que les répertoires existent
for (const dir of [PUBLIC_DIR, DATA_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// Base de données (SQLite ou MySQL avec read/write split)
sqlite3.verbose()
let sqliteDb = null
let mysqlMasterPool = null  // Pour les écritures (INSERT, UPDATE, DELETE)
let mysqlSlavePool = null   // Pour les lectures (SELECT)
let lastReadDbSource = 'sqlite@local'
let currentWriteDb = 'sqlite@local'

// Client MinIO pour le stockage objet
const minioClient = new MinioClient({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
})

function describeMysqlTarget(conn) {
  const cfg = conn.connection?.config || conn.config || {}
  const host = cfg.host || (cfg.socketPath ? `socket:${cfg.socketPath}` : 'localhost')
  const port = cfg.port ? `:${cfg.port}` : ''
  const thread = conn.threadId ? `#${conn.threadId}` : ''
  return `${host}${port}${thread}`
}

async function withConnection(pool, role, task) {
  const conn = await pool.getConnection()
  try {
    const result = await task(conn)
    const descriptor = describeMysqlTarget(conn)
    if (role === 'read') {
      lastReadDbSource = `read:${descriptor}`
    } else if (role === 'write') {
      currentWriteDb = `write:${descriptor}`
    }
    return result
  } finally {
    conn.release()
  }
}

async function initDatabase() {
  if (DB_DRIVER === 'mysql') {
    // MySQL Master: pool pour les opérations d'écriture
    mysqlMasterPool = await mysql.createPool({
      host: MYSQL_MASTER_HOST,
      port: MYSQL_MASTER_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      connectionLimit: 5,
    })
    
    // MySQL Slave: pool pour les opérations de lecture
    mysqlSlavePool = await mysql.createPool({
      host: MYSQL_SLAVE_HOST,
      port: MYSQL_SLAVE_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      connectionLimit: 10,  // Plus de connexions pour les lectures
    })
    
    // Créer la table sur le master (sera répliquée sur le slave)
    await mysqlMasterPool.query(
      `CREATE TABLE IF NOT EXISTS images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        image_path VARCHAR(1024) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`
    )
    
    console.log(`✅ MySQL Read/Write Split: Master=${MYSQL_MASTER_HOST}:${MYSQL_MASTER_PORT}, Slave=${MYSQL_SLAVE_HOST}:${MYSQL_SLAVE_PORT}`)
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
    const execResult = await withConnection(mysqlMasterPool, 'write', async (conn) => {
      const [result] = await conn.execute(
        'INSERT INTO images (name, image_path) VALUES (?, ?)',
        [name, relativePath]
      )
      return result
    })
    return Number(execResult.insertId)
  }
  currentWriteDb = 'write:sqlite@local'
  return await new Promise((resolve, reject) => {
    sqliteDb.run(
      'INSERT INTO images (name, image_path) VALUES (?, ?)',
      [name, relativePath],
      function (err) {
        if (err) return reject(err)
        currentWriteDb = 'write:sqlite@local'
        resolve(this.lastID)
      }
    )
  })
}

async function selectLatestImage() {
  if (DB_DRIVER === 'mysql') {
    try {
      const rows = await withConnection(mysqlSlavePool, 'read', async (conn) => {
        const [result] = await conn.query(
          'SELECT id, name, image_path, created_at FROM images ORDER BY created_at DESC, id DESC LIMIT 1'
        )
        return result
      })
      return rows[0] || null
    } catch (err) {
      console.warn('⚠️  Slave DB down, using master for reads')
      const rows = await withConnection(mysqlMasterPool, 'read', async (conn) => {
        const [result] = await conn.query(
          'SELECT id, name, image_path, created_at FROM images ORDER BY created_at DESC, id DESC LIMIT 1'
        )
        return result
      })
      return rows[0] || null
    }
  }
  lastReadDbSource = 'read:sqlite@local'
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

async function selectImagesPaginated(offset, limit) {
  if (DB_DRIVER === 'mysql') {
    try {
      return await withConnection(mysqlSlavePool, 'read', async (conn) => {
        const [rows] = await conn.query(
          'SELECT SQL_CALC_FOUND_ROWS id, name, image_path, created_at FROM images ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
          [Number(limit), Number(offset)]
        )
        const [totalRows] = await conn.query('SELECT FOUND_ROWS() as total')
        return { rows, total: Number(totalRows?.[0]?.total || 0) }
      })
    } catch (err) {
      console.warn('⚠️  Slave DB down, using master for reads (paginated)')
      return await withConnection(mysqlMasterPool, 'read', async (conn) => {
        const [rows] = await conn.query(
          'SELECT SQL_CALC_FOUND_ROWS id, name, image_path, created_at FROM images ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
          [Number(limit), Number(offset)]
        )
        const [totalRows] = await conn.query('SELECT FOUND_ROWS() as total')
        return { rows, total: Number(totalRows?.[0]?.total || 0) }
      })
    }
  }
  lastReadDbSource = 'read:sqlite@local'
  return await new Promise((resolve, reject) => {
    sqliteDb.all(
      'SELECT id, name, image_path, created_at FROM images ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
      [Number(limit), Number(offset)],
      (err, rows) => {
        if (err) return reject(err)
        // Approx total for sqlite
        sqliteDb.get('SELECT COUNT(*) as total FROM images', (e2, totalRow) => {
          if (e2) return reject(e2)
          resolve({ rows: rows || [], total: Number(totalRow?.total || 0) })
        })
      }
    )
  })
}

async function deleteImage(id) {
  if (DB_DRIVER === 'mysql') {
    return await withConnection(mysqlMasterPool, 'write', async (conn) => {
      const [rows] = await conn.query('SELECT image_path FROM images WHERE id = ?', [id])
      const fileName = rows?.[0]?.image_path
      if (!fileName) return false
      const objectName = String(fileName)
      try {
        await minioClient.removeObject(MINIO_BUCKET, objectName)
      } catch (err) {
        if (err?.code !== 'NoSuchKey') {
          throw err
        }
      }
      await conn.query('DELETE FROM images WHERE id = ?', [id])
      return true
    })
  }
  return await new Promise((resolve, reject) => {
    sqliteDb.get('SELECT image_path FROM images WHERE id = ?', [id], async (err, row) => {
      if (err) return reject(err)
      if (!row) return resolve(false)
      const objectName = String(row.image_path)
      try {
        await minioClient.removeObject(MINIO_BUCKET, objectName)
      } catch (errRemove) {
        if (errRemove?.code && errRemove.code !== 'NoSuchKey') {
          return reject(errRemove)
        }
      }
      sqliteDb.run('DELETE FROM images WHERE id = ?', [id], (e2) => {
        if (e2) return reject(e2)
        currentWriteDb = 'write:sqlite@local'
        resolve(true)
      })
    })
  })
}

// Multer pour la gestion des uploads (stockage en mémoire pour MinIO)
const storage = multer.memoryStorage()
const upload = multer({ storage })

// En-tête pour exposer le numéro du serveur
app.use((req, res, next) => {
  res.setHeader('X-Server-Number', String(SERVER_NUMBER))
  next()
})

// Route proxy pour servir les fichiers depuis MinIO
app.get('/uploads/:filename', async (req, res) => {
  try {
    const fileName = req.params.filename
    const dataStream = await minioClient.getObject(MINIO_BUCKET, fileName)
    dataStream.pipe(res)
  } catch (err) {
    console.error('Erreur récupération MinIO:', err)
    res.status(404).send('File not found')
  }
})

// Servir les fichiers statiques avec headers no-cache pour CSS
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
    // Toujours servir les fichiers via la route proxy /uploads/<filename>
    const sanitizedPath = String(row.image_path).replace(/^\/+/, '')
    const imageUrl = `/uploads/${sanitizedPath}`
    res.setHeader('X-DB-Source', lastReadDbSource)
    return res.json({
      item: { id: row.id, name: row.name, imageUrl, createdAt: row.created_at },
      serverNumber: SERVER_NUMBER,
      dbSource: lastReadDbSource,
      writeDb: currentWriteDb,
    })
  } catch (err) {
    return res.status(500).json({ error: 'Erreur base de données' })
  }
})

// Dernières 5 images pour le carrousel
app.get('/api/latest-5', async (req, res) => {
  try {
    const { rows, total } = await selectImagesPaginated(0, 5)
    const items = (rows || []).map(r => ({
      id: r.id,
      name: r.name,
      imageUrl: `/uploads/${String(r.image_path).replace(/^\/+/, '')}`,
      createdAt: r.created_at,
    }))
    res.setHeader('X-DB-Source', lastReadDbSource)
    return res.json({ items, total, dbSource: lastReadDbSource, serverNumber: SERVER_NUMBER, writeDb: currentWriteDb })
  } catch (err) {
    return res.status(500).json({ error: 'Erreur base de données' })
  }
})

// Liste paginée avec suppression
app.get('/api/images', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
    const offset = (page - 1) * limit
    const { rows, total } = await selectImagesPaginated(offset, limit)
    const items = (rows || []).map(r => ({
      id: r.id,
      name: r.name,
      imageUrl: `/uploads/${String(r.image_path).replace(/^\/+/, '')}`,
      createdAt: r.created_at,
    }))
    res.setHeader('X-DB-Source', lastReadDbSource)
    return res.json({ items, total, page, limit, serverNumber: SERVER_NUMBER, dbSource: lastReadDbSource, writeDb: currentWriteDb })
  } catch (err) {
    return res.status(500).json({ error: 'Erreur base de données' })
  }
})

app.delete('/api/images/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'ID invalide' })
    const ok = await deleteImage(id)
    if (!ok) return res.status(404).json({ error: 'Introuvable' })
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: 'Erreur suppression' })
  }
})

// Route: enregistrer (nom + image) avec upload vers MinIO
app.post('/api/upload', upload.single('image'), async (req, res) => {
  const name = req.body?.name?.trim()
  const file = req.file

  if (!name) return res.status(400).json({ error: 'Le nom est obligatoire' })
  if (!file) return res.status(400).json({ error: 'Le fichier image est obligatoire' })

  try {
    // Générer un nom de fichier unique
    const time = Date.now()
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')
    const fileName = `${time}-${safeOriginal}`
    
    // Upload vers MinIO
    await minioClient.putObject(
      MINIO_BUCKET,
      fileName,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype }
    )
    
    // Stocker le nom du fichier dans la BDD
    const id = await insertImageRecord(name, fileName)
    const imageUrl = `/uploads/${fileName}`
    
    return res.status(201).json({ id, name, imageUrl })
  } catch (err) {
    console.error('Erreur upload MinIO:', err)
    return res.status(500).json({ error: 'Erreur upload fichier' })
  }
})

// Route: info serveur (IP locale + numéro)
app.get('/api/info', (req, res) => {
  res.json({ ip: getLocalIp(), port: PORT, serverNumber: SERVER_NUMBER, dbSource: lastReadDbSource, writeDb: currentWriteDb })
})

// Endpoint de santé pour le Load Balancer
app.get('/health', async (req, res) => {
  try {
    if (DB_DRIVER === 'mysql' && mysqlMasterPool) {
      // Vérifie le master (critique) et le slave (optionnel)
      await mysqlMasterPool.query('SELECT 1')
      // Le slave est optionnel pour la santé, mais on log si down
      try {
        await mysqlSlavePool.query('SELECT 1')
      } catch (err) {
        console.warn('⚠️  Slave DB unreachable, falling back to master for reads')
      }
    }
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
  console.log(`📦 Stockage: MinIO (${MINIO_ENDPOINT}:${MINIO_PORT}/${MINIO_BUCKET})`)
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
