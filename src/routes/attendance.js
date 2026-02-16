const express = require('express');
const { all, run } = require('../db');
const { ensureRole } = require('../middleware/auth');

const router = express.Router();

router.get('/mark', ensureRole('faculty', 'admin'), async (req, res) => {
  const classes = req.session.user.role === 'admin'
    ? await all('SELECT id, code, title FROM classes ORDER BY code')
    : await all('SELECT id, code, title FROM classes WHERE faculty_id = ? ORDER BY code', [req.session.user.id]);

  const selectedClassId = req.query.class_id || (classes[0] ? classes[0].id : null);
  const selectedDate = req.query.date || new Date().toISOString().split('T')[0];

  let students = [];
  if (selectedClassId) {
    students = await all(`SELECT u.id, u.full_name
      FROM class_students cs
      JOIN users u ON cs.student_id = u.id
      WHERE cs.class_id = ?
      ORDER BY u.full_name`, [selectedClassId]);
  }

  res.render('attendance-mark', {
    user: req.session.user,
    classes,
    students,
    selectedClassId: Number(selectedClassId),
    selectedDate
  });
});

router.post('/mark', ensureRole('faculty', 'admin'), async (req, res) => {
  const { class_id, attendance_date } = req.body;
  const entries = Array.isArray(req.body.student_ids) ? req.body.student_ids : [req.body.student_ids].filter(Boolean);

  for (const studentId of entries) {
    const statusKey = `status_${studentId}`;
    const status = req.body[statusKey] || 'Absent';

    await run(`INSERT INTO attendance (class_id, student_id, attendance_date, status, marked_by)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by)`,
    [class_id, studentId, attendance_date, status, req.session.user.id]);
  }

  res.redirect(`/attendance/records?class_id=${class_id}&from=${attendance_date}&to=${attendance_date}`);
});

router.get('/records', ensureRole('faculty', 'admin'), async (req, res) => {
  const classes = req.session.user.role === 'admin'
    ? await all('SELECT id, code, title FROM classes ORDER BY code')
    : await all('SELECT id, code, title FROM classes WHERE faculty_id = ? ORDER BY code', [req.session.user.id]);

  const selectedClassId = req.query.class_id || (classes[0] ? classes[0].id : null);
  const fromDate = req.query.from || '2026-01-01';
  const toDate = req.query.to || new Date().toISOString().split('T')[0];

  let records = [];
  if (selectedClassId) {
    records = await all(`SELECT a.attendance_date, a.status, u.full_name, c.code
      FROM attendance a
      JOIN users u ON a.student_id = u.id
      JOIN classes c ON a.class_id = c.id
      WHERE a.class_id = ? AND a.attendance_date BETWEEN ? AND ?
      ORDER BY a.attendance_date DESC, u.full_name ASC`, [selectedClassId, fromDate, toDate]);
  }

  res.render('attendance-records', {
    user: req.session.user,
    classes,
    records,
    selectedClassId: Number(selectedClassId),
    fromDate,
    toDate
  });
});

router.get('/my', ensureRole('student'), async (req, res) => {
  const records = await all(`SELECT a.attendance_date, a.status, c.code, c.title
    FROM attendance a
    JOIN classes c ON a.class_id = c.id
    WHERE a.student_id = ?
    ORDER BY a.attendance_date DESC, c.code ASC`, [req.session.user.id]);

  res.render('attendance-my', {
    user: req.session.user,
    records
  });
});

router.get('/report', ensureRole('admin', 'faculty'), async (req, res) => {
  const params = [];
  let scopeClause = '';

  if (req.session.user.role === 'faculty') {
    scopeClause = 'WHERE c.faculty_id = ?';
    params.push(req.session.user.id);
  }

  const report = await all(`SELECT c.code, c.title, u.full_name,
    SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) as total_present,
    COUNT(a.id) as total_marked,
    CASE WHEN COUNT(a.id) = 0 THEN 0
         ELSE ROUND((SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) * 100.0) / COUNT(a.id), 2)
    END AS attendance_percentage
    FROM class_students cs
    JOIN classes c ON cs.class_id = c.id
    JOIN users u ON cs.student_id = u.id
    LEFT JOIN attendance a ON a.class_id = cs.class_id AND a.student_id = cs.student_id
    ${scopeClause}
    GROUP BY c.id, u.id
    ORDER BY c.code, u.full_name`, params);

  res.render('attendance-report', {
    user: req.session.user,
    report
  });
});

module.exports = router;
