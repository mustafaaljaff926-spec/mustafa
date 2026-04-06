const state = {
  tasks: [],
  pendingTasks: [],
  members: [],
  users: [],
  editingTaskId: null,
  view: "kanban",
  filter: "all",
  mobileMenuOpen: false,
  role: localStorage.getItem("dashboardRole") || "member",
  userName: localStorage.getItem("dashboardUserName") || "",
  currentMemberId: null,
  search: "",
};

const els = {
  board: document.getElementById("board"),
  listBody: document.getElementById("listBody"),
  listEmpty: document.getElementById("listEmpty"),
  teamListMini: document.getElementById("teamListMini"),
  teamListFull: document.getElementById("teamListFull"),
  assignCheckboxes: document.getElementById("assignCheckboxes"),
  taskModal: document.getElementById("taskModal"),
  taskForm: document.getElementById("taskForm"),
  taskModalTitle: document.getElementById("taskModalTitle"),
  taskTitle: document.getElementById("taskTitle"),
  taskDescription: document.getElementById("taskDescription"),
  taskStatus: document.getElementById("taskStatus"),
  taskPriority: document.getElementById("taskPriority"),
  taskDue: document.getElementById("taskDue"),
  taskFollowUp: document.getElementById("taskFollowUp"),
  taskDeleteBtn: document.getElementById("taskDeleteBtn"),
  taskSubmitBtn: document.getElementById("taskSubmitBtn"),
  btnNewTask: document.getElementById("btnNewTask"),
  btnNewTaskBottom: document.getElementById("btnNewTaskBottom"),
  btnThemeToggle: document.getElementById("btnThemeToggle"),
  btnLogout: document.getElementById("btnLogout"),
  btnLogoutSidebar: document.getElementById("btnLogoutSidebar"),
  searchInput: document.getElementById("searchInput"),
  loginModal: document.getElementById("loginModal"),
  loginForm: document.getElementById("loginForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPassword: document.getElementById("loginPassword"),
  loginSubmitBtn: document.getElementById("loginSubmitBtn"),
  signupToggleBtn: document.getElementById("signupToggleBtn"),
  toastContainer: document.getElementById("toastContainer"),
  addMemberForm: document.getElementById("addMemberForm"),
  newMemberName: document.getElementById("newMemberName"),
  quickAddMember: document.getElementById("quickAddMember"),
  memberModal: document.getElementById("memberModal"),
  memberQuickForm: document.getElementById("memberQuickForm"),
  quickMemberName: document.getElementById("quickMemberName"),
  pageTitle: document.getElementById("pageTitle"),
  pageSub: document.getElementById("pageSub"),
  navApprovals: document.getElementById("navApprovals"),
  badgeListCount: document.getElementById("badgeListCount"),
  badgeHighCount: document.getElementById("badgeHighCount"),
  badgePendingCount: document.getElementById("badgePendingCount"),
  approvalsList: document.getElementById("approvalsList"),
  approvalsEmpty: document.getElementById("approvalsEmpty"),
  views: {
    kanban: document.getElementById("viewKanban"),
    list: document.getElementById("viewList"),
    team: document.getElementById("viewTeam"),
    approvals: document.getElementById("viewApprovals"),
  },
  mobileMenuBtn: document.getElementById("mobileMenuBtn"),
  sidebar: document.getElementById("sidebar"),
  sidebarScrim: document.getElementById("sidebarScrim"),
  mainActions: document.querySelector(".main-actions"),
};

const STATUS_META = { todo: "To do", progress: "In progress", done: "Done" };

const priorityLabel = (priority) => (priority === "high" ? "High" : "Normal");
const isAdmin = () => true;

// Toast notification system
function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  
  // Trigger animation after adding to DOM
  setTimeout(() => {
    // Animation plays automatically from CSS
    setTimeout(() => {
      // After duration, start exit animation
      toast.classList.add("toast--show");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }, 10);
}

// Authentication helpers
async function login(username, password, isSignup = false) {
  try {
    const endpoint = isSignup ? "/api/signup" : "/api/login";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Auth failed");
    localStorage.setItem("authToken", data.token);
    localStorage.setItem("authUser", JSON.stringify(data.user));
    state.userName = data.user.username;
    state.role = data.user.role || "member"; // Use role from server
    els.loginModal.close();
    renderAll();
    showToast(`Welcome, ${username}! You are a ${state.role}`, "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function logout() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("authUser");
  state.userName = "";
  state.role = "member";
  els.loginModal.showModal();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

function filteredTasks() {
  let filtered = state.tasks;
  if (state.filter === "high") filtered = filtered.filter((t) => t.priority === "high");
  if (state.filter === "dueSoon") {
    const now = new Date();
    const in7 = new Date();
    in7.setDate(now.getDate() + 7);
    filtered = filtered.filter((t) => t.due && new Date(t.due) <= in7);
  }
  if (state.search) {
    filtered = filtered.filter((t) => t.title.toLowerCase().includes(state.search.toLowerCase()));
  }
  return filtered;
}

function renderRoleBar() {
  let bar = document.getElementById("roleBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "roleBar";
    bar.style.display = "flex";
    bar.style.gap = "8px";
    bar.style.alignItems = "center";
    bar.style.marginRight = "8px";
    bar.innerHTML = `
      <input id="userNameInput" type="text" placeholder="Your name" style="height:38px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);min-width:120px;" />
    `;
    els.mainActions.prepend(bar);
    bar.querySelector("#userNameInput").addEventListener("change", (e) => {
      state.userName = e.target.value.trim() || "Member";
      localStorage.setItem("dashboardUserName", state.userName);
      syncCurrentMemberId();
      renderAll();
    });
  }
  bar.querySelector("#userNameInput").value = state.userName;
  bar.querySelector("#userNameInput").disabled = true;
}

function renderBoard() {
  const tasks = filteredTasks();
  const columns = ["todo", "progress", "done"];
  els.board.innerHTML = columns
    .map((status) => {
      const inCol = tasks.filter((t) => t.status === status);
      return `
      <article class="column column--${status}" data-status="${status}">
        <header class="column-head"><span>${STATUS_META[status]}</span><span class="count">${inCol.length}</span></header>
        <div class="column-body" data-droppable="${status}">
          ${inCol
            .map(
              (task) => `
              <article class="task-card ${task.priority === "high" ? "task-card--high" : ""}" data-task-id="${task.id}" draggable="true">
                <div class="task-card-header">
                  <h3 class="task-card-title">${task.title}</h3>
                  <button class="status-cycle-btn" data-task-id="${task.id}" data-status="${task.status}" title="Click to advance status">
                    ${STATUS_META[task.status]}
                  </button>
                </div>
                <div class="task-card-meta">
                  <span class="tag">${priorityLabel(task.priority)}</span>
                  ${task.due ? `<span class="tag tag-due">Due ${task.due}</span>` : ""}
                </div>
              </article>`
            )
            .join("")}
        </div>
      </article>`;
    })
    .join("");

  els.board.querySelectorAll(".task-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      // Don't open modal if clicking status button
      if (e.target.closest(".status-cycle-btn")) return;
      openTaskModal(card.dataset.taskId);
    });
  });

  // Status cycle button handlers
  els.board.querySelectorAll(".status-cycle-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const currentStatus = btn.dataset.status;
      const statusCycle = ["todo", "progress", "done"];
      const currentIdx = statusCycle.indexOf(currentStatus);
      const newStatus = statusCycle[(currentIdx + 1) % statusCycle.length];
      
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;
      
      task.status = newStatus;
      btn.dataset.status = newStatus;
      btn.textContent = STATUS_META[newStatus];
      
      // Update server
      await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
      renderAll();
      showToast(`Task moved to ${STATUS_META[newStatus]}`, "success");
    });
  });

  // Initialize Sortable.js for drag-and-drop between columns
  els.board.querySelectorAll("[data-droppable]").forEach((zone) => {
    Sortable.create(zone, {
      group: "tasks",
      animation: 200,
      ghostClass: "sortable-ghost",
      dragClass: "sortable-drag",
      forceFallback: false,
      onEnd: async (evt) => {
        const taskId = evt.item.dataset.taskId;
        const newStatus = evt.to.dataset.droppable;
        const task = state.tasks.find((t) => t.id === taskId);
        
        if (task && task.status !== newStatus) {
          task.status = newStatus;
          await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
          renderAll();
          showToast(`Task moved to ${STATUS_META[newStatus]}!`, "success");
        }
      }
    });
  });
}

