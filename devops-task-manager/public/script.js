const elements = {
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
  refresh: document.querySelector('#refresh-button'),
  nav: [...document.querySelectorAll('[data-view]')],
  filters: [...document.querySelectorAll('[data-filter]')],
  sidebar: document.querySelector('#sidebar'),
  menuToggle: document.querySelector('#menu-toggle'),
  scrim: document.querySelector('#mobile-scrim'),
  settingsOpen: document.querySelector('#settings-open'),
  settingsDialog: document.querySelector('#settings-dialog'),
  themeToggle: document.querySelector('#theme-toggle')
};

const state = {
  tasks: [],
  filter: 'all',
  view: 'dashboard',
  search: '',
  sort: 'newest',
  loading: true,
  busy: false
};

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
    response = await fetch(url, options);
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
    throw new Error(result.error || `Request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
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
  elements.list.setAttribute('aria-busy', String(busy || state.loading));
  elements.list.querySelectorAll('button, input').forEach((control) => {
    control.disabled = busy;
  });
  elements.refresh.disabled = busy || state.loading;
  elements.refresh.classList.toggle('is-spinning', busy);
}

function updateStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.completed).length;
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

function getVisibleTasks() {
  const search = state.search.trim().toLocaleLowerCase();
  const filtered = state.tasks.filter((task) => {
    const matchesStatus = state.filter === 'all'
      || (state.filter === 'completed' ? task.completed : !task.completed);
    return matchesStatus && task.title.toLocaleLowerCase().includes(search);
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
  const item = document.createElement('li');
  item.className = `task-item${task.completed ? ' is-complete' : ''}`;

  const checkbox = document.createElement('input');
  checkbox.className = 'task-checkbox';
  checkbox.type = 'checkbox';
  checkbox.checked = task.completed;
  checkbox.dataset.action = 'toggle';
  checkbox.dataset.id = task.id;
  checkbox.setAttribute('aria-label', `Mark ${task.title} ${task.completed ? 'pending' : 'completed'}`);

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;

  const label = document.createElement('label');
  label.className = 'task-main';
  label.append(checkbox, title);

  const status = document.createElement('span');
  status.className = `task-status ${task.completed ? 'status-complete' : 'status-pending'}`;
  status.textContent = task.completed ? 'Completed' : 'Pending';

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

  item.append(label, status, date, remove);
  return item;
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
  updateStats();
}

async function loadTasks({ announce = false } = {}) {
  state.loading = state.tasks.length === 0;
  elements.loading.hidden = !state.loading;
  elements.refresh.disabled = true;
  elements.refresh.classList.add('is-spinning');
  try {
    const [tasks, health] = await Promise.all([
      apiRequest('/api/tasks'),
      apiRequest('/api/health')
    ]);
    if (!Array.isArray(tasks)) throw new Error('The server returned an invalid task list.');
    if (health.status !== 'ok') throw new Error('The server health check did not pass.');
    state.tasks = tasks;
    state.loading = false;
    elements.serviceStatus.textContent = 'Online';
    renderTasks();
    if (announce) showToast('Tasks refreshed.');
    return true;
  } catch (error) {
    state.loading = false;
    elements.serviceStatus.textContent = 'Offline';
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
    await apiRequest('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title })
    });
    elements.input.value = '';
    state.filter = 'all';
    state.view = 'all';
    elements.nav.forEach((button) => button.classList.toggle('is-active', button.dataset.view === 'all'));
    document.querySelector('#breadcrumb-current').textContent = 'All tasks';
    if (await loadTasks()) showToast('Task added. You’ve got this!');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    setBusy(false);
    renderTasks();
  }
});

elements.list.addEventListener('change', async (event) => {
  const checkbox = event.target.closest('[data-action="toggle"]');
  if (!checkbox || state.busy) return;
  const task = state.tasks.find((item) => item.id === checkbox.dataset.id);
  if (!task) return;

  setBusy(true);
  try {
    await apiRequest(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: checkbox.checked })
    });
    if (await loadTasks()) {
      showToast(checkbox.checked ? 'Task completed. Nice work!' : 'Task moved back to pending.');
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

elements.nav.forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

elements.reset.addEventListener('click', () => {
  state.filter = 'all';
  state.view = 'all';
  state.search = '';
  state.sort = 'newest';
  elements.search.value = '';
  elements.sort.value = 'newest';
  setView('all');
  showToast('Filters reset.');
});

elements.emptyAction.addEventListener('click', () => {
  if (state.search || state.filter !== 'all') {
    state.search = '';
    state.filter = 'all';
    elements.search.value = '';
    setView('all');
  } else {
    elements.input.focus();
  }
});

elements.refresh.addEventListener('click', () => loadTasks({ announce: true }));

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

loadTasks();
