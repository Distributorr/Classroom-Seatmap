/* app.js — improved
   - robust templates (U-form)
   - CSV upload handled by JS (no navigation)
   - drag & drop moves/swap students correctly
   - export JSON/CSV and Print (PDF via browser)
   - save/load to server via AJAX
*/

(() => {
  // DOM refs
  const gridContainer = document.getElementById('gridContainer');
  const rowsInput = document.getElementById('rows');
  const colsInput = document.getElementById('cols');
  const seatSizeInput = document.getElementById('seatSize');
  const gapInput = document.getElementById('gapSize');
  const btnApplyGrid = document.getElementById('btnApplyGrid');
  const studentNameInput = document.getElementById('studentName');
  const klassenNameInput = document.getElementById('klassenName').value;
  const btnAdd = document.getElementById('btnAdd');
  const studentList = document.getElementById('studentList');
  const csvFile = document.getElementById('csvFile');
  const templateSelect = document.getElementById('templateSelect');
  const btnRandomize = document.getElementById('btnRandomize');
  const btnClear = document.getElementById('btnClear');

  const btnSaveLocal = document.getElementById('btnSaveLocal');
  const btnLoadLocal = document.getElementById('btnLoadLocal');
  const btnExportJSON = document.getElementById('btnExportJSON');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnPrint = document.getElementById('btnPrint');

  const serverCsvInput = document.getElementById('serverCsvInput');
  const btnUploadServer = document.getElementById('btnUploadServer');
  const btnSaveServer = document.getElementById('btnSaveServer');
  const serverSavedList = document.getElementById('serverSavedList');
  const btnListServer = document.getElementById('btnListServer');
  const btnLoadServer = document.getElementById('btnLoadServer');

  // state
  let state = {
    rows: parseInt(rowsInput.value, 10) || 4,
    cols: parseInt(colsInput.value, 10) || 6,
    seatSize: parseInt(seatSizeInput.value, 10) || 64,
    gap: parseInt(gapInput.value, 10) || 16,
    template: templateSelect.value || 'full',
    students: [], // {id,name,email}
    seats: {},    // mapping seatKey -> studentId
    seatMask: {}  // mapping seatKey -> true/false (whether a seat exists there)
  };

  // helpers
  const uid = () => Math.random().toString(36).slice(2,9);
  const key = (r,c) => `${r}_${c}`;

  // create seatMask for template and optionally preserve existing students
  function applyTemplate(templateName, keepAssignments = true) {
    const { rows, cols } = state;
    const newMask = {};
    if (templateName === 'full') {
      for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) newMask[key(r,c)] = true;
    } else if (templateName === 'u') {
      // U-form open at top: left column, right column, bottom row
      for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
        if (c === 0 || c === cols-1 || r === rows-1) newMask[key(r,c)] = true;
      }
    } else if (templateName === 'front-rows') {
      // first two rows (front) only
      const n = Math.max(1, Math.min(rows, 2));
      for (let r=0;r<n;r++) for (let c=0;c<cols;c++) newMask[key(r,c)] = true;
    } else {
      // fallback to full
      for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) newMask[key(r,c)] = true;
    }

    // If we keep assignments, reassign existing students into available seats in reading order
    if (keepAssignments) {
      const existingStudents = [];
      // collect currently assigned student ids (preserve those not assigned too)
      const assigned = new Set();
      for (const k in state.seats) {
        if (!newMask[k]) continue; // old seat now gone
        assigned.add(state.seats[k]);
      }
      // push all students, but if they were previously assigned to an available seat, maintain their seat if possible
      // We'll try to keep assignment order: first fill seats using already-assigned ids (to preserve placements),
      // then place remaining unassigned students into any free seat.
      const newSeats = {};
      // First, keep those students that already are assigned to seats that still exist:
      for (const k in state.seats) {
        const sid = state.seats[k];
        if (newMask[k] && sid) {
          newSeats[k] = sid;
        }
      }
      // Now assign any remaining students to first free mask spots
      const freeKeys = [];
      for (let r=0;r<state.rows;r++) for (let c=0;c<state.cols;c++) {
        const k = key(r,c);
        if (newMask[k] && !newSeats[k]) freeKeys.push(k);
      }
      // Collect students that are not yet assigned (order preserved by state.students)
      const remainingStudents = state.students
        .filter(s => !Object.values(newSeats).includes(s.id));
      for (let i=0;i<remainingStudents.length && i<freeKeys.length;i++) {
        newSeats[freeKeys[i]] = remainingStudents[i].id;
      }
      state.seatMask = newMask;
      state.seats = newSeats;
    } else {
      state.seatMask = newMask;
      state.seats = {};
    }
  }

  // build grid DOM
  function buildGrid() {
    // refresh state from inputs
    state.rows = Math.max(1, Math.min(30, parseInt(rowsInput.value, 10) || 4));
    state.cols = Math.max(1, Math.min(30, parseInt(colsInput.value, 10) || 6));
    state.seatSize = Math.max(30, Math.min(120, parseInt(seatSizeInput.value, 10) || 64));
    state.gap = Math.max(0, Math.min(40, parseInt(gapInput.value, 10) || 16));
    state.template = templateSelect.value || 'full';

    // if seatMask not set or template changed, (re)apply template but keep assignments
    applyTemplate(state.template, true);

    gridContainer.innerHTML = '';
    const gridEl = document.createElement('div');
    gridEl.className = 'grid';
    const cellWidth = state.seatSize + state.gap;
    gridEl.style.width = `${state.cols * cellWidth}px`;
    gridEl.style.height = `${state.rows * cellWidth}px`;
    gridEl.style.position = 'relative';

    // create each cell (only visual). We'll create seat elements only where seatMask true
    for (let r=0;r<state.rows;r++) {
      for (let c=0;c<state.cols;c++) {
        const k = key(r,c);
        const left = c * cellWidth;
        const top = r * cellWidth;

        const seatWrapper = document.createElement('div');
        seatWrapper.style.position = 'absolute';
        seatWrapper.style.left = `${left}px`;
        seatWrapper.style.top = `${top}px`;
        seatWrapper.style.width = `${state.seatSize}px`;
        seatWrapper.style.height = `${state.seatSize}px`;
        seatWrapper.dataset.r = r;
        seatWrapper.dataset.c = c;
        seatWrapper.dataset.key = k;

        if (!state.seatMask[k]) {
          // no seat here (empty area)
          const empty = document.createElement('div');
          empty.className = 'seat empty';
          empty.style.width = '100%';
          empty.style.height = '100%';
          seatWrapper.appendChild(empty);
        } else {
          // seat exists: render content
          const seatDiv = document.createElement('div');
          seatDiv.className = 'seat';
          seatDiv.style.width = '100%';
          seatDiv.style.height = '100%';
          seatDiv.dataset.key = k;

          const label = document.createElement('div');
          label.className = 'label';
          const sid = state.seats[k];
          if (sid) {
            const s = state.students.find(x => x.id === sid);
            label.textContent = s ? s.name : 'Unknown';
            seatDiv.dataset.hasStudent = '1';
          } else {
            label.textContent = '';
            seatDiv.dataset.hasStudent = '0';
          }
          seatDiv.appendChild(label);

          // add click to assign via assignMode (handled elsewhere)
          seatDiv.addEventListener('click', (ev) => {
            if (assignMode) {
              state.seats[k] = assignMode;
              assignMode = null;
              renderStudentList();
              buildGrid();
            }
          });

          // attach drag handlers
          addDragToSeat(seatDiv);

          seatWrapper.appendChild(seatDiv);
        }

        gridEl.appendChild(seatWrapper);
      }
    }

    gridContainer.appendChild(gridEl);
  }

  function renderStudentList() {
    studentList.innerHTML = '';
    state.students.forEach(s => {
      const li = document.createElement('li');
      li.textContent = s.name;

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '6px';

      const assignBtn = document.createElement('button');
      assignBtn.textContent = 'Assign';
      assignBtn.onclick = () => beginAssign(s.id);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.onclick = () => {
        // remove from students and from any seats
        state.students = state.students.filter(x => x.id !== s.id);
        for (const k in state.seats) if (state.seats[k] === s.id) delete state.seats[k];
        renderStudentList();
        buildGrid();
      };

      actions.appendChild(delBtn);
      li.appendChild(actions);
      studentList.appendChild(li);
    });
  }


  

  // DRAG & DROP - robust swap or move
  function addDragToSeat(seatEl) {
    // seatEl is inner .seat (not wrapper); it has dataset.key
    let dragging = false;
    let pointerId = null;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;
    // only allow dragging if seat has student
    seatEl.style.touchAction = 'none'; // for pointer events

    seatEl.addEventListener('pointerdown', (ev) => {
      const k = seatEl.dataset.key;
      if (!k) return;
      if (!state.seatMask[k]) return;
      const sid = state.seats[k];
      if (!sid) return; // only drag if a student occupies this seat
      seatEl.setPointerCapture(ev.pointerId);
      pointerId = ev.pointerId;
      dragging = true;
      startX = ev.clientX;
      startY = ev.clientY;
      // origLeft/origTop from inline style of wrapper
      const wrapper = seatEl.parentElement;
      origLeft = parseInt(wrapper.style.left, 10) || 0;
      origTop  = parseInt(wrapper.style.top, 10) || 0;
      seatEl.classList.add('dragging');
      // raise z-index
      wrapper.style.zIndex = 999;
    });

    seatEl.addEventListener('pointermove', (ev) => {
      if (!dragging || pointerId !== ev.pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const wrapper = seatEl.parentElement;
      wrapper.style.left = `${origLeft + dx}px`;
      wrapper.style.top  = `${origTop + dy}px`;
    });

    seatEl.addEventListener('pointerup', (ev) => {
      if (!dragging || pointerId !== ev.pointerId) return;
      dragging = false;
      seatEl.releasePointerCapture(pointerId);
      pointerId = null;
      seatEl.classList.remove('dragging');

      const wrapper = seatEl.parentElement;
      // compute destination cell by rounding relative to grid element
      const gridEl = wrapper.parentElement; // the .grid
      const cellW = state.seatSize + state.gap;

      // clamp wrapper position to grid
      const localLeft = parseFloat(wrapper.style.left || 0);
      const localTop  = parseFloat(wrapper.style.top || 0);
      const c = Math.round(localLeft / cellW);
      const r = Math.round(localTop / cellW);
      const clampedR = Math.max(0, Math.min(state.rows - 1, r));
      const clampedC = Math.max(0, Math.min(state.cols - 1, c));
      const destKey = key(clampedR, clampedC);
      const fromKey = seatEl.dataset.key;

      // only move/swap if dest has seat (otherwise ignore)
      if (!state.seatMask[destKey]) {
        // snap back to original position
        buildGrid();
        return;
      }

      // perform swap / move:
      // a = student at fromKey (must exist), b = student at destKey (may be null)
      const a = state.seats[fromKey] || null;
      const b = state.seats[destKey] || null;
      if (!a) {
        // nothing to move
        buildGrid();
        return;
      }
      // if same position, nothing
      if (fromKey === destKey) {
        buildGrid();
        return;
      }

      // swap/move
      state.seats[destKey] = a;
      if (b === null) {
        // moved into empty: remove original
        delete state.seats[fromKey];
      } else {
        // swap: place b into fromKey
        state.seats[fromKey] = b;
      }

      // re-render
      renderStudentList();
      buildGrid();
    });

    // pointercancel -> restore
    seatEl.addEventListener('pointercancel', () => {
      seatEl.classList.remove('dragging');
      buildGrid();
    });
  }

  // CSV (client-side) - parse and append students
  csvFile.addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = reader.result.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      for (const line of lines) {
        const parts = line.split(',').map(p => p.trim());
        addStudent(parts[0] || 'Unnamed', parts[1] || '');
      }
      assignUnplacedStudents();
      renderStudentList();
      buildGrid();
      csvFile.value = '';
    };
    reader.readAsText(f);
  });

  // add student
  function addStudent(name, email='') {
    state.students.push({ id: uid(), name: name.trim(), email: (email||'').trim() });
  }

  // assign unplaced students into any available seats (reading order)
  function assignUnplacedStudents() {
    const occupiedIds = new Set(Object.values(state.seats));
    const unplaced = state.students.filter(s => !occupiedIds.has(s.id));
    if (!unplaced.length) return;
    const freeKeys = [];
    for (let r=0;r<state.rows;r++) {
      for (let c=0;c<state.cols;c++) {
        const k = key(r,c);
        if (state.seatMask[k] && !state.seats[k]) freeKeys.push(k);
      }
    }
    for (let i=0;i<unplaced.length && i<freeKeys.length;i++) {
      state.seats[freeKeys[i]] = unplaced[i].id;
    }
  }

  // randomize (place students randomly on available seats)
  btnRandomize.addEventListener('click', () => {
    const keys = [];
    for (let r=0;r<state.rows;r++) for (let c=0;c<state.cols;c++) {
      const k = key(r,c);
      if (state.seatMask[k]) keys.push(k);
    }
    // shuffle keys
    for (let i = keys.length-1; i>0; i--) {
      const j = Math.floor(Math.random() * (i+1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    state.seats = {};
    const students = state.students.slice();
    for (let i=0;i<students.length && i<keys.length;i++) {
      state.seats[keys[i]] = students[i].id;
    }
    renderStudentList();
    buildGrid();
  });

  // clear
  btnClear.addEventListener('click', () => {
    if (!confirm('Clear all students and seats?')) return;
    state.students = [];
    state.seats = {};
    state.seatMask = {};
    applyTemplate(state.template, false);
    renderStudentList();
    buildGrid();
  });

  // save/load local
  btnSaveLocal.addEventListener('click', () => {
    const payload = {
      rows: state.rows, cols: state.cols, seatSize: state.seatSize, gap: state.gap,
      template: state.template, students: state.students, seats: state.seats
    };
    localStorage.setItem('seatmap', JSON.stringify(payload));
    alert('Saved into localStorage');
  });

  btnLoadLocal.addEventListener('click', () => {
    const raw = localStorage.getItem('seatmap');
    if (!raw) return alert('No saved layout in localStorage.');
    try {
      const p = JSON.parse(raw);
      state.rows = p.rows; state.cols = p.cols; state.seatSize = p.seatSize; state.gap = p.gap;
      state.template = p.template || 'full';
      state.students = p.students || [];
      state.seats = p.seats || {};
      // update controls
      rowsInput.value = state.rows; colsInput.value = state.cols; seatSizeInput.value = state.seatSize;
      gapInput.value = state.gap; templateSelect.value = state.template;
      renderStudentList();
      buildGrid();
    } catch (err) {
      alert('Failed to load saved layout: ' + err.message);
    }
  });

  // export JSON
  btnExportJSON.addEventListener('click', () => {
    const payload = {
      rows: state.rows, cols: state.cols, seatSize: state.seatSize, gap: state.gap,
      template: state.template, students: state.students, seats: state.seats
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'seatmap.json'; a.click();
    URL.revokeObjectURL(url);
  });

  // export CSV
  btnExportCSV.addEventListener('click', () => {
    // export: seatKey,row,col,name,email
    const rows = [['seatKey','row','col','name','email']];
    for (let r=0;r<state.rows;r++) for (let c=0;c<state.cols;c++) {
      const k = key(r,c);
      if (!state.seatMask[k]) continue;
      const sid = state.seats[k];
      const s = sid ? (state.students.find(x=>x.id===sid) || {}) : {};
      rows.push([k, r, c, s.name || '', s.email || '']);
    }
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'seatmap.csv'; a.click();
    URL.revokeObjectURL(url);
  });

  // Print / Save as PDF (opens a printable page)
btnPrint.addEventListener('click', () => {
  const w = window.open('', '_blank');
  if (!w) return alert('Popup blocked. Allow popups for this site to print.');

  // Klassenname aus Input holen
  const klassenNameInput = document.getElementById('klassenName').value || 'Klasse';

  let html = `<!doctype html><html><head><meta charset="utf-8"><title>Seatmap Print</title>`;
  html += `<style>
    body{
      font-family:Arial,Helvetica,sans-serif;
      color:#000;
      padding:10px;
    }
    table{
      border-collapse:collapse;
      margin-top:20px;
    }
    td{
      border:1px solid #000;
      width:60px;
      height:60px;
      text-align:center;
      vertical-align:middle;
      padding:0;
      box-sizing:border-box;
      overflow:hidden;
      white-space:nowrap;
    }
    .empty{ background:#f8f8f8; }
    .seatName{ font-weight:bold; display:block; }
    .seatEmail{ font-size:11px; color:#666; display:block; }
  </style></head><body>`;

  html += `<h2>${escapeHtml(klassenNameInput)} – Sitzplan (${state.rows} × ${state.cols})</h2>`;

  
  html += '<table>';
  for (let r = 0; r < state.rows; r++) {
    html += '<tr>';
    for (let c = 0; c < state.cols; c++) {
      const k = key(r,c);
      if (!state.seatMask[k]) {
        html += `<td class="empty"></td>`;
      } else {
        const sid = state.seats[k];
        const s = sid ? (state.students.find(x => x.id === sid) || {}) : {};
        
        html += `<td>`;
        if (s.name) {
          html += `<span class="seatName">${escapeHtml(s.name)}</span>`;
          html += `<span class="seatEmail">${escapeHtml(s.email || '')}</span>`;
        }
        html += `</td>`;
      }
    }
    html += '</tr>';
  }
  html += '</table>';

  html += `<script>window.onload = function(){ setTimeout(() => { window.print(); }, 200); }</script>`;
  html += '</body></html>';

  w.document.open();
  w.document.write(html);
  w.document.close();
});


  // escape helper
  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // Server CSV upload via AJAX (prevents page navigation)
  btnUploadServer.addEventListener('click', async () => {
    const f = serverCsvInput.files[0];
    if (!f) return alert('Choose a CSV file first.');
    const fd = new FormData();
    fd.append('csv', f);
    try {
      const res = await fetch('save.php', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.status === 'ok' && Array.isArray(json.students)) {
        // add parsed students to state (do not auto-assign)
        for (const s of json.students) addStudent(s.name || 'Unnamed', s.email || '');
        assignUnplacedStudents();
        renderStudentList();
        buildGrid();
        alert('Uploaded CSV to server and added students.');
      } else {
        alert('Server responded: ' + (json.message || JSON.stringify(json)));
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      serverCsvInput.value = '';
    }
  });

  // Save layout to server (POST JSON)
  btnSaveServer.addEventListener('click', async () => {
    const payload = {
      rows: state.rows, cols: state.cols, seatSize: state.seatSize, gap: state.gap,
      template: state.template, students: state.students, seats: state.seats
    };
    try {
      const res = await fetch('save.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.status === 'ok' && json.file) {
        alert('Saved on server as: ' + json.file);
        await refreshServerList();
      } else {
        alert('Server save failed: ' + (json.message || JSON.stringify(json)));
      }
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  });

  // list saved files from server
  async function refreshServerList() {
    try {
      const res = await fetch('save.php?list=1');
      const json = await res.json();
      if (json.status === 'ok' && Array.isArray(json.files)) {
        serverSavedList.innerHTML = '';
        json.files.forEach(fn => {
          const opt = document.createElement('option');
          opt.value = fn;
          opt.textContent = fn;
          serverSavedList.appendChild(opt);
        });
      } else {
        serverSavedList.innerHTML = '';
      }
    } catch (err) {
      console.warn('Could not refresh server list:', err.message);
    }
  }

  btnListServer.addEventListener('click', refreshServerList);

  btnLoadServer.addEventListener('click', async () => {
    const sel = serverSavedList.value;
    if (!sel) return alert('Choose a saved layout first.');
    try {
      const res = await fetch(`save.php?load=${encodeURIComponent(sel)}`);
      if (!res.ok) throw new Error('Server returned ' + res.status);
      const json = await res.json();
      if (json.rows) {
        // load into state
        state.rows = json.rows; state.cols = json.cols; state.seatSize = json.seatSize; state.gap = json.gap;
        state.template = json.template || 'full';
        state.students = json.students || [];
        state.seats = json.seats || {};
        // update controls
        rowsInput.value = state.rows; colsInput.value = state.cols; seatSizeInput.value = state.seatSize; gapInput.value = state.gap;
        templateSelect.value = state.template;
        renderStudentList();
        buildGrid();
      } else {
        alert('Invalid layout format from server.');
      }
    } catch (err) {
      alert('Failed to load from server: ' + err.message);
    }
  });

  // CSV upload server list on init
  btnListServer.click();

  // small UI bindings
  btnApplyGrid.addEventListener('click', () => {
    // reapply template and rebuild
    state.rows = parseInt(rowsInput.value, 10);
    state.cols = parseInt(colsInput.value, 10);
    state.seatSize = parseInt(seatSizeInput.value, 10);
    state.gap = parseInt(gapInput.value, 10);
    state.template = templateSelect.value;
    applyTemplate(state.template, true);
    assignUnplacedStudents();
    renderStudentList();
    buildGrid();
  });

  btnAdd.addEventListener('click', () => {
    const name = (studentNameInput.value || '').trim();
    if (!name) return alert('Enter a student name first.');
    addStudent(name);
    assignUnplacedStudents();
    renderStudentList();
    buildGrid();
    studentNameInput.value = '';
  });

  // accept Enter to add student
  studentNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); btnAdd.click(); }
  });

  // template change -> apply and rebuild (keep assignments where possible)
  templateSelect.addEventListener('change', () => {
    state.template = templateSelect.value;
    applyTemplate(state.template, true);
    assignUnplacedStudents();
    renderStudentList();
    buildGrid();
  });

  // initial seed: apply template and build
  applyTemplate(state.template, true);
  renderStudentList();
  buildGrid();

  // helper: load local sample or prefill (optional)
  // window.sampleSeed = () => { addStudent('Alice'); addStudent('Bob'); addStudent('Carl'); assignUnplacedStudents(); buildGrid(); };

})();
