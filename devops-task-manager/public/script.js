const elements = {
  authScreen: document.querySelector('#auth-screen'),
  appShell: document.querySelector('#app-shell'),
  authTitle: document.querySelector('#auth-title'),
  authDescription: document.querySelector('#auth-description'),
  authMessage: document.querySelector('#auth-message'),
  loginTab: document.querySelector('#login-tab'),
  registerTab: document.querySelector('#register-tab'),
  loginForm: document.querySelector('#login-form'),
  registerForm: document.querySelector('#register-form'),
  form: document.querySelector('#task-form'),
  input: document.querySelector('#task-input'),
  list: document.querySelector('#task-list'),
  loading: document.querySelector('#loading-state'),
  empty: document.querySelector('#empty-state'),
  emptyTitle: document.querySelector('#empty-title'),
  emptyCopy: document.querySelector('#empty-copy'),
  emptyAction: document.querySelector('#empty-action'),
  search: document.querySelector('#search-input'),
  clearSearch: document.querySelector('#clear-search'),
  sort: document.querySelector('#sort-select'),
  reset: document.querySelector('#reset-filters'),
  visibleCount: document.querySelector('#visible-count'),
  toastRegion: document.querySelector('#toast-region'),
  serviceStatus: document.querySelector('#service-status'),
  serviceStatusButton: document.querySelector('#service-status-button'),
  refresh: document.querySelector('#refresh-button'),
  priorityFilters: document.querySelector('#priority-filters'),
  tagFilters: document.querySelector('#tag-filters'),
  priorityInput: document.querySelector('#task-priority'),
  tagPicker: document.querySelector('.tag-picker'),
  exportFormat: document.querySelector('#export-format'),
  exportButton: document.querySelector('#export-button'),
  nav: [...document.querySelectorAll('[data-view]')],
  filters: [...document.querySelectorAll('[data-filter]')],
  sidebar: document.querySelector('#sidebar'),
  menuToggle: document.querySelector('#menu-toggle'),
  scrim: document.querySelector('#mobile-scrim'),
  settingsOpen: document.querySelector('#settings-open'),
  settingsDialog: document.querySelector('#settings-dialog'),
  themeToggle: document.querySelector('#theme-toggle'),
  profileOpen: document.querySelector('#profile-open'),
  profileForm: document.querySelector('#profile-form'),
  profileNameInput: document.querySelector('#profile-name-input'),
  profileEmailInput: document.querySelector('#profile-email-input'),
  logout: document.querySelector('#logout-button')
};

const state = {
  user: null,
  authBusy: false,
  tasks: [],
  filter: 'all',
  view: 'dashboard',
  search: '',
  sort: 'newest',
  priority: 'all',
  tag: 'all',
  apiLatency: null,
  loading: true,
  busy: false
};

const priorities = ['low', 'medium', 'high', 'blocker'];
const taskTags = ['prod', 'staging', 'ci/cd', 'infra', 'docker', 'db'];
const taskStatuses = [
  ['todo', 'Todo'],
  ['in_progress', 'In Progress'],
  ['review', 'Review'],
  ['done', 'Done']
];
let toastTimer;

function friendlyError(error) {
  if (error instanceof TypeError) {
    return 'The server could not be reached. Check that the app is running, then try again.';
  }
  return error.message || 'Something went wrong. Please try again.';
}

