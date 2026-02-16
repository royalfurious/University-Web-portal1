const express = require('express');
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const { ensureRole } = require('../middleware/auth');

const router = express.Router();

router.use(ensureRole('admin'));

router.get('/', async (req, res) => {
  const users = await all('SELECT id, full_name, email, role FROM users ORDER BY role, full_name');
  const faculties = await all("SELECT id, full_name FROM users WHERE role = 'faculty' ORDER BY full_name");
  const classes = await all(`SELECT c.id, c.code, c.title, c.faculty_id, u.full_name AS faculty_name
    FROM classes c
    LEFT JOIN users u ON c.faculty_id = u.id
    ORDER BY c.code`);

  res.render('admin', {
    user: req.session.user,
    users,
    faculties,
    classes,
    error: req.query.error || null,
    success: req.query.success || null
  });
});

router.post('/users', async (req, res) => {
  const { full_name, email, password, role } = req.body;

  if (!full_name || !email || !password || !role) {
    return res.redirect('/admin?error=All user fields are required');
  }

  if (!['student', 'faculty'].includes(role)) {
    return res.redirect('/admin?error=Only student and faculty can be created here');
  }

  const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    return res.redirect('/admin?error=Email already exists');
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  await run('INSERT INTO users(full_name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
    full_name,
    email,
    passwordHash,
    role
  ]);

  return res.redirect('/admin?success=User created');
});

router.post('/users/:id/delete', async (req, res) => {
  const userId = Number(req.params.id);
  const targetUser = await get('SELECT id, role FROM users WHERE id = ?', [userId]);

  if (!targetUser) {
    return res.redirect('/admin?error=User not found');
  }

  if (targetUser.role === 'admin') {
    return res.redirect('/admin?error=Admin users cannot be deleted from this panel');
  }

  try {
    await run('DELETE FROM users WHERE id = ?', [userId]);
    return res.redirect('/admin?success=User removed');
  } catch (error) {
    return res.redirect('/admin?error=User cannot be removed due to related records');
  }
});

router.post('/users/:id/reset-password', async (req, res) => {
  const userId = Number(req.params.id);
  const { new_password } = req.body;

  if (!new_password || new_password.length < 6) {
    return res.redirect('/admin?error=New password must be at least 6 characters');
  }

  const targetUser = await get('SELECT id FROM users WHERE id = ?', [userId]);
  if (!targetUser) {
    return res.redirect('/admin?error=User not found');
  }

  const passwordHash = bcrypt.hashSync(new_password, 10);
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
  return res.redirect('/admin?success=Password reset successfully');
});

router.post('/classes', async (req, res) => {
  const { code, title, faculty_id } = req.body;

  if (!code || !title) {
    return res.redirect('/admin?error=Class code and title are required');
  }

  const facultyIdValue = faculty_id ? Number(faculty_id) : null;

  try {
    await run('INSERT INTO classes(code, title, faculty_id) VALUES (?, ?, ?)', [code, title, facultyIdValue]);
    return res.redirect('/admin?success=Class created');
  } catch (error) {
    return res.redirect('/admin?error=Class code already exists or invalid faculty');
  }
});

router.post('/classes/:id/delete', async (req, res) => {
  const classId = Number(req.params.id);

  try {
    await run('DELETE FROM classes WHERE id = ?', [classId]);
    return res.redirect('/admin?success=Class removed');
  } catch (error) {
    return res.redirect('/admin?error=Class cannot be removed due to related records');
  }
});

router.post('/classes/:id/assign-faculty', async (req, res) => {
  const classId = Number(req.params.id);
  const facultyId = req.body.faculty_id ? Number(req.body.faculty_id) : null;

  if (!facultyId) {
    return res.redirect('/admin?error=Please select a faculty');
  }

  const faculty = await get("SELECT id FROM users WHERE id = ? AND role = 'faculty'", [facultyId]);
  if (!faculty) {
    return res.redirect('/admin?error=Invalid faculty selected');
  }

  await run('UPDATE classes SET faculty_id = ? WHERE id = ?', [facultyId, classId]);
  return res.redirect('/admin?success=Faculty assigned to class');
});

module.exports = router;
