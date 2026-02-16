const path = require('path');
const express = require('express');
const multer = require('multer');
const { all, get, run } = require('../db');
const { ensureRole } = require('../middleware/auth');
const { evaluateAssignment } = require('../aiEvaluator');

const router = express.Router();

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, path.join(__dirname, '..', '..', 'uploads'));
  },
  filename(req, file, cb) {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname.replace(/\s+/g, '_')}`);
  }
});

const allowed = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
  'text/plain',
  'text/markdown'
];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only PDF, DOCX, DOC, PNG, JPG, TXT, or MD files are allowed.'));
    }
    return cb(null, true);
  }
});

router.get('/submit', ensureRole('student'), async (req, res) => {
  const assignments = await all(`SELECT a.id, a.title, a.due_date, c.code, c.title AS class_title
    FROM assignments a
    JOIN classes c ON a.class_id = c.id
    JOIN class_students cs ON cs.class_id = c.id
    WHERE cs.student_id = ?
    ORDER BY a.due_date ASC`, [req.session.user.id]);

  res.render('assignment-submit', {
    user: req.session.user,
    assignments,
    error: null
  });
});

router.get('/manage', ensureRole('admin'), async (req, res) => {
  const submissions = await all(`SELECT s.id, s.submitted_at, s.score, s.evaluation_mode,
    s.file_name, a.title AS assignment_title, c.code AS class_code, u.full_name AS student_name
    FROM submissions s
    JOIN assignments a ON s.assignment_id = a.id
    JOIN classes c ON a.class_id = c.id
    JOIN users u ON s.student_id = u.id
    ORDER BY s.submitted_at DESC`);

  return res.render('assignment-manage', {
    user: req.session.user,
    submissions
  });
});

router.get('/faculty', ensureRole('faculty'), async (req, res) => {
  const submissions = await all(`SELECT s.id, s.submitted_at, s.score, s.evaluation_mode,
    s.file_name, a.title AS assignment_title, c.code AS class_code, u.full_name AS student_name
    FROM submissions s
    JOIN assignments a ON s.assignment_id = a.id
    JOIN classes c ON a.class_id = c.id
    JOIN users u ON s.student_id = u.id
    WHERE c.faculty_id = ?
    ORDER BY s.submitted_at DESC`, [req.session.user.id]);

  return res.render('assignment-faculty', {
    user: req.session.user,
    submissions
  });
});

router.post('/submit', ensureRole('student'), upload.single('assignment_file'), async (req, res) => {
  try {
    if (!req.file) {
      const assignments = await all(`SELECT a.id, a.title, a.due_date, c.code, c.title AS class_title
        FROM assignments a
        JOIN classes c ON a.class_id = c.id
        JOIN class_students cs ON cs.class_id = c.id
        WHERE cs.student_id = ?
        ORDER BY a.due_date ASC`, [req.session.user.id]);

      return res.status(400).render('assignment-submit', {
        user: req.session.user,
        assignments,
        error: 'Please upload a valid file before submitting.'
      });
    }

    const assignmentId = Number(req.body.assignment_id);
    const assignment = await get('SELECT * FROM assignments WHERE id = ?', [assignmentId]);

    if (!assignment) {
      return res.status(404).render('error', {
        user: req.session.user,
        message: 'Selected assignment was not found.'
      });
    }

    const feedback = await evaluateAssignment(req.file);

    const result = await run(`INSERT INTO submissions
      (assignment_id, student_id, file_name, file_path, submitted_at, score, feedback_json, evaluation_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      assignmentId,
      req.session.user.id,
      req.file.originalname,
      req.file.path,
      new Date().toISOString().slice(0, 19).replace('T', ' '),
      Number(feedback.score) || null,
      JSON.stringify(feedback),
      feedback.mode || 'heuristic'
    ]);

    res.redirect(`/assignments/result/${result.insertId || result.lastID}`);
  } catch (error) {
    const assignments = await all(`SELECT a.id, a.title, a.due_date, c.code, c.title AS class_title
      FROM assignments a
      JOIN classes c ON a.class_id = c.id
      JOIN class_students cs ON cs.class_id = c.id
      WHERE cs.student_id = ?
      ORDER BY a.due_date ASC`, [req.session.user.id]);

    res.status(400).render('assignment-submit', {
      user: req.session.user,
      assignments,
      error: error.message || 'Submission failed. Please try again.'
    });
  }
});

router.get('/result/:id', ensureRole('student', 'faculty', 'admin'), async (req, res) => {
  const submission = await get(`SELECT s.*, a.title AS assignment_title, u.full_name,
    c.faculty_id, c.code AS class_code
    FROM submissions s
    JOIN assignments a ON s.assignment_id = a.id
    JOIN classes c ON a.class_id = c.id
    JOIN users u ON s.student_id = u.id
    WHERE s.id = ?`, [req.params.id]);

  if (!submission) {
    return res.status(404).render('error', {
      user: req.session.user,
      message: 'Submission not found.'
    });
  }

  if (req.session.user.role === 'student' && req.session.user.id !== submission.student_id) {
    return res.status(403).render('error', {
      user: req.session.user,
      message: 'You do not have access to this result.'
    });
  }

  if (req.session.user.role === 'faculty' && req.session.user.id !== submission.faculty_id) {
    return res.status(403).render('error', {
      user: req.session.user,
      message: 'You can only access submissions for your assigned classes.'
    });
  }

  const feedback = JSON.parse(submission.feedback_json || '{}');

  return res.render('assignment-result', {
    user: req.session.user,
    submission,
    feedback
  });
});

module.exports = router;