async function apiRequest(url, options) {
  let response;
  try {
    response = await fetch(url, { credentials: 'same-origin', ...options });
  } catch (error) {
    throw new TypeError('Network request failed.', { cause: error });
  }

  if (!response.ok) {
    let result = {};
    try {
      result = await response.json();
    } catch {
      // Use the status-based message when the server did not return JSON.
    }
    const error = new Error(result.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function setAuthMode(mode) {
  const registering = mode === 'register';
  elements.loginForm.hidden = registering;
  elements.registerForm.hidden = !registering;
  elements.loginTab.classList.toggle('is-active', !registering);
  elements.registerTab.classList.toggle('is-active', registering);
  elements.loginTab.setAttribute('aria-selected', String(!registering));
  elements.registerTab.setAttribute('aria-selected', String(registering));
  elements.authTitle.textContent = registering ? 'Create your account' : 'Welcome back';
  elements.authDescription.textContent = registering
    ? 'Your own space to make things happen.'
    : 'Sign in to your personal workspace.';
  elements.authMessage.textContent = '';
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function setAuthenticatedUser(user) {
  state.user = user;
  elements.authScreen.hidden = Boolean(user);
  elements.appShell.hidden = !user;
  if (!user) {
    state.tasks = [];
    renderTasks();
    setAuthMode('login');
    document.querySelector('#login-email').focus();
    return;
  }

  const userInitials = initials(user.name);
  document.querySelector('#profile-name').textContent = user.name;
  document.querySelector('#profile-email').textContent = user.email;
  document.querySelector('#top-avatar').textContent = userInitials;
  document.querySelector('#top-avatar').setAttribute('aria-label', `Signed in as ${user.name}`);
  document.querySelector('.avatar').textContent = userInitials;
  document.querySelector('#greeting-name').textContent = user.name.split(/\s+/)[0];
  elements.profileNameInput.value = user.name;
  elements.profileEmailInput.value = user.email;
}

function showAuthError(error) {
  elements.authMessage.textContent = friendlyError(error);
}

async function submitAuthForm(form, endpoint, mode) {
  if (state.authBusy || !form.reportValidity()) return;
  state.authBusy = true;
  const button = form.querySelector('button[type="submit"]');
  const buttonLabel = button.querySelector('span');
  const originalLabel = buttonLabel.textContent;
  button.disabled = true;
  buttonLabel.textContent = mode === 'register' ? 'Creating your account…' : 'Signing you in…';
  elements.authMessage.textContent = '';

  try {
    const body = Object.fromEntries(new FormData(form));
    const result = await apiRequest(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    setAuthenticatedUser(result.user);
    state.loading = true;
    renderTasks();
    if (await loadTasks()) showToast(mode === 'register' ? 'Your account is ready. Welcome!' : 'Welcome back!');
  } catch (error) {
    showAuthError(error);
  } finally {
    state.authBusy = false;
    button.disabled = false;
    buttonLabel.textContent = originalLabel;
  }
}

function showToast(text, type = 'success') {
  clearTimeout(toastTimer);
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = type === 'error' ? '!' : '✓';
  const content = document.createElement('span');
  content.textContent = text;
  toast.append(icon, content);
  elements.toastRegion.replaceChildren(toast);
  toastTimer = setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

function setBusy(busy) {
  state.busy = busy;
  elements.form.querySelector('button[type="submit"]').disabled = busy;
  elements.input.disabled = busy;
  elements.priorityInput.disabled = busy;
  elements.tagPicker.querySelectorAll('input').forEach((input) => {
    input.disabled = busy;
  });
  elements.list.setAttribute('aria-busy', String(busy || state.loading));
  elements.list.querySelectorAll('button, input, select').forEach((control) => {
    control.disabled = busy;
  });
  elements.refresh.disabled = busy || state.loading;
  elements.refresh.classList.toggle('is-spinning', busy);
}

function updateStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter(isTaskDone).length;
  const pending = total - completed;
  const rate = total ? Math.round((completed / total) * 100) : 0;

  document.querySelector('#total-stat').textContent = total;
  document.querySelector('#pending-stat').textContent = pending;
  document.querySelector('#completed-stat').textContent = completed;
  document.querySelector('#rate-stat').textContent = rate;
  document.querySelector('#all-count').textContent = total;
  document.querySelector('#pending-count').textContent = pending;
  const progress = document.querySelector('#progress-track');
  progress.setAttribute('aria-valuenow', String(rate));
  document.querySelector('#progress-bar').style.width = `${rate}%`;
}

function isTaskDone(task) {
  return task.status ? task.status === 'done' : task.completed;
}

function getVisibleTasks() {
  const search = state.search.trim().toLocaleLowerCase();
  const filtered = state.tasks.filter((task) => {
    const matchesStatus = state.filter === 'all'
      || (state.filter === 'completed' ? isTaskDone(task) : !isTaskDone(task));
    const matchesPriority = state.priority === 'all' || task.priority === state.priority;
    const matchesTag = state.tag === 'all' || task.tags?.includes(state.tag);
    return matchesStatus && matchesPriority && matchesTag
      && task.title.toLocaleLowerCase().includes(search);
  });

  if (state.sort === 'alphabetical') {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    filtered.sort((a, b) => {
      const difference = (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0);
      return state.sort === 'newest' ? -difference : difference;
    });
  }
  return filtered;
}

function createTaskElement(task) {
  const statusValue = task.status || (task.completed ? 'done' : 'todo');
  const done = statusValue === 'done';
  const item = document.createElement('li');
  item.className = `task-item${done ? ' is-complete' : ''}`;

  const checkbox = document.createElement('input');
  checkbox.className = 'task-checkbox';
  checkbox.type = 'checkbox';
  checkbox.checked = done;
  checkbox.dataset.action = 'toggle';
  checkbox.dataset.id = task.id;
  checkbox.setAttribute('aria-label', `Mark ${task.title} ${done ? 'pending' : 'done'}`);

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;

  const label = document.createElement('label');
  label.className = 'task-main';
  label.append(checkbox, title);

  const status = document.createElement('select');
  status.className = `task-status-select status-${statusValue}`;
  status.dataset.action = 'status';
  status.dataset.id = task.id;
  status.setAttribute('aria-label', `Status for ${task.title}`);
  taskStatuses.forEach(([value, labelText]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labelText;
    option.selected = statusValue === value;
    status.append(option);
  });

  const metadata = document.createElement('span');
  metadata.className = 'task-metadata';
  const priority = document.createElement('span');
  priority.className = `priority-badge priority-${task.priority || 'medium'}`;
  priority.textContent = task.priority || 'medium';
  metadata.append(priority);
  (task.tags || []).forEach((tag) => {
    const badge = document.createElement('span');
    badge.className = 'task-tag';
    badge.textContent = tag;
    metadata.append(badge);
  });

  const date = document.createElement('time');
  date.className = 'task-date';
  const createdAt = Date.parse(task.createdAt);
  if (Number.isFinite(createdAt)) {
    date.dateTime = task.createdAt;
    date.textContent = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(createdAt);
  } else {
    date.textContent = '—';
  }
  date.setAttribute('aria-label', Number.isFinite(createdAt) ? `Created ${date.textContent}` : 'Creation date unavailable');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'delete-button';
  remove.dataset.action = 'delete';
  remove.dataset.id = task.id;
  remove.setAttribute('aria-label', `Delete ${task.title}`);
  remove.title = 'Delete task';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  iconPath.setAttribute('d', 'M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3');
  icon.append(iconPath);
  remove.append(icon);

  item.append(label, metadata, status, date, remove);
  return item;
}

function renderMetadataFilters() {
  const priorityFragment = document.createDocumentFragment();
  const tagFragment = document.createDocumentFragment();
  [['all', 'Priority'], ...priorities.map((priority) => [priority, priority])].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `metadata-chip${state.priority === value ? ' is-selected' : ''}`;
    button.dataset.priorityFilter = value;
    button.setAttribute('aria-pressed', String(state.priority === value));
    button.textContent = label;
    priorityFragment.append(button);
  });
  [['all', 'Tags'], ...taskTags.map((tag) => [tag, tag])].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `metadata-chip${state.tag === value ? ' is-selected' : ''}`;
    button.dataset.tagFilter = value;
    button.setAttribute('aria-pressed', String(state.tag === value));
    button.textContent = label;
    tagFragment.append(button);
  });
  elements.priorityFilters.replaceChildren(priorityFragment);
  elements.tagFilters.replaceChildren(tagFragment);
}

function renderTasks() {
  const tasks = getVisibleTasks();
  const fragment = document.createDocumentFragment();
  tasks.forEach((task) => fragment.append(createTaskElement(task)));
  elements.list.replaceChildren(fragment);
  elements.visibleCount.textContent = tasks.length;
  elements.loading.hidden = !state.loading;
  elements.list.hidden = state.loading || tasks.length === 0;
  elements.empty.hidden = state.loading || tasks.length > 0;
  elements.list.setAttribute('aria-busy', String(state.loading || state.busy));

  if (state.tasks.length === 0) {
    elements.emptyTitle.textContent = 'A fresh page.';
    elements.emptyCopy.textContent = 'Add a task above and make today count.';
    elements.emptyAction.hidden = false;
  } else if (tasks.length === 0) {
    elements.emptyTitle.textContent = state.search ? 'No matches just yet.' : 'Nothing in this view.';
    elements.emptyCopy.textContent = state.search
      ? 'Try another search or clear your filters to find a task.'
      : 'There are no tasks here. Choose another view or add a new one.';
    elements.emptyAction.hidden = false;
    elements.emptyAction.textContent = state.search ? 'Clear search and filters →' : 'Add a task →';
  }

  elements.filters.forEach((button) => {
    const selected = button.dataset.filter === state.filter;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  elements.clearSearch.hidden = state.search.length === 0;
  elements.search.value = state.search;
  renderMetadataFilters();
  elements.exportButton.disabled = tasks.length === 0;
  updateStats();
}

async function loadTasks({ announce = false } = {}) {
  state.loading = state.tasks.length === 0;
  elements.loading.hidden = !state.loading;
  elements.refresh.disabled = true;
  elements.refresh.classList.add('is-spinning');
  try {
    const [tasks, healthResult] = await Promise.all([
      apiRequest('/api/tasks'),
      (async () => {
        const started = performance.now();
        const health = await apiRequest('/api/health');
        return { health, latency: Math.round(performance.now() - started) };
      })()
    ]);
    const { health, latency } = healthResult;
    if (!Array.isArray(tasks)) throw new Error('The server returned an invalid task list.');
    if (health.status !== 'ok') throw new Error('The server health check did not pass.');
    state.tasks = tasks;
    state.loading = false;
    state.apiLatency = latency;
    elements.serviceStatus.textContent = 'Online';
    elements.serviceStatusButton.title = `API and database healthy · ${latency} ms response`;
    elements.serviceStatusButton.setAttribute('aria-label', `System status: online, API response ${latency} milliseconds`);
    renderTasks();
    if (announce) showToast('Tasks refreshed.');
    return true;
  } catch (error) {
    if (error.status === 401) {
      setAuthenticatedUser(null);
      showAuthError(error);
      return false;
    }
    state.loading = false;
    elements.serviceStatus.textContent = 'Offline';
    elements.serviceStatusButton.title = friendlyError(error);
    elements.serviceStatusButton.setAttribute('aria-label', 'System status: unavailable');
    renderTasks();
    showToast(friendlyError(error), 'error');
    return false;
  } finally {
    elements.refresh.disabled = state.busy;
    elements.refresh.classList.remove('is-spinning');
  }
}

function setView(view) {
  state.view = view;
  state.filter = view === 'pending' || view === 'completed' ? view : 'all';
  elements.nav.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const labels = { dashboard: 'Dashboard', all: 'All tasks', pending: 'Pending', completed: 'Completed' };
  document.querySelector('#breadcrumb-current').textContent = labels[view] || 'Dashboard';
  closeMobileNav();
  renderTasks();
}

function closeMobileNav() {
  elements.sidebar.classList.remove('is-open');
  elements.menuToggle.setAttribute('aria-expanded', 'false');
  elements.menuToggle.setAttribute('aria-label', 'Open navigation');
  elements.scrim.hidden = true;
}

function setTheme(light) {
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  elements.themeToggle.checked = light;
  document.querySelector('meta[name="theme-color"]').content = light ? '#f3f5fb' : '#0b1020';
}

function exportVisibleTasks() {
  const tasks = getVisibleTasks();
  if (tasks.length === 0) {
    showToast('There are no visible tasks to export.', 'error');
    return;
  }

  const markdown = elements.exportFormat.value === 'markdown';
  const content = markdown
    ? [
      '# Taskflow tasks',
      '',
      ...tasks.map((task) => {
        const status = task.status || (task.completed ? 'done' : 'todo');
        const tags = (task.tags || []).map((tag) => `\`${tag}\``).join(' ');
        const metadata = [`${status.replace('_', ' ')}`, task.priority || 'medium', tags]
          .filter(Boolean)
          .join(' · ');
        return `- [${isTaskDone(task) ? 'x' : ' '}] ${task.title} — ${metadata}`;
      }),
      ''
    ].join('\n')
    : JSON.stringify(tasks, null, 2);
  const mimeType = markdown ? 'text/markdown' : 'application/json';
  const extension = markdown ? 'md' : 'json';
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  link.href = url;
  link.download = `taskflow-tasks-${new Date().toISOString().slice(0, 10)}.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`${tasks.length} visible ${tasks.length === 1 ? 'task' : 'tasks'} exported.`);
}

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.busy) return;
  const title = elements.input.value.trim();
  if (!title) {
    elements.input.setCustomValidity('Enter a task before adding it.');
    elements.input.reportValidity();
    elements.input.setCustomValidity('');
    return;
  }
  if (title.length > 200) {
    showToast('Task titles can be up to 200 characters.', 'error');
    return;
  }

  setBusy(true);
  try {
    const tags = [...elements.tagPicker.querySelectorAll('input:checked')].map((input) => input.value);
    await apiRequest('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, priority: elements.priorityInput.value, tags })
    });
    elements.form.reset();
    elements.priorityInput.value = 'medium';
    elements.tagPicker.open = false;
    state.filter = 'all';
    state.view = 'all';
    state.priority = 'all';
    state.tag = 'all';
    elements.nav.forEach((button) => button.classList.toggle('is-active', button.dataset.view === 'all'));
    document.querySelector('#breadcrumb-current').textContent = 'All tasks';
    if (await loadTasks()) showToast('Task added.');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    setBusy(false);
    renderTasks();
  }
});

elements.loginTab.addEventListener('click', () => setAuthMode('login'));
elements.registerTab.addEventListener('click', () => setAuthMode('register'));
elements.loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitAuthForm(elements.loginForm, '/api/auth/login', 'login');
});
elements.registerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitAuthForm(elements.registerForm, '/api/auth/register', 'register');
});

elements.profileOpen.addEventListener('click', () => {
  elements.profileNameInput.value = state.user.name;
  elements.profileEmailInput.value = state.user.email;
  elements.settingsDialog.showModal();
});

elements.profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.busy || !elements.profileForm.reportValidity()) return;
  const button = elements.profileForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await apiRequest('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: elements.profileNameInput.value })
    });
    setAuthenticatedUser(result.user);
    elements.settingsDialog.close();
    showToast('Profile updated.');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    button.disabled = false;
  }
});

elements.logout.addEventListener('click', async () => {
  elements.logout.disabled = true;
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    elements.settingsDialog.close();
    setAuthenticatedUser(null);
    showToast('You have been signed out.');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    elements.logout.disabled = false;
  }
});

elements.list.addEventListener('change', async (event) => {
  const checkbox = event.target.closest('[data-action="toggle"]');
  const statusSelect = event.target.closest('[data-action="status"]');
  const control = checkbox || statusSelect;
  if (!control || state.busy) return;
  const task = state.tasks.find((item) => item.id === control.dataset.id);
  if (!task) return;

  const status = statusSelect
    ? statusSelect.value
    : checkbox.checked ? 'done' : 'todo';
  const previousStatus = task.status || (task.completed ? 'done' : 'todo');
  setBusy(true);
  try {
    await apiRequest(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (await loadTasks()) {
      const label = taskStatuses.find(([value]) => value === status)?.[1] || status;
      showToast(status === 'done' && previousStatus !== 'done' ? 'Task completed.' : `Status changed to ${label}.`);
    }
  } catch (error) {
    showToast(friendlyError(error), 'error');
    renderTasks();
  } finally {
    setBusy(false);
  }
});

elements.list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action="delete"]');
  if (!button || state.busy) return;
  const task = state.tasks.find((item) => item.id === button.dataset.id);
  if (!task || !window.confirm(`Delete “${task.title}”? This can’t be undone.`)) return;

  setBusy(true);
  try {
    await apiRequest(`/api/tasks/${task.id}`, { method: 'DELETE' });
    if (await loadTasks()) showToast('Task deleted.');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    setBusy(false);
    renderTasks();
  }
});

elements.search.addEventListener('input', () => {
  state.search = elements.search.value;
  renderTasks();
});

elements.clearSearch.addEventListener('click', () => {
  state.search = '';
  elements.search.value = '';
  elements.search.focus();
  renderTasks();
});

elements.sort.addEventListener('change', () => {
  state.sort = elements.sort.value;
  renderTasks();
});

elements.filters.forEach((button) => {
  button.addEventListener('click', () => {
    setView(button.dataset.filter === 'all' ? 'all' : button.dataset.filter);
  });
});

elements.priorityFilters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-priority-filter]');
  if (!button) return;
  state.priority = button.dataset.priorityFilter;
  renderTasks();
});

elements.tagFilters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tag-filter]');
  if (!button) return;
  state.tag = button.dataset.tagFilter;
  renderTasks();
});

elements.nav.forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

elements.reset.addEventListener('click', () => {
  state.filter = 'all';
  state.view = 'all';
  state.search = '';
  state.sort = 'newest';
  state.priority = 'all';
  state.tag = 'all';
  elements.search.value = '';
  elements.sort.value = 'newest';
  setView('all');
  showToast('Filters reset.');
});

elements.emptyAction.addEventListener('click', () => {
  if (state.search || state.filter !== 'all' || state.priority !== 'all' || state.tag !== 'all') {
    state.search = '';
    state.filter = 'all';
    state.priority = 'all';
    state.tag = 'all';
    elements.search.value = '';
    setView('all');
  } else {
    elements.input.focus();
  }
});

elements.refresh.addEventListener('click', () => loadTasks({ announce: true }));
elements.serviceStatusButton.addEventListener('click', () => loadTasks({ announce: true }));
elements.exportButton.addEventListener('click', exportVisibleTasks);

document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  const typing = target instanceof HTMLElement
    && (target.matches('input, textarea, select') || target.isContentEditable);

  if (event.key === 'Escape') {
    if (typing) target.blur();
    state.search = '';
    state.filter = 'all';
    state.priority = 'all';
    state.tag = 'all';
    elements.search.value = '';
    setView('all');
    return;
  }
  if (typing || elements.authScreen.hidden === false || elements.settingsDialog.open) return;
  if (event.key === '/') {
    event.preventDefault();
    elements.search.focus();
  } else if (event.key.toLowerCase() === 'n' || event.key.toLowerCase() === 'c') {
    event.preventDefault();
    elements.input.focus();
  }
});

elements.menuToggle.addEventListener('click', () => {
  const open = !elements.sidebar.classList.contains('is-open');
  elements.sidebar.classList.toggle('is-open', open);
  elements.menuToggle.setAttribute('aria-expanded', String(open));
  elements.menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  elements.scrim.hidden = !open;
});

elements.scrim.addEventListener('click', closeMobileNav);
elements.settingsOpen.addEventListener('click', () => elements.settingsDialog.showModal());
elements.themeToggle.addEventListener('change', () => setTheme(elements.themeToggle.checked));

document.querySelector('#current-date').textContent = new Intl.DateTimeFormat(undefined, {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
}).format(new Date());

async function initializeApp() {
  try {
    const result = await apiRequest('/api/auth/me');
    const query = new URLSearchParams(location.search);
    if (query.has('signed_in') || query.has('auth_error')) {
      history.replaceState(null, '', location.pathname);
    }
    if (result.user) {
      setAuthenticatedUser(result.user);
      await loadTasks();
      if (query.get('signed_in') === 'google') showToast('Signed in with Google.');
    } else {
      setAuthenticatedUser(null);
      if (result.oauthError) showAuthError(new Error(result.oauthError));
    }
  } catch (error) {
    setAuthenticatedUser(null);
    showAuthError(error);
  }
}

initializeApp();
