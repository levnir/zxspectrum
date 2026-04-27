/* ═══════════════════════════════════════════════════════════════════
   ZX Spectrum Collection — app.js
   ═══════════════════════════════════════════════════════════════════ */

let allPrograms = [];
let currentFilter = 'all';
let currentSearch  = '';
let emuInstance    = null;
let kempstonState  = 0;
let joystickActive = false;

// Kempston joystick bit mapping (bit0=right, bit1=left, bit2=down, bit3=up, bit4=fire)
const KEMPSTON_BITS = {
  ArrowRight: 0x01,
  ArrowLeft:  0x02,
  ArrowDown:  0x04,
  ArrowUp:    0x08,
  Alt:        0x10,
};

function sendKempston(bit, pressed) {
  if (pressed) kempstonState |=  bit;
  else         kempstonState &= ~bit;
  if (emuInstance && joystickActive) {
    emuInstance.postWorkerMessage({ message: 'setKempstonState', state: kempstonState });
  }
}

document.addEventListener('keydown', e => {
  const bit = KEMPSTON_BITS[e.key];
  if (bit !== undefined && emuInstance && joystickActive) {
    sendKempston(bit, true);
    e.preventDefault();
  }
});

document.addEventListener('keyup', e => {
  const bit = KEMPSTON_BITS[e.key];
  if (bit !== undefined && emuInstance && joystickActive) {
    sendKempston(bit, false);
    e.preventDefault();
  }
});

