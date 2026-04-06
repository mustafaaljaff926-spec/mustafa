# Task Management Dashboard

A professional task management app with Kanban boards, team collaboration, and role-based permissions.

## Features
- **Kanban View**: Drag tasks between columns (To do, In progress, Done).
- **List View**: Table view of tasks.
- **Team Management**: Add members, assign roles (Admin/Member).
- **Permissions**: Admins can create/edit tasks; Members submit requests for approval.
- **Search**: Filter tasks by title.
- **Themes**: Dark/Light mode toggle.
- **Mobile Responsive**: Works on phones and tablets.

## Local Setup
1. Install Node.js (v18+).
2. Clone the repo: `git clone https://github.com/mustafaaljaff926-spec/mustafa.git`
3. Run `npm install`
4. Start: `npm start`
5. Open `http://localhost:3000`

## Online Deployment (Free)
Deploy to Render.com for free hosting:

1. Sign up at [render.com](https://render.com).
2. Click "New" → "Web Service".
3. Connect your GitHub repo: `https://github.com/mustafaaljaff926-spec/mustafa`
4. Configure:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Add `NODE_ENV=production`
5. (Optional) Add PostgreSQL database for persistence.
6. Deploy! Get a live URL like `https://your-app.onrender.com`.

## Usage
- Log in as "owner" (admin).
- Add team members in Team view.
- Create tasks, assign, and change status via dropdown.
- Use search to find tasks.

## Tech Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: JSON file or PostgreSQL