const express = require('express');
const bcrypt = require('bcryptjs');
const { get, run } = require('../db');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  return res.render('login', {
    error: null,
    message: req.query.registered ? 'Registration successful. Please login.' : null,
    user: null
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await get('SELECT * FROM users WHERE email = ?', [email]);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).render('login', {
      error: 'Invalid credentials.',
      message: null,
      user: null
    });
  }

  req.session.user = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role
  };

  return res.redirect('/dashboard');
});

router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.render('register', {
    error: null,
    user: null
  });
});

router.post('/register', async (req, res) => {
  const { full_name, email, password, role } = req.body;

  if (!full_name || !email || !password || !role) {
    return res.status(400).render('register', {
      error: 'All fields are required.',
      user: null
    });
  }

  if (!['student', 'faculty'].includes(role)) {
    return res.status(400).render('register', {
      error: 'Invalid role selected.',
      user: null
    });
  }

  if (password.length < 6) {
    return res.status(400).render('register', {
      error: 'Password must be at least 6 characters long.',
      user: null
    });
  }

  const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    return res.status(409).render('register', {
      error: 'Email already exists. Please login or use another email.',
      user: null
    });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  await run('INSERT INTO users(full_name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
    full_name,
    email,
    passwordHash,
    role
  ]);

  return res.redirect('/login?registered=1');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