/* ─── Bootstrap ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  fetch('manifest.json')
    .then(r => r.json())
    .then(data => {
      allPrograms = data.programs;
      renderList();
    })
    .catch(err => {
      document.getElementById('program-list').innerHTML =
        '<p class="no-results">Failed to load program list. Please refresh the page.</p>';
      console.error(err);
    });

  // Search
  document.getElementById('search-box').addEventListener('input', e => {
    currentSearch = e.target.value.toLowerCase().trim();
    renderList();
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderList();
    });
  });

  // Back button
  document.getElementById('back-btn').addEventListener('click', exitEmulator);

  // Fullscreen
  document.getElementById('fullscreen-btn').addEventListener('click', () => {
    if (emuInstance) emuInstance.toggleFullscreen();
  });
});

/* ─── Render program list ────────────────────────────────────────── */
function renderList() {
  const container = document.getElementById('program-list');

  const filtered = allPrograms.filter(p => {
    const matchesFilter = currentFilter === 'all' || p.category === currentFilter;
    const matchesSearch = !currentSearch ||
      p.name.toLowerCase().includes(currentSearch) ||
      p.description.toLowerCase().includes(currentSearch);
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="no-results">No programs found.</p>';
    return;
  }

  const finished = filtered.filter(p => p.folder === 'nir-programs');
  const temp     = filtered.filter(p => p.folder === 'nir-temp');

  let html = '';

  if (finished.length > 0) {
    html += `
      <section class="folder-section">
        <h2 class="folder-heading">
          <span class="folder-tag finished">Finished</span>
          Nir's Programs — ${finished.length} program${finished.length !== 1 ? 's' : ''}
        </h2>
        <div class="program-grid">
          ${finished.map(cardHTML).join('')}
        </div>
      </section>`;
  }

  if (temp.length > 0) {
    html += `
      <section class="folder-section">
        <h2 class="folder-heading">
          <span class="folder-tag temp">In Progress</span>
          Nir's Temp — ${temp.length} program${temp.length !== 1 ? 's' : ''}
        </h2>
        <div class="program-grid">
          ${temp.map(cardHTML).join('')}
        </div>
      </section>`;
  }

  container.innerHTML = html;

  // Attach click handlers
  container.querySelectorAll('.program-card').forEach(card => {
    card.addEventListener('click', () => launchProgram(card.dataset.id));
  });
}

function cardHTML(p) {
  const badges = [];
  badges.push(`<span class="badge badge-${p.category}">${p.category}</span>`);
  if (p.joystick) badges.push(`<span class="badge badge-joystick">Joystick</span>`);
  if (p.language === 'hebrew')    badges.push(`<span class="badge badge-hebrew">Hebrew</span>`);
  if (p.language === 'bilingual') badges.push(`<span class="badge badge-bilingual">Bilingual</span>`);

  return `
    <div class="program-card" data-id="${p.id}" title="Click to run ${p.name}">
      <div class="card-name">${p.name}</div>
      <div class="card-desc">${p.description}</div>
      <div class="card-badges">${badges.join('')}</div>
    </div>`;
}

/* ─── Launch emulator ────────────────────────────────────────────── */
function launchProgram(id) {
  const p = allPrograms.find(x => x.id === id);
  if (!p) return;

  // Switch views
  document.getElementById('selector-view').classList.add('hidden');
  const emuView = document.getElementById('emulator-view');
  emuView.classList.remove('hidden');

  // Header info
  document.getElementById('emu-program-name').textContent = p.name;
  const badge = document.getElementById('emu-folder-badge');
  if (p.folder === 'nir-programs') {
    badge.textContent = 'Finished';
    badge.style.background = '#00cdcd';
    badge.style.color = '#000';
  } else {
    badge.textContent = 'In Progress';
    badge.style.background = '#cdcd00';
    badge.style.color = '#000';
  }

  // Description
  document.getElementById('emu-description').textContent = p.description;

  // Joystick notice
  const joystickPanel = document.getElementById('joystick-panel');
  if (p.joystick) {
    joystickPanel.classList.remove('hidden');
  } else {
    joystickPanel.classList.add('hidden');
  }

  // Controls panel
  const controlsPanel = document.getElementById('controls-panel');
  const controlsList  = document.getElementById('controls-list');
  if (p.controls && p.controls.length > 0) {
    controlsList.innerHTML = p.controls.map(c =>
      `<div class="control-row">
         <span class="control-key">${c.key}</span>
         <span class="control-action">${c.action}</span>
       </div>`
    ).join('');
    controlsPanel.classList.remove('hidden');
  } else {
    controlsPanel.classList.add('hidden');
  }

  // Comments panel
  const commentsPanel = document.getElementById('comments-panel');
  if (p.comments) {
    document.getElementById('emu-comments').textContent = p.comments;
    commentsPanel.classList.remove('hidden');
  } else {
    commentsPanel.classList.add('hidden');
  }

  // Reset joystick state for the new program
  joystickActive = !!(p.joystick);
  kempstonState  = 0;

  // Destroy any previous emulator instance
  if (emuInstance) {
    try { emuInstance.exit(); } catch(e) {}
    emuInstance = null;
  }
  const emuContainer = document.getElementById('emu-container');
  emuContainer.innerHTML = '';

  // Start JSSpeccy3
  function startEmulator(url) {
    const opts = {
      machine: p.machine || 48,
      zoom: 2,
      autoStart: true,
      autoLoadTapes: p.autoload === true,
      tapeAutoLoadMode: 'default',
      tapeTrapsEnabled: true,
      sandbox: false,
      uiEnabled: true
    };
    if (url) opts.openUrl = url;
    emuInstance = JSSpeccy(emuContainer, opts);
  }

  if (p.autorun === false) {
    // Fetch TZX, patch LINE field to 0x8000 to suppress BASIC autostart
    fetch(p.file)
      .then(r => r.arrayBuffer())
      .then(buf => {
        const data = new Uint8Array(buf);
        let i = 10;
        while (i < data.length) {
          const blockType = data[i];
          if (blockType === 0x10) {
            const blockLen = data[i+3] | (data[i+4] << 8);
            const flag = data[i+5];
            const hdrType = data[i+6];
            if (flag === 0x00 && hdrType === 0x00) {
              // BASIC program header: LINE is at offset 19-20 from block start
              data[i+19] = 0x00;  // LINE low byte
              data[i+20] = 0x80;  // LINE high byte = 0x8000 (no autostart)
              // Recalculate checksum (XOR of bytes i+5 .. i+22)
              let chk = 0;
              for (let j = i+5; j <= i+22; j++) chk ^= data[j];
              data[i+23] = chk;
            }
            i += 5 + blockLen;
          } else if (blockType === 0x11) {
            const blockLen = (data[i+15] | (data[i+16] << 8) | (data[i+17] << 16));
            i += 18 + blockLen;
          } else if (blockType === 0x20) { i += 3;
          } else if (blockType === 0x30) { i += 2 + data[i+1];
          } else if (blockType === 0x32) { i += 3 + (data[i+1] | (data[i+2] << 8));
          } else if (blockType === 0x5A) { i += 10;
          } else break;
        }
        const file = new File([data], 'program.tzx', {type: 'application/octet-stream'});
        startEmulator(null);
        emuInstance.onReady(() => emuInstance.openFile(file));
      });
  } else {
    startEmulator(p.file);
  }

  // Scroll to top on mobile
  window.scrollTo(0, 0);
}

/* ─── Exit emulator ──────────────────────────────────────────────── */
function exitEmulator() {
  joystickActive = false;
  kempstonState  = 0;
  if (emuInstance) {
    try { emuInstance.exit(); } catch(e) {}
    emuInstance = null;
  }
  document.getElementById('emu-container').innerHTML = '';
  document.getElementById('emulator-view').classList.add('hidden');
  document.getElementById('selector-view').classList.remove('hidden');
}
