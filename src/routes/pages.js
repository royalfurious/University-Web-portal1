const express = require('express');
const { all } = require('../db');
const { ensureAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const events = await all('SELECT * FROM events ORDER BY event_date ASC LIMIT 5');
  res.render('home', { user: req.session.user || null, events });
});

router.get('/about', (req, res) => {
  res.render('about', { user: req.session.user || null });
});

router.get('/courses', async (req, res) => {
  const courses = await all(`SELECT c.code, c.title, u.full_name AS faculty_name,
    COUNT(cs.student_id) AS student_count
    FROM classes c
    LEFT JOIN users u ON c.faculty_id = u.id
    LEFT JOIN class_students cs ON cs.class_id = c.id
    GROUP BY c.id, u.full_name
    ORDER BY c.code`);

  res.render('courses', {
    user: req.session.user || null,
    courses
  });
});

router.get('/dashboard', ensureAuthenticated, async (req, res) => {
  let summary = [];
  if (req.session.user.role === 'faculty') {
    summary = await all(`SELECT c.code, c.title, COUNT(cs.student_id) as student_count
      FROM classes c
      LEFT JOIN class_students cs ON cs.class_id = c.id
      WHERE c.faculty_id = ?
      GROUP BY c.id
      ORDER BY c.code`, [req.session.user.id]);
  }

  if (req.session.user.role === 'student') {
    summary = await all(`SELECT c.code, c.title, a.title as assignment_title, a.due_date
      FROM class_students cs
      JOIN classes c ON cs.class_id = c.id
      LEFT JOIN assignments a ON a.class_id = c.id
      WHERE cs.student_id = ?
      ORDER BY a.due_date ASC`, [req.session.user.id]);
  }

  let adminStats = null;
  if (req.session.user.role === 'admin') {
    const [students] = await all('SELECT COUNT(*) AS cnt FROM users WHERE role = ?', ['student']);
    const [faculty] = await all('SELECT COUNT(*) AS cnt FROM users WHERE role = ?', ['faculty']);
    const [classes] = await all('SELECT COUNT(*) AS cnt FROM classes');
    const [submissions] = await all('SELECT COUNT(*) AS cnt FROM submissions');
    adminStats = {
      students: students?.cnt ?? 0,
      faculty: faculty?.cnt ?? 0,
      classes: classes?.cnt ?? 0,
      submissions: submissions?.cnt ?? 0
    };
  }

  res.render('dashboard', { user: req.session.user, summary, adminStats });
});

router.get('/api/events', async (req, res) => {
  const events = await all('SELECT * FROM events ORDER BY event_date ASC LIMIT 6');
  res.json(events);
});

module.exports = router;
