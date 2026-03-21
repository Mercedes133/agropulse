const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_PATH = process.env.DATABASE_PATH || './users.db';

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'agropluse_dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));
app.use(express.static(path.join(__dirname)));

// Database setup
const dbDir = path.dirname(DATABASE_PATH);
if (dbDir && dbDir !== '.') {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new sqlite3.Database(DATABASE_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    password TEXT,
    status TEXT DEFAULT 'approved'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.all(`PRAGMA table_info(users)`, [], (err, columns) => {
    if (err) {
      console.error('Error reading users schema:', err);
      return;
    }

    const hasBalance = (columns || []).some((column) => column.name === 'balance');
    if (!hasBalance) {
      db.run(`ALTER TABLE users ADD COLUMN balance REAL DEFAULT 0`, (alterErr) => {
        if (alterErr) {
          console.error('Error adding users.balance column:', alterErr);
        }
      });
    }
  });
});

const INVESTMENT_PLANS = [
  { id: 'poultry-starter', name: 'Poultry Starter', minDeposit: 20, payoutMultiplier: 3, payoutDays: 7 },
  { id: 'boer-goat', name: 'Boer Goat', minDeposit: 100, payoutMultiplier: 3, payoutDays: 7 },
  { id: 'dairy-cow', name: 'Dairy Cow', minDeposit: 300, payoutMultiplier: 3, payoutDays: 7 }
];

function calculatePlanPayout(amount, plan) {
  const projectedPayout = Math.round((amount * plan.payoutMultiplier) * 100) / 100;
  const payoutDate = new Date(Date.now() + (plan.payoutDays * 24 * 60 * 60 * 1000)).toISOString();
  return {
    projectedPayout,
    payoutMultiplier: plan.payoutMultiplier,
    payoutDays: plan.payoutDays,
    payoutDate
  };
}

function requireAuth(req, res, next) {
  if (!req.session.user || !req.session.user.id) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/website', (req, res) => {
  res.sendFile(path.join(__dirname, 'website.html'));
});

// Helper: Hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// API Routes
app.post('/api/signup', (req, res) => {
  const { name, email, phone, password } = req.body;
  
  // Validate input
  if (!name || !email || !phone || !password) {
    return res.json({ success: false, message: 'All fields are required' });
  }
  
  const hashedPassword = hashPassword(password);
  db.run(`INSERT INTO users (name, email, phone, password, status) VALUES (?, ?, ?, ?, ?)`,
    [name, email, phone, hashedPassword, 'approved'], function(err) {
      if (err) {
        console.error('Signup error:', err);
        return res.json({ success: false, message: 'Email already exists' });
      }
      req.session.user = {
        id: this.lastID,
        name,
        email,
        phone,
        balance: 0
      };
      res.json({ success: true, message: 'Signup successful', user: req.session.user });
    });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return res.json({ success: false, message: 'Email and password required' });
  }
  
  const hashedPassword = hashPassword(password);
  db.get(`SELECT * FROM users WHERE email = ? AND password = ? AND status = 'approved'`,
    [email, hashedPassword], (err, row) => {
      if (err) {
        console.error('Login error:', err);
        return res.json({ success: false, message: 'Server error' });
      }
      if (row) {
        req.session.user = {
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          balance: Number(row.balance || 0)
        };
        res.json({ success: true, message: 'Login successful', user: req.session.user });
      } else {
        res.json({ success: false, message: 'Invalid credentials or not approved' });
      }
    });
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.json({ success: false, authenticated: false });
  }

  db.get(`SELECT id, name, email, phone, balance FROM users WHERE id = ?`, [req.session.user.id], (err, row) => {
    if (err) {
      console.error('Error loading current user:', err);
      return res.status(500).json({ success: false, authenticated: false, message: 'Server error' });
    }

    if (!row) {
      return res.json({ success: false, authenticated: false });
    }

    req.session.user = {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      balance: Number(row.balance || 0)
    };

    res.json({ success: true, authenticated: true, user: req.session.user });
  });
});

app.get('/api/plans', requireAuth, (req, res) => {
  res.json({ success: true, plans: INVESTMENT_PLANS });
});

