import './style.css';
import { initViewer } from './viewer.js';

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