function renderList() {
  const tasks = filteredTasks();
  els.listBody.innerHTML = tasks
    .map(
      (task) => `
      <tr data-task-id="${task.id}">
        <td><strong>${task.title}</strong></td>
        <td>${STATUS_META[task.status]}</td>
        <td>${priorityLabel(task.priority)}</td>
        <td>${task.due || "—"}</td>
        <td>${task.followUp || "—"}</td>
        <td>${task.assignees.length || 0}</td>
        <td>${STATUS_META[task.status]}</td>
      </tr>`
    )
    .join("");
  els.listEmpty.hidden = tasks.length !== 0;
  els.listBody.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => openTaskModal(row.dataset.taskId));
  });
}

function renderMembers() {
  // Mini member list (in sidebar)
  els.teamListMini.innerHTML = state.members
    .map((m) => `<li><span class="avatar">${m.name.slice(0, 1).toUpperCase()}</span><span class="name">${m.name}</span><span class="dot ${m.role === 'admin' ? 'dot--admin' : ''}"></span></li>`)
    .join("");

  // Full user list (Team section)
  els.teamListFull.innerHTML = state.users.length === 0 
    ? `<p style="padding:16px;text-align:center;color:var(--text-muted);">No team members yet</p>`
    : state.users
      .map(
        (user) => `
        <li class="team-user-item">
          <span class="avatar">${user.username.slice(0, 1).toUpperCase()}</span>
          <div class="team-user-info">
            <strong>${user.username}</strong>
            <span style="display:block;font-size:12px;color:var(--text-muted);margin-top:4px;">${user.role}</span>
          </div>
          ${isAdmin() ? `
          <select class="team-role-select" data-user-id="${user.id}" data-username="${user.username}" style="min-width:120px;">
            <option value="member" ${user.role === 'member' ? 'selected' : ''}>Member</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
          ` : ''}
        </li>`
      )
      .join("");

  // Add role change handlers (admin only)
  if (isAdmin()) {
    els.teamListFull.querySelectorAll(".team-role-select").forEach((sel) => {
      sel.addEventListener("change", async (e) => {
        const userId = sel.dataset.userId;
        const username = sel.dataset.username;
        const newRole = sel.value;
        
        try {
          await api(`/api/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role: newRole }) });
          await refreshState();
          showToast(`${username} is now a ${newRole}!`, "success");
        } catch (err) {
          showToast(err.message || "Could not update role", "error");
          await refreshState();
        }
      });
    });
  }

  // Task assignment checkboxes (from old members for backward compatibility)
  els.assignCheckboxes.innerHTML = state.members
    .map((m) => `<label><input type="checkbox" value="${m.id}" /><span>${m.name}</span></label>`)
    .join("");
}
}

function renderApprovals() {
  els.approvalsList.innerHTML = state.pendingTasks
    .map(
      (p) => `
      <article class="approval-card">
        <h3>${p.title}</h3>
        <div class="approval-meta">Requested by <strong>${p.requester || "Member"}</strong></div>
        <p class="approval-desc">${p.description || "No description."}</p>
        <div class="approval-actions">
          <button class="btn-approve" data-approve-id="${p.id}">Approve</button>
          <button class="btn-reject" data-reject-id="${p.id}">Reject</button>
        </div>
      </article>`
    )
    .join("");
  els.approvalsEmpty.hidden = state.pendingTasks.length > 0;

  els.approvalsList.querySelectorAll("[data-approve-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/tasks/approve/${btn.dataset.approveId}`, { method: "POST" });
        showToast("Task approved and added to board!", "success");
        await refreshState();
      } catch (err) {
        showToast("Could not approve task", "error");
      }
    });
  });
  els.approvalsList.querySelectorAll("[data-reject-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/tasks/reject/${btn.dataset.rejectId}`, { method: "DELETE" });
        showToast("Task request rejected", "info");
        await refreshState();
      } catch (err) {
        showToast("Could not reject task", "error");
      }
    });
  });
}

