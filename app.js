const state = {
  tasks: [],
  pendingTasks: [],
  members: [],
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
  searchInput: document.getElementById("searchInput"),
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
const isAdmin = () => state.role === "admin";

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
  const visibleTasks = isAdmin()
    ? state.tasks
    : state.tasks.filter((t) => state.currentMemberId && t.assignees.includes(state.currentMemberId));
  let filtered = visibleTasks;
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
      <select id="roleSelect" style="height:38px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);">
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>
    `;
    els.mainActions.prepend(bar);
    bar.querySelector("#roleSelect").addEventListener("change", (e) => {
      state.role = e.target.value;
      localStorage.setItem("dashboardRole", state.role);
      if (state.role !== "admin" && state.view === "approvals") state.view = "kanban";
      renderAll();
    });
    bar.querySelector("#userNameInput").addEventListener("change", (e) => {
      state.userName = e.target.value.trim() || "Member";
      localStorage.setItem("dashboardUserName", state.userName);
      syncCurrentMemberId();
      renderAll();
    });
  }
  const roleSelect = bar.querySelector("#roleSelect");
  if (state.userName === "owner") {
    state.role = "admin";
    localStorage.setItem("dashboardRole", "admin");
    roleSelect.value = "admin";
    roleSelect.disabled = true;
    roleSelect.title = "Owner is always admin";
  } else {
    roleSelect.disabled = false;
    roleSelect.title = "";
    roleSelect.value = state.role;
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
      <article class="column column--${status}">
        <header class="column-head"><span>${STATUS_META[status]}</span><span class="count">${inCol.length}</span></header>
        <div class="column-body">
          ${inCol
            .map(
              (task) => `
              <article class="task-card ${task.priority === "high" ? "task-card--high" : ""}" data-task-id="${task.id}">
                <h3 class="task-card-title">${task.title}</h3>
                <div class="task-card-meta">
                  <span class="tag">${STATUS_META[task.status]}</span>
                  <span class="tag">${priorityLabel(task.priority)}</span>
                  ${task.due ? `<span class="tag tag-due">Due ${task.due}</span>` : ""}
                  <button class="status-btn" data-task-id="${task.id}" title="Change status">▶</button>
                </div>
              </article>`
            )
            .join("")}
        </div>
      </article>`;
    })
    .join("");

  els.board.querySelectorAll(".task-card").forEach((card) => {
    card.addEventListener("click", () => openTaskModal(card.dataset.taskId));
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
  els.addMemberForm.hidden = !isAdmin();
  els.quickAddMember.hidden = !isAdmin();
  els.teamListMini.innerHTML = state.members
    .map((m) => `<li><span class="avatar">${m.name.slice(0, 1).toUpperCase()}</span><span class="name">${m.name}</span><span class="dot ${m.role === 'admin' ? 'dot--admin' : ''}"></span></li>`)
    .join("");

  els.teamListFull.innerHTML = state.members
    .map(
      (m) => `
      <li>
        <span class="avatar">${m.name.slice(0, 1).toUpperCase()}</span>
        <span class="info"><strong>${m.name}</strong></span>
        ${isAdmin()
          ? `<select class="member-role-select" data-member-id="${m.id}">
              <option value="member" ${m.role === 'member' ? 'selected' : ''}>Member</option>
              <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>`
          : `<span class="role-label">${m.role || 'member'}</span>`}
        <button class="remove" type="button" data-member-id="${m.id}" ${!isAdmin() ? "hidden" : ""}>Remove</button>
      </li>`
    )
    .join("");

  els.assignCheckboxes.innerHTML = state.members
    .map((m) => `<label><input type="checkbox" value="${m.id}" /><span>${m.name}</span></label>`)
    .join("");

  els.teamListFull.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!isAdmin()) return;
      await api(`/api/members/${btn.dataset.memberId}`, { method: "DELETE" });
      await refreshState();
    });
  });

  // Role change handlers (admin only)
  els.teamListFull.querySelectorAll(".member-role-select").forEach((sel) => {
    sel.addEventListener("change", async (e) => {
      const memberId = sel.dataset.memberId;
      const newRole = sel.value;
      try {
        await api(`/api/members/${memberId}/role`, { method: "PATCH", body: JSON.stringify({ role: newRole }) });
        await refreshState();
      } catch (err) {
        alert(err.message || "Could not update role");
        await refreshState();
      }
    });
  });
}

