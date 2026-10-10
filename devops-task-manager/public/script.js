const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');

const tasks = ['Set up CI pipeline', 'Review deployment checklist'];

function renderTasks() {
  taskList.innerHTML = '';

  tasks.forEach((task, index) => {
    const item = document.createElement('li');
    item.innerHTML = `
      <span>${task}</span>
      <button type="button" data-index="${index}">Remove</button>
    `;
    taskList.appendChild(item);
  });
}

taskForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const value = taskInput.value.trim();
  if (!value) {
    return;
  }

  tasks.push(value);
  taskInput.value = '';
  renderTasks();
});

taskList.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }

  const index = Number(button.dataset.index);
  tasks.splice(index, 1);
  renderTasks();
});

renderTasks();