function renderHeader() {
  const copy = {
    kanban: ["Kanban", "Shared board across your team."],
    list: ["List", "Browse tasks in a compact table view."],
    team: ["Team", "Add people and assign them to tasks."],
    approvals: ["Task approval", "Review submitted task requests from members."],
  };
  const [title, sub] = copy[state.view];
  els.pageTitle.textContent = title;
  els.pageSub.textContent = sub;
}

function renderViews() {
  Object.entries(els.views).forEach(([k, viewEl]) => {
    viewEl.hidden = k !== state.view;
  });
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.setAttribute("data-active", String(btn.dataset.view === state.view));
  });
}

function renderFilters() {
  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.setAttribute("data-active", String(btn.dataset.filter === state.filter));
  });
}

function renderBadges() {
  const visibleTasks = filteredTasks();
  els.badgeListCount.textContent = String(visibleTasks.length);
  els.badgeHighCount.textContent = String(visibleTasks.filter((t) => t.priority === "high").length);
  els.badgePendingCount.textContent = String(state.pendingTasks.length);
}

function renderAll() {
  renderRoleBar();
  renderBoard();
  renderList();
  renderMembers();
  renderApprovals();
  renderHeader();
  renderViews();
  renderFilters();
  renderBadges();
  els.taskSubmitBtn.textContent = "Save";
}