app.get('/api/deposits', requireAuth, (req, res) => {
  db.all(
    `SELECT id, plan_id, plan_name, amount, created_at
     FROM deposits
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC`,
    [req.session.user.id],
    (err, rows) => {
      if (err) {
        console.error('Error loading deposits:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
      }
      const depositsWithPayout = (rows || []).map((deposit) => {
        const plan = INVESTMENT_PLANS.find((item) => item.id === deposit.plan_id);
        if (!plan) {
          return deposit;
        }

        return {
          ...deposit,
          payout_multiplier: plan.payoutMultiplier,
          payout_days: plan.payoutDays,
          projected_payout: Math.round((Number(deposit.amount || 0) * plan.payoutMultiplier) * 100) / 100
        };
      });

      res.json({ success: true, deposits: depositsWithPayout });
    }
  );
});

app.post('/api/deposit', requireAuth, (req, res) => {
  const { planId, amount } = req.body;
  const parsedAmount = Number(amount);

  if (!planId || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Valid plan and amount are required' });
  }

  const plan = INVESTMENT_PLANS.find((item) => item.id === planId);
  if (!plan) {
    return res.status(400).json({ success: false, message: 'Invalid investment plan selected' });
  }

  if (parsedAmount < plan.minDeposit) {
    return res.status(400).json({ success: false, message: `Minimum deposit for ${plan.name} is GH₵ ${plan.minDeposit}` });
  }

  const roundedAmount = Math.round(parsedAmount * 100) / 100;
  const payoutDetails = calculatePlanPayout(roundedAmount, plan);

  db.run(
    `INSERT INTO deposits (user_id, plan_id, plan_name, amount) VALUES (?, ?, ?, ?)`,
    [req.session.user.id, plan.id, plan.name, roundedAmount],
    function(insertErr) {
      if (insertErr) {
        console.error('Error creating deposit:', insertErr);
        return res.status(500).json({ success: false, message: 'Failed to create deposit' });
      }

      const depositId = this.lastID;

      db.run(
        `UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?`,
        [roundedAmount, req.session.user.id],
        function(updateErr) {
          if (updateErr) {
            console.error('Error updating balance:', updateErr);
            return res.status(500).json({ success: false, message: 'Failed to update balance' });
          }

          db.get(`SELECT balance FROM users WHERE id = ?`, [req.session.user.id], (balanceErr, balanceRow) => {
            if (balanceErr) {
              console.error('Error reading updated balance:', balanceErr);
              return res.status(500).json({ success: false, message: 'Failed to read updated balance' });
            }

            const updatedBalance = Number((balanceRow && balanceRow.balance) || 0);
            req.session.user.balance = updatedBalance;

            res.json({
              success: true,
              message: 'Deposit successful',
              deposit: {
                id: depositId,
                planId: plan.id,
                planName: plan.name,
                amount: roundedAmount,
                projectedPayout: payoutDetails.projectedPayout,
                payoutMultiplier: payoutDetails.payoutMultiplier,
                payoutDays: payoutDetails.payoutDays,
                payoutDate: payoutDetails.payoutDate
              },
              balance: updatedBalance
            });
          });
        }
      );
    }
  );
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.json({ success: false, message: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

app.get('/api/pending', (req, res) => {
  db.all(`SELECT id, name, email, phone, status FROM users WHERE status = 'pending'`, [], (err, rows) => {
    if (err) {
      console.error('Error fetching pending users:', err);
      return res.json({ success: false, message: 'Server error', users: [] });
    }
    res.json({ success: true, users: rows || [] });
  });
});

app.post('/api/approve/:id', (req, res) => {
  const id = req.params.id;
  db.run(`UPDATE users SET status = 'approved' WHERE id = ?`, [id], function(err) {
    if (err) {
      console.error('Error approving user:', err);
      return res.json({ success: false, message: 'Error approving user' });
    }
    res.json({ success: true, message: 'User approved' });
  });
});

app.post('/api/reject/:id', (req, res) => {
  const id = req.params.id;
  db.run(`DELETE FROM users WHERE id = ?`, [id], function(err) {
    if (err) {
      console.error('Error rejecting user:', err);
      return res.json({ success: false, message: 'Error rejecting user' });
    }
    res.json({ success: true, message: 'User rejected' });
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});