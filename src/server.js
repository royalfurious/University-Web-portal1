require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const { initializeDatabase } = require('./db');

const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const attendanceRoutes = require('./routes/attendance');
const assignmentRoutes = require('./routes/assignments');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.get('/favicon.ico', (req, res) => {
  res.redirect(302, '/public/images/university%20logo.jpg');
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

app.use(pageRoutes);
app.use(authRoutes);
app.use('/attendance', attendanceRoutes);
app.use('/assignments', assignmentRoutes);
app.use('/admin', adminRoutes);

app.use((err, req, res, next) => {
  if (err) {
    return res.status(500).render('error', {
      user: req.session.user || null,
      message: err.message || 'Something went wrong.'
    });
  }
  return next();
});

app.use((req, res) => {
  res.status(404).render('error', {
    user: req.session.user || null,
    message: 'Page not found.'
  });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`University portal running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