function openTaskModal(taskId = null) {
  state.editingTaskId = taskId;
  const task = taskId ? state.tasks.find((t) => t.id === taskId) : null;
  els.taskModalTitle.textContent = task ? "Edit task" : "New task";
  els.taskDeleteBtn.hidden = !task || !isAdmin();
  els.taskTitle.value = task?.title || "";
  els.taskDescription.value = task?.description || "";
  els.taskStatus.value = task?.status || "todo";
  els.taskPriority.value = task?.priority || "normal";
  els.taskDue.value = task?.due || "";
  els.taskFollowUp.value = task?.followUp || "";
  els.assignCheckboxes.querySelectorAll("input[type='checkbox']").forEach((box) => {
    box.checked = Boolean(task?.assignees.includes(box.value));
  });
  els.taskModal.showModal();
}

function closeTaskModal() {
  els.taskModal.close();
  state.editingTaskId = null;
}

function syncCurrentMemberId() {
  const normalized = state.userName.trim().toLowerCase();
  const match = state.members.find((m) => m.name.trim().toLowerCase() === normalized);
  state.currentMemberId = match?.id || null;
}

async function refreshState() {
  const payload = await api("/api/state");
  state.tasks = payload.tasks || [];
  state.members = payload.members || [];
  state.pendingTasks = payload.pendingTasks || [];
  
  // Fetch users for team display
  try {
    const usersPayload = await api("/api/users");
    state.users = usersPayload.users || [];
  } catch (err) {
    state.users = [];
  }
  
  syncCurrentMemberId();
  renderAll();
}