function renderApprovals() {
  if (!isAdmin()) {
    els.approvalsList.innerHTML = "";
    els.approvalsEmpty.hidden = false;
    return;
  }
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
      await api(`/api/tasks/approve/${btn.dataset.approveId}`, { method: "POST" });
      await refreshState();
    });
  });
  els.approvalsList.querySelectorAll("[data-reject-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/tasks/reject/${btn.dataset.rejectId}`, { method: "DELETE" });
      await refreshState();
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
  if (!isAdmin() && state.view === "approvals") state.view = "kanban";
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
  els.navApprovals.hidden = !isAdmin();
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
  els.taskSubmitBtn.textContent = isAdmin() ? "Save" : "Send request";
}

function openTaskModal(taskId = null) {
  if (!isAdmin() && taskId) return;
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
  syncCurrentMemberId();
  renderAll();
}

function initEvents() {
  state.userName = "owner";
  state.role = "admin";
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
      if (state.editingTaskId && isAdmin()) {
        await api(`/api/tasks/${state.editingTaskId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else if (isAdmin()) {
        await api("/api/tasks", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/tasks/request", {
          method: "POST",
          body: JSON.stringify({ ...payload, requester: state.userName || "Member" }),
        });
        alert("Task request sent to admin for approval.");
      }
      closeTaskModal();
      await refreshState();
    } catch (err) {
      alert(err.message || "Could not save task.");
    }
  });

  els.taskDeleteBtn.addEventListener("click", async () => {
    if (!state.editingTaskId || !isAdmin()) return;
    await api(`/api/tasks/${state.editingTaskId}`, { method: "DELETE" });
    closeTaskModal();
    await refreshState();
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
    if (!isAdmin()) return;
    e.preventDefault();
    const name = els.newMemberName.value.trim();
    if (!name) return;
    try {
      await api("/api/members", { method: "POST", body: JSON.stringify({ name }) });
    } catch (err) {
      alert(err.message || "Could not add member.");
      return;
    }
    els.newMemberName.value = "";
    await refreshState();
  });

  els.quickAddMember.addEventListener("click", () => {
    if (!isAdmin()) return;
    els.memberModal.showModal();
    els.quickMemberName.value = "";
    els.quickMemberName.focus();
  });
  els.memberQuickForm.addEventListener("submit", async (e) => {
    if (!isAdmin()) return;
    e.preventDefault();
    const name = els.quickMemberName.value.trim();
    if (!name) return;
    try {
      await api("/api/members", { method: "POST", body: JSON.stringify({ name }) });
      els.memberModal.close();
      await refreshState();
    } catch (err) {
      alert(err.message || "Could not add member.");
    }
  });
  document.querySelectorAll("[data-close-member]").forEach((btn) => {
    btn.addEventListener("click", () => els.memberModal.close());
  });

  // Status change button
  document.addEventListener("click", (e) => {
    if (e.target.matches(".status-btn")) {
      const taskId = e.target.dataset.taskId;
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task || !isAdmin()) return;
      const statuses = ["todo", "progress", "done"];
      const currentIndex = statuses.indexOf(task.status);
      const nextIndex = (currentIndex + 1) % statuses.length;
      task.status = statuses[nextIndex];
      // Update server
      api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: task.status }) });
      renderAll();
    }
  });

  els.btnThemeToggle.addEventListener("click", () => {
    const html = document.documentElement;
    html.dataset.theme = html.dataset.theme === "light" ? "dark" : "light";
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
