import './style.css';
import { initViewer } from './viewer.js';

// Toolbar toggle for mobile
const toolbarToggle = document.getElementById('toolbarToggle');
const toolbar = document.getElementById('toolbar');
if (toolbarToggle && toolbar) {
  const mobileQuery = window.matchMedia('(max-width:768px)');
  const applyMobile = (e) => {
    if (e.matches) {
      toolbar.classList.add('collapsed');
      toolbarToggle.classList.remove('active');
    } else {
      toolbar.classList.remove('collapsed');
    }
  };
  applyMobile(mobileQuery);
  mobileQuery.addEventListener('change', applyMobile);
  toolbarToggle.addEventListener('click', () => {
    toolbar.classList.toggle('collapsed');
    toolbarToggle.classList.toggle('active');
  });
}

// Collapsible sidebar sections
document.querySelectorAll('.sb-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    const body = document.getElementById(toggle.dataset.target);
    toggle.classList.toggle('open');
    body.classList.toggle('collapsed');
  });
});

fetch('/model.json')
  .then(res => {
    if (!res.ok) throw new Error(`Failed to load model.json: ${res.status}`);
    return res.json();
  })
  .then(model => initViewer(model))
  .catch(err => {
    console.error('Model load error:', err);
    const hudMode = document.getElementById('hudMode');
    if (hudMode) hudMode.textContent = 'Load Error';
  });