function initEvents() {
  // Check for existing auth token
  const authToken = localStorage.getItem("authToken");
  const authUser = localStorage.getItem("authUser");
  
  if (authToken && authUser) {
    const user = JSON.parse(authUser);
    state.userName = user.username;
    state.role = user.role || "member"; // Use role from stored user data
  } else {
    // Show login modal if not authenticated
    state.userName = "";
    state.role = "member";
    els.loginModal.showModal();
  }
  
  // Login form submission
  if (els.loginForm) {
    els.loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = els.loginUsername.value.trim();
      const password = els.loginPassword.value.trim();
      const isSignup = els.loginSubmitBtn.textContent === "Sign up";
      
      if (!username || !password) {
        showToast("Username and password required", "error");
        return;
      }
      
      await login(username, password, isSignup);
    });
  }
  
  // Toggle between login and signup
  if (els.signupToggleBtn) {
    els.signupToggleBtn.addEventListener("click", () => {
      const isSignup = els.loginSubmitBtn.textContent === "Log in";
      els.loginSubmitBtn.textContent = isSignup ? "Sign up" : "Log in";
      els.signupToggleBtn.textContent = isSignup ? "Already have account? Log in" : "Don't have account? Sign up";
    });
  }
  
  // Logout handler (if logout button exists)
  const logoutBtn = document.querySelector("[data-logout]");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  // Keep current role, don't override with "admin"
  localStorage.setItem("dashboardUserName", state.userName);
  localStorage.setItem("dashboardRole", state.role);

  els.btnNewTask.addEventListener("click", () => openTaskModal());
  els.btnNewTaskBottom.addEventListener("click", () => openTaskModal());
  els.taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const assignees = [...els.assignCheckboxes.querySelectorAll("input:checked")].map((n) => n.value);
    const payload = {
      title: els.taskTitle.value.trim(),
      description: els.taskDescription.value.trim(),
      status: els.taskStatus.value,
      priority: els.taskPriority.value,
      due: els.taskDue.value,
      followUp: els.taskFollowUp.value,
      assignees,
    };
    if (!payload.title) return;

    try {
      if (state.editingTaskId) {
        await api(`/api/tasks/${state.editingTaskId}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Task updated successfully!", "success");
      } else {
        await api("/api/tasks", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("Task created!", "success");
      }
      closeTaskModal();
      await refreshState();
    } catch (err) {
      showToast(err.message || "Could not save task.", "error");
    }
  });

  els.taskDeleteBtn.addEventListener("click", async () => {
    if (!state.editingTaskId || !isAdmin()) return;
    try {
      await api(`/api/tasks/${state.editingTaskId}`, { method: "DELETE" });
      showToast("Task deleted!", "success");
      closeTaskModal();
      await refreshState();
    } catch (err) {
      showToast("Could not delete task", "error");
    }
  });

  document.querySelectorAll("[data-close-modal]").forEach((btn) => btn.addEventListener("click", closeTaskModal));
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      renderAll();
    });
  });
  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      renderAll();
    });
  });

  els.addMemberForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = els.newMemberName.value.trim();
    if (!name) return;
    try {
      await api("/api/members", { method: "POST", body: JSON.stringify({ name }) });
      showToast(`Added ${name} to team!`, "success");
    } catch (err) {
      showToast(err.message || "Could not add member.", "error");
      return;
    }
    els.newMemberName.value = "";
    await refreshState();
  });

  els.quickAddMember.addEventListener("click", () => {
    els.memberModal.showModal();
    els.quickMemberName.value = "";
    els.quickMemberName.focus();
  });
  els.memberQuickForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = els.quickMemberName.value.trim();
    if (!name) return;
    try {
      await api("/api/members", { method: "POST", body: JSON.stringify({ name }) });
      showToast(`Added ${name} to team!`, "success");
      els.memberModal.close();
      await refreshState();
    } catch (err) {
      showToast(err.message || "Could not add member.", "error");
    }
  });
  document.querySelectorAll("[data-close-member]").forEach((btn) => {
    btn.addEventListener("click", () => els.memberModal.close());
  });

  els.btnThemeToggle.addEventListener("click", () => {
    const html = document.documentElement;
    html.dataset.theme = html.dataset.theme === "light" ? "dark" : "light";
  });

  els.btnLogout.addEventListener("click", () => {
    logout();
  });

  els.btnLogoutSidebar.addEventListener("click", () => {
    logout();
  });

  els.searchInput.addEventListener("input", (e) => {
    state.search = e.target.value.trim();
    renderAll();
  });

  els.mobileMenuBtn.addEventListener("click", () => {
    state.mobileMenuOpen = !state.mobileMenuOpen;
    els.sidebar.classList.toggle("is-open", state.mobileMenuOpen);
    els.sidebarScrim.hidden = !state.mobileMenuOpen;
  });
  els.sidebarScrim.addEventListener("click", () => {
    state.mobileMenuOpen = false;
    els.sidebar.classList.remove("is-open");
    els.sidebarScrim.hidden = true;
  });

  setInterval(refreshState, 5000);
}

initEvents();
await refreshState();
