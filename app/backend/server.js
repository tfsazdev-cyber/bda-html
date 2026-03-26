const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'bda-secret-key-change-in-production';
const DB_PATH = process.env.DB_PATH || '/data/bda_portal.db';

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Database setup
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    role TEXT DEFAULT 'Viewer',
    status TEXT DEFAULT 'active',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    lastLogin DATETIME
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

// Seed default users
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (firstName, lastName, email, password, phone, company, role)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

insertUser.run('Admin',   'User',    'admin@bda.com', 'Admin@123', '+91 9876543210', 'BDA Corp', 'Admin');
insertUser.run('John',    'Manager', 'john@bda.com',  'Admin@123', '+91 9876543211', 'BDA Corp', 'Manager');
insertUser.run('Jane',    'Analyst', 'jane@bda.com',  'Admin@123', '+91 9876543212', 'BDA Corp', 'Analyst');
insertUser.run('Bob',     'Viewer',  'bob@bda.com',   'Admin@123', '+91 9876543213', 'BDA Corp', 'Viewer');

// ── Auth Middleware ──────────────────────────────────────────────
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = decoded;
    next();
  });
}

function logActivity(userId, action, details, ip) {
  try {
    db.prepare(`INSERT INTO activity_log (userId, action, details, ip) VALUES (?,?,?,?)`)
      .run(userId, action, details, ip || 'unknown');
  } catch (e) { /* non-fatal */ }
}

// ── Routes ───────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'BDA Backend API',
    version: '1.0.0',
    database: 'connected',
    uptime: Math.floor(process.uptime()),
    time: new Date().toISOString()
  });
});

// Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND password = ?').get(email, password);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  db.prepare('UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  logActivity(user.id, 'LOGIN', `User ${user.email} logged in`, req.ip);

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  const { password: _, ...userResponse } = user;
  res.json({ message: 'Login successful', token, user: userResponse });
});

// Users list
app.get('/users', authenticateToken, (req, res) => {
  const users = db.prepare(`
    SELECT id, firstName, lastName, email, phone, company, role, status, createdAt, lastLogin
    FROM users ORDER BY createdAt DESC
  `).all();
  res.json({ success: true, count: users.length, users });
});

// Create user
app.post('/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'Manager')
    return res.status(403).json({ message: 'Insufficient permissions' });

  const { firstName, lastName, email, password, phone, company, role } = req.body;
  if (!firstName || !lastName || !email || !password)
    return res.status(400).json({ message: 'Required fields missing' });

  try {
    const result = db.prepare(`
      INSERT INTO users (firstName, lastName, email, password, phone, company, role)
      VALUES (?,?,?,?,?,?,?)
    `).run(firstName, lastName, email, password, phone || '', company || '', role || 'Viewer');

    logActivity(req.user.id, 'CREATE_USER', `Created user ${email}`, req.ip);
    res.status(201).json({ success: true, id: result.lastInsertRowid, message: 'User created' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ message: 'Email already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user
app.delete('/users/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'Admin')
    return res.status(403).json({ message: 'Admin only' });

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, 'DELETE_USER', `Deleted user ID ${req.params.id}`, req.ip);
  res.json({ success: true, message: 'User deleted' });
});

// Dashboard analytics
app.get('/analytics/dashboard', authenticateToken, (req, res) => {
  const totalUsers  = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const activeUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE status="active"').get().c;
  const adminCount  = db.prepare('SELECT COUNT(*) as c FROM users WHERE role="Admin"').get().c;
  const recentLogins = db.prepare(`
    SELECT COUNT(*) as c FROM users
    WHERE lastLogin >= datetime('now','-1 day')
  `).get().c;

  res.json({
    success: true,
    data: {
      totalUsers, activeUsers, adminCount,
      todayLogins: recentLogins,
      systemHealth: {
        database: 'healthy',
        api: 'healthy',
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptime: Math.floor(process.uptime())
      },
      weeklyActivity: [12, 19, 15, 25, 22, 18, 24]
    }
  });
});

// Activity log
app.get('/activity', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.action, a.details, a.timestamp, u.firstName || ' ' || u.lastName as userName
    FROM activity_log a
    LEFT JOIN users u ON a.userId = u.id
    ORDER BY a.timestamp DESC LIMIT 20
  `).all();
  res.json({ success: true, activities: rows });
});

// Catch-all
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BDA Portal API  →  http://0.0.0.0:${PORT}`);
  console.log(`📦 Database        →  ${DB_PATH}`);
});
