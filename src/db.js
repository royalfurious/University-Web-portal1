const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'university_portal';

let pool;

async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  return pool;
}

async function run(query, params = []) {
  const activePool = await getPool();
  const [result] = await activePool.execute(query, params);
  return result;
}

async function all(query, params = []) {
  const activePool = await getPool();
  const [rows] = await activePool.execute(query, params);
  return rows;
}

async function get(query, params = []) {
  const rows = await all(query, params);
  return rows[0] || null;
}

async function createDatabaseIfNeeded() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await connection.end();
}

async function initializeDatabase() {
  await createDatabaseIfNeeded();
  await getPool();

  await run(`CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('student', 'faculty', 'admin') NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS classes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(30) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    faculty_id INT,
    CONSTRAINT fk_classes_faculty FOREIGN KEY (faculty_id) REFERENCES users(id)
      ON DELETE SET NULL ON UPDATE CASCADE
  )`);

  await run(`CREATE TABLE IF NOT EXISTS class_students (
    id INT PRIMARY KEY AUTO_INCREMENT,
    class_id INT NOT NULL,
    student_id INT NOT NULL,
    UNIQUE KEY uq_class_student (class_id, student_id),
    CONSTRAINT fk_cs_class FOREIGN KEY (class_id) REFERENCES classes(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_cs_student FOREIGN KEY (student_id) REFERENCES users(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  )`);

  await run(`CREATE TABLE IF NOT EXISTS attendance (
    id INT PRIMARY KEY AUTO_INCREMENT,
    class_id INT NOT NULL,
    student_id INT NOT NULL,
    attendance_date DATE NOT NULL,
    status ENUM('Present', 'Absent') NOT NULL,
    marked_by INT NOT NULL,
    UNIQUE KEY uq_attendance (class_id, student_id, attendance_date),
    CONSTRAINT fk_attendance_class FOREIGN KEY (class_id) REFERENCES classes(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES users(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_attendance_marker FOREIGN KEY (marked_by) REFERENCES users(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
  )`);

  await run(`CREATE TABLE IF NOT EXISTS assignments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    class_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    due_date DATE,
    CONSTRAINT fk_assignments_class FOREIGN KEY (class_id) REFERENCES classes(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  )`);

  await run(`CREATE TABLE IF NOT EXISTS submissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    assignment_id INT NOT NULL,
    student_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    submitted_at DATETIME NOT NULL,
    score INT,
    feedback_json LONGTEXT,
    evaluation_mode VARCHAR(30),
    CONSTRAINT fk_submissions_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_submissions_student FOREIGN KEY (student_id) REFERENCES users(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  )`);

  await run(`CREATE TABLE IF NOT EXISTS events (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    details TEXT,
    event_date DATE NOT NULL
  )`);

  const userCount = await get('SELECT COUNT(*) AS count FROM users');
  if (Number(userCount.count) === 0) {
    const facultyPass = bcrypt.hashSync('faculty123', 10);
    const studentPass = bcrypt.hashSync('student123', 10);
    const adminPass = bcrypt.hashSync('admin123', 10);

    await run('INSERT INTO users(full_name, email, password_hash, role) VALUES (?, ?, ?, ?)', ['Dr. Emma Clark', 'faculty@uni.edu', facultyPass, 'faculty']);
    await run('INSERT INTO users(full_name, email, password_hash, role) VALUES (?, ?, ?, ?)', ['Alex Johnson', 'student1@uni.edu', studentPass, 'student']);
    await run('INSERT INTO users(full_name, email, password_hash, role) VALUES (?, ?, ?, ?)', ['Priya Singh', 'student2@uni.edu', studentPass, 'student']);
    await run('INSERT INTO users(full_name, email, password_hash, role) VALUES (?, ?, ?, ?)', ['Portal Admin', 'admin@uni.edu', adminPass, 'admin']);

    const faculty = await get('SELECT id FROM users WHERE email = ?', ['faculty@uni.edu']);
    const student1 = await get('SELECT id FROM users WHERE email = ?', ['student1@uni.edu']);
    const student2 = await get('SELECT id FROM users WHERE email = ?', ['student2@uni.edu']);

    await run('INSERT INTO classes(code, title, faculty_id) VALUES (?, ?, ?)', ['CSE101', 'Introduction to Programming', faculty.id]);
    await run('INSERT INTO classes(code, title, faculty_id) VALUES (?, ?, ?)', ['ENG201', 'Academic Writing', faculty.id]);

    const classes = await all('SELECT id FROM classes');
    for (const cls of classes) {
      await run('INSERT IGNORE INTO class_students(class_id, student_id) VALUES (?, ?)', [cls.id, student1.id]);
      await run('INSERT IGNORE INTO class_students(class_id, student_id) VALUES (?, ?)', [cls.id, student2.id]);
    }

    const cseClass = await get('SELECT id FROM classes WHERE code = ?', ['CSE101']);
    const engClass = await get('SELECT id FROM classes WHERE code = ?', ['ENG201']);

    await run('INSERT INTO assignments(class_id, title, due_date) VALUES (?, ?, ?)', [cseClass.id, 'Data Structures Mini Project', '2026-03-05']);
    await run('INSERT INTO assignments(class_id, title, due_date) VALUES (?, ?, ?)', [engClass.id, 'Essay Draft: Technology & Society', '2026-02-28']);

    await run('INSERT INTO events(title, details, event_date) VALUES (?, ?, ?)', ['Hackathon Kickoff', 'Opening ceremony and team formation.', '2026-02-20']);
    await run('INSERT INTO events(title, details, event_date) VALUES (?, ?, ?)', ['Guest Lecture: AI in Education', 'By Prof. Sarah Lee at Auditorium A.', '2026-02-24']);
    await run('INSERT INTO events(title, details, event_date) VALUES (?, ?, ?)', ['Mid-Semester Sports Meet', 'Inter-department games and awards.', '2026-03-02']);
  }
}

module.exports = {
  run,
  all,
  get,
  initializeDatabase
};
