# CampusHub (Hackathon MVP)

A dynamic university portal with:

- Responsive **University Home Page** (logo, motto, nav, event/news section, footer)
- **Attendance Marking System** with DB storage and report views
- **Assignment Submission + AI Evaluation** (Gemini optional, heuristic fallback)
- Role-based login for **student**, **faculty**, and **admin**

## Tech Stack

- Frontend: EJS templates, HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: MySQL (auto-creates schema and tables on app start)
- AI Integration: Gemini API (optional via `GEMINI_API_KEY`) + fallback heuristic evaluator

## Project Structure

- `src/server.js` - app bootstrap
- `src/db.js` - schema + seed data
- `src/routes/` - auth, pages, attendance, assignments
- `src/aiEvaluator.js` - AI and heuristic assignment feedback
- `views/` - portal UI templates
- `public/` - styles and client-side JS

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy env template:

   ```bash
   copy .env.example .env
   ```

3. Set MySQL connection in `.env`:

   ```env
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=university_portal
   ```

4. (Optional) Add Gemini key in `.env` for LLM feedback:

   ```env
   GEMINI_API_KEY=your_key_here
   AI_EVALUATION_MODE=auto
   ```
5. Start app:

   ```bash
   npm run dev
   ```

6. Open: `http://localhost:3000`
   
## Demo Credentials

- Faculty: `faculty@uni.edu` / `faculty123`
- Student: `student1@uni.edu` / `student123`
- Admin: `admin@uni.edu` / `admin123`

## Feature Coverage

### 1) University Home Page

- University brand block (logo, name, motto)
- Navbar links: Home, About Us, Dashboard, Faculty Portal, Student Portal
- Upcoming events/news cards with live refresh every 30 seconds
- Footer with contact info and social links
- Mobile-responsive layout

### 2) Attendance Marking System

- Faculty/admin login required
- Select class + date and mark each student Present/Absent
- Attendance saved to DB (`attendance` table)
- Record retrieval by class and date range
- Admin/faculty attendance report with percentage metrics

### 3) Assignment Submission + AI Evaluation

- Student login required
- Select assignment and upload validated file (PDF, DOC/DOCX, PNG/JPG, TXT/MD)
- Evaluation result displayed with overall score + grammar/relevance/originality
- Feedback and score stored in DB (`submissions` table)
- Uses Gemini when key/quota are available; otherwise heuristic analysis

