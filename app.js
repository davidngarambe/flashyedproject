/* CONFIG */
const API = '/api';

/* AUTH GUARD */
let currentUser = null;
try {
  const stored = localStorage.getItem('fe_user');
  if (stored) currentUser = JSON.parse(stored);
} catch {}

if (!currentUser || !currentUser.id) {
  window.location.href = 'landing.html';
}

function logout() {
  localStorage.removeItem('fe_user');
  window.location.href = 'landing.html';
}

if (currentUser) {
  document.getElementById('user-name-display').textContent = currentUser.name || currentUser.email;
  document.getElementById('user-avatar').textContent = (currentUser.name || 'U')[0].toUpperCase();
}

/* DATABASE  (PostgreSQL via API) */
const DB = {
  async getSets() {
    try {
      const r = await fetch(`${API}/flashcards?userId=${currentUser.id}`);
      return r.ok ? await r.json() : [];
    } catch { return []; }
  },
  async saveSet(s) {
    await fetch(`${API}/flashcards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, title: s.title, source: s.source, cards: s.cards })
    });
  },
  async deleteSet(id) {
    await fetch(`${API}/flashcards/${id}`, { method: 'DELETE' });
  },

  async getQuizzes() {
    try {
      const r = await fetch(`${API}/quizzes?userId=${currentUser.id}`);
      return r.ok ? await r.json() : [];
    } catch { return []; }
  },
  async saveQuiz(q) {
    const r = await fetch(`${API}/quizzes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, title: q.title, source: q.source, questions: q.questions })
    });
    return r.ok ? await r.json() : null;
  },
  async deleteQuiz(id) {
    await fetch(`${API}/quizzes/${id}`, { method: 'DELETE' });
  },
  async getQuizById(id) {
    try {
      const r = await fetch(`${API}/quizzes/${id}`);
      return r.ok ? await r.json() : null;
    } catch { return null; }
  },

  async getAttempts() {
    const quizzes = await this.getQuizzes();
    let all = [];
    for (const q of quizzes) {
      try {
        const r = await fetch(`${API}/quizzes/${q.id}/attempts`);
        if (r.ok) {
          const atts = await r.json();
          atts.forEach(a => { a.quizTitle = q.title; a.quizDbId = q.id; });
          all = all.concat(atts);
        }
      } catch {}
    }
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return all;
  },
  async saveAttempt(a) {
    await fetch(`${API}/quizzes/${a.quizId}/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId:  currentUser.id,
        score:   a.score,
        total:   a.total,
        answers: a.answers,
        timeSec: a.timeSec || 0,
      })
    });
  },
  async getAttemptsForQuiz(quizId) {
    try {
      const r = await fetch(`${API}/quizzes/${quizId}/attempts`);
      return r.ok ? await r.json() : [];
    } catch { return []; }
  }
};

/* NAV */
function nav(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  const navBtn = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (pageId === 'dashboard')  renderDashboard();
  if (pageId === 'flashcards') renderFlashcardSets();
  if (pageId === 'quizzes')    renderQuizList();
  if (pageId === 'history')    renderHistory();
  updateBadges();
}

document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => nav(btn.dataset.page));
});

/* PDF EXTRACTION */
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let uploadedFile = null;
const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fileInput');

uploadZone.addEventListener('click', (e) => {
  if (!e.target.closest('#filePill') && !e.target.closest('#fileRm')) fileInput.click();
});
document.getElementById('browseBtn').addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') attachFile(f);
  else showGenError('Please drop a valid PDF file.');
});

fileInput.addEventListener('change', () => { if (fileInput.files[0]) attachFile(fileInput.files[0]); });

document.getElementById('fileRm').addEventListener('click', (e) => {
  e.stopPropagation();
  uploadedFile = null; fileInput.value = '';
  document.getElementById('filePill').classList.remove('show');
});

function attachFile(f) {
  uploadedFile = f;
  document.getElementById('pillName').textContent = f.name;
  document.getElementById('pillSize').textContent = fmtBytes(f.size);
  document.getElementById('filePill').classList.add('show');
  hideGenMsg();
}

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}

async function extractPdf(file, onProgress) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const arr = new Uint8Array(e.target.result);
        const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          onProgress && onProgress(Math.round(i / pdf.numPages * 45));
          const page = await pdf.getPage(i);
          const c = await page.getTextContent();
          text += c.items.map(s => s.str).join(' ') + '\n';
        }
        res(text.trim());
      } catch(err) { rej(err); }
    };
    reader.onerror = rej;
    reader.readAsArrayBuffer(file);
  });
}

/* CLAUDE API */
async function claudeJSON(prompt) {
  const resp = await fetch(`${API}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error || 'Generation failed (' + resp.status + ')');
  }
  return await resp.json();
}

function buildFcPrompt(content, count) {
  return `You are an expert educator. Generate exactly ${count} high-quality flashcards from the study material below.

Return ONLY a JSON array, no markdown, no explanation:
[{"question":"...","answer":"...","topic":"...","difficulty":"easy|medium|hard"}]

Rules:
- Questions test understanding, not just recall
- Answers are 1-3 sentences
- Vary difficulty; vary topics if content is broad

Study material:
${content.slice(0, 11000)}`;
}

function buildQuizPrompt(content, count) {
  return `You are an expert educator. Generate exactly ${count} multiple-choice quiz questions from the study material below.

Return ONLY a JSON array, no markdown, no explanation:
[{
  "question": "...",
  "choices": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct": 0,
  "explanation": "Brief explanation of correct answer",
  "topic": "Short topic label",
  "difficulty": "easy|medium|hard"
}]

Rules:
- "correct" is the zero-based index of the correct choice
- All 4 choices must be plausible
- Questions test understanding
- Vary difficulty and topics

Study material:
${content.slice(0, 11000)}`;
}

/* GENERATE */
document.getElementById('generateBtn').addEventListener('click', runGenerate);

async function runGenerate() {
  const notes   = document.getElementById('notesInput').value.trim();
  const doFC    = document.getElementById('genFlashcards').checked;
  const doQuiz  = document.getElementById('genQuiz').checked;
  const fcCount = parseInt(document.getElementById('fcCount').value) || 8;
  const qCount  = parseInt(document.getElementById('qCount').value)  || 6;
  const title   = document.getElementById('sessionTitle').value.trim() || 'Untitled Session';

  if (!uploadedFile && !notes) { showGenError('Please upload a PDF or paste your notes first.'); return; }
  if (!doFC && !doQuiz) { showGenError('Select at least one output type.'); return; }

  const btn = document.getElementById('generateBtn');
  btn.disabled = true; btn.classList.add('loading');
  hideGenMsg(); showGenStatus('Starting…', 0);

  try {
    let content = notes;
    if (uploadedFile) {
      setGenStatus('Extracting PDF text…');
      const pdf = await extractPdf(uploadedFile, p => setGenProg(p));
      content = pdf || notes;
      if (!content) throw new Error('Could not extract text. Try pasting notes.');
    }

    let fcSet = null, quiz = null;

    if (doFC) {
      setGenStatus('Generating flashcards…'); setGenProg(55);
      const cards = await claudeJSON(buildFcPrompt(content, fcCount));
      if (!Array.isArray(cards) || !cards.length) throw new Error('No flashcards returned.');
      fcSet = { title, cards, source: uploadedFile?.name || 'pasted notes' };
      await DB.saveSet(fcSet);
    }

    if (doQuiz) {
      setGenStatus('Generating quiz questions…'); setGenProg(78);
      const questions = await claudeJSON(buildQuizPrompt(content, qCount));
      if (!Array.isArray(questions) || !questions.length) throw new Error('No quiz questions returned.');
      quiz = { title, questions, source: uploadedFile?.name || 'pasted notes' };
      quiz = await DB.saveQuiz(quiz);
    }

    setGenProg(100); setGenStatus('Done!');
    await sleep(400); hideGenMsg();

    const parts = [];
    if (fcSet)  parts.push(`<strong>${fcSet.cards?.length || fcCount}</strong> flashcards`);
    if (quiz)   parts.push(`<strong>${quiz.questions?.length || qCount}</strong> quiz questions`);
    showGenSuccess(`Created ${parts.join(' and ')} for "<em>${esc(title)}</em>". `
      + `<a href="#" onclick="event.preventDefault();${fcSet ? "nav('flashcards')" : "nav('quizzes')"}" style="color:var(--yellow);text-decoration:underline">View now →</a>`);

    updateBadges();
    document.getElementById('notesInput').value = '';
    document.getElementById('sessionTitle').value = '';
    uploadedFile = null; fileInput.value = '';
    document.getElementById('filePill').classList.remove('show');

  } catch(err) {
    hideGenMsg();
    showGenError(err.message || 'Generation failed. Please try again.');
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

/* DASHBOARD */
async function renderDashboard() {
  const sets     = await DB.getSets();
  const attempts = await DB.getAttempts();

  document.getElementById('stat-sets').textContent = sets.length;
  document.getElementById('stat-quizzes-taken').textContent = attempts.length;

  const scores = attempts.map(a => a.score);
  const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
  document.getElementById('stat-avg-score').textContent = avg !== null ? avg + '%' : '—';

  const best = scores.length ? Math.max(...scores) : null;
  document.getElementById('stat-best-grade').textContent = best !== null ? getGrade(best) : '—';

  const chart = document.getElementById('trend-chart');
  const recent = attempts.slice(0, 7).reverse();
  if (recent.length === 0) {
    chart.innerHTML = `<div class="empty-state" style="padding:10px;width:100%;font-size:.8rem">No quiz attempts yet.</div>`;
  } else {
    const maxS = Math.max(...recent.map(a => a.score), 100);
    chart.innerHTML = recent.map(a => {
      const h = Math.max(8, Math.round((a.score / maxS) * 72));
      const clr = a.score >= 80 ? 'var(--easy)' : a.score >= 60 ? 'var(--medium)' : 'var(--coral)';
      return `<div class="bar-col"><div class="bar-fill" style="height:${h}px;background:${clr}" title="${a.score}%"></div><div class="bar-lbl">${a.score}%</div></div>`;
    }).join('');
    document.getElementById('trend-label').textContent = `Last ${recent.length} attempt${recent.length!==1?'s':''}`;
  }

  const allCards = sets.flatMap(s => Array.isArray(s.cards) ? s.cards : []);
  const diffCounts = { easy:0, medium:0, hard:0 };
  allCards.forEach(c => { const d = c.difficulty || 'medium'; if(diffCounts[d]!==undefined) diffCounts[d]++; });
  const total = allCards.length || 1;

  const rings = document.getElementById('diff-rings');
  if (!allCards.length) {
    rings.innerHTML = `<div class="empty-state" style="padding:10px;font-size:.8rem">Generate some flashcards first.</div>`;
  } else {
    rings.innerHTML = Object.entries(diffCounts).map(([d, n]) => {
      const pct = Math.round(n / total * 100);
      const clr = d === 'easy' ? 'var(--easy)' : d === 'medium' ? 'var(--medium)' : 'var(--coral)';
      const circ = 2 * Math.PI * 22;
      const dash = circ - (pct / 100) * circ;
      return `<div style="text-align:center">
        <svg class="ring-svg" width="64" height="64" viewBox="0 0 56 56">
          <circle class="ring-track" cx="28" cy="28" r="22"/>
          <circle class="ring-prog" cx="28" cy="28" r="22" stroke="${clr}" stroke-dasharray="${circ}" stroke-dashoffset="${dash}" transform="rotate(-90 28 28)"/>
          <text x="28" y="33" text-anchor="middle" fill="var(--text)" font-size="11" font-family="Syne,sans-serif" font-weight="700">${pct}%</text>
        </svg>
        <div style="font-size:.72rem;font-weight:600;text-transform:capitalize;color:var(--muted2);margin-top:4px">${d}</div>
        <div style="font-size:.68rem;color:var(--muted)">${n} cards</div>
      </div>`;
    }).join('');
  }

  const recent5 = attempts.slice(0, 5);
  const dashR = document.getElementById('dash-recent');
  if (!recent5.length) {
    dashR.innerHTML = `<div class="empty-state" style="padding:20px"><p>No activity yet. Generate flashcards or take a quiz!</p></div>`;
  } else {
    dashR.innerHTML = `<table class="history-table"><thead><tr><th>Quiz</th><th>Date</th><th>Score</th><th>Grade</th></tr></thead><tbody>
      ${recent5.map(a => `<tr>
        <td style="font-weight:500">${esc(a.quizTitle || 'Quiz')}</td>
        <td style="color:var(--muted)">${fmtDate(a.createdAt)}</td>
        <td>${a.score}%</td>
        <td><div class="score-circle grade-${getGrade(a.score)}" style="width:32px;height:32px;font-size:.7rem">${getGrade(a.score)}</div></td>
      </tr>`).join('')}
    </tbody></table>`;
  }
}

/* FLASHCARD SETS LIST */
async function renderFlashcardSets() {
  const sets = await DB.getSets();
  const el = document.getElementById('fc-sets-list');

  if (!sets.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/></svg></div><h3>No flashcard sets yet</h3><p>Generate one from the Generate page.</p></div>`;
    return;
  }

  el.innerHTML = `<div class="quiz-list">${sets.map(s => `
    <div class="quiz-list-item">
      <div class="qli-icon" style="background:rgba(240,224,64,.08);border:1px solid rgba(240,224,64,.15)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f0e040" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M8 10h8M8 14h5"/></svg>
      </div>
      <div class="qli-info">
        <div class="qli-title">${esc(s.title)}</div>
        <div class="qli-meta">${Array.isArray(s.cards) ? s.cards.length : 0} cards · ${fmtDate(s.createdAt)} · ${esc(s.source || '')}</div>
      </div>
      <div class="qli-actions">
        <span class="pill pill-yellow" style="font-size:.68rem">${diffLabel(Array.isArray(s.cards) ? s.cards : [])}</span>
        <button class="btn btn-ghost" style="font-size:.78rem;padding:7px 12px" onclick="viewFcSet(${s.id})">Study →</button>
        <button class="btn btn-danger" style="font-size:.78rem;padding:7px 10px" onclick="deleteSet(${s.id})">✕</button>
      </div>
    </div>`).join('')}</div>`;
}

async function viewFcSet(id) {
  const sets = await DB.getSets();
  const set = sets.find(s => s.id === id);
  if (!set) return;

  document.getElementById('fc-viewer-title').textContent = set.title;
  document.getElementById('fc-viewer-meta').textContent = `${Array.isArray(set.cards) ? set.cards.length : 0} cards · ${fmtDate(set.createdAt)}`;

  const grid = document.getElementById('fc-viewer-grid');
  const cards = Array.isArray(set.cards) ? set.cards : [];
  grid.innerHTML = cards.map((c, i) => `
    <div class="fc" id="fc-${i}" style="animation-delay:${i*.055}s">
      <div class="fc-inner">
        <div class="fc-front">
          <div>
            <div class="fc-label">Question</div>
            <div class="fc-text">${esc(c.question)}</div>
          </div>
          <div class="fc-meta">
            <span class="pill pill-yellow" style="font-size:.65rem">${esc(c.topic||'General')}</span>
            <span class="fc-hint">tap to flip →</span>
          </div>
        </div>
        <div class="fc-back">
          <div>
            <div class="fc-label">Answer</div>
            <div class="fc-text">${esc(c.answer)}</div>
          </div>
          <div class="fc-meta">
            <span class="pill pill-${c.difficulty||'medium'}">${c.difficulty||'medium'}</span>
            <span class="fc-hint">← tap to flip</span>
          </div>
        </div>
      </div>
    </div>`).join('');

  grid.querySelectorAll('.fc').forEach(el => el.addEventListener('click', () => el.classList.toggle('flipped')));
  nav('fc-viewer');
}

async function deleteSet(id) {
  if (!confirm('Delete this flashcard set?')) return;
  await DB.deleteSet(id);
  renderFlashcardSets();
  updateBadges();
}

function diffLabel(cards) {
  const counts = {easy:0,medium:0,hard:0};
  cards.forEach(c => { const d=c.difficulty||'medium'; if(counts[d]!==undefined)counts[d]++; });
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  return top ? top[0] : 'mixed';
}

/* QUIZ LIST */
async function renderQuizList() {
  const quizzes = await DB.getQuizzes();
  const el = document.getElementById('quiz-list-container');

  if (!quizzes.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg></div><h3>No quizzes yet</h3><p>Generate one from the Generate page.</p></div>`;
    return;
  }

  const items = await Promise.all(quizzes.map(async q => {
    const attempts = await DB.getAttemptsForQuiz(q.id);
    const best = attempts.length ? Math.max(...attempts.map(a=>a.score)) : null;
    const qCount = Array.isArray(q.questions) ? q.questions.length : 0;
    return `<div class="quiz-list-item">
      <div class="qli-icon" style="background:rgba(61,232,200,.08);border:1px solid rgba(61,232,200,.15)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3de8c8" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>
      </div>
      <div class="qli-info">
        <div class="qli-title">${esc(q.title)}</div>
        <div class="qli-meta">${qCount} questions · ${fmtDate(q.createdAt)} · ${attempts.length} attempt${attempts.length!==1?'s':''}</div>
      </div>
      <div class="qli-actions">
        ${best !== null ? `<span class="pill pill-teal" style="font-size:.68rem">Best: ${best}%</span>` : ''}
        <button class="btn btn-teal" style="font-size:.78rem;padding:7px 12px" onclick="startQuiz(${q.id})">Take Quiz →</button>
        <button class="btn btn-danger" style="font-size:.78rem;padding:7px 10px" onclick="deleteQuiz(${q.id})">✕</button>
      </div>
    </div>`;
  }));
  el.innerHTML = items.join('');
}

async function deleteQuiz(id) {
  if (!confirm('Delete this quiz?')) return;
  await DB.deleteQuiz(id);
  renderQuizList();
  updateBadges();
}

/* QUIZ PLAYER */
let quizState = null;

async function startQuiz(quizId) {
  const quiz = await DB.getQuizById(quizId);
  if (!quiz) return;

  quizState = {
    quiz,
    current: 0,
    answers: new Array(quiz.questions.length).fill(null),
    startTime: Date.now(),
    answered: new Array(quiz.questions.length).fill(false),
  };

  nav('quiz-player');
  renderQuestion();
}

function renderQuestion() {
  const { quiz, current, answers } = quizState;
  const q = quiz.questions[current];
  const total = quiz.questions.length;
  const progPct = Math.round(current / total * 100);
  const answered = quizState.answered[current];

  const inner = document.getElementById('quiz-player-inner');
  inner.innerHTML = `
    <div class="quiz-shell">
      <div style="margin-bottom:12px">
        <button class="btn btn-ghost" style="font-size:.78rem;padding:6px 10px" onclick="confirmQuit()">← Exit Quiz</button>
      </div>
      <div class="quiz-progress-hdr">
        <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem;color:var(--muted2)">Q${current+1}</span>
        <div class="qp-bar-wrap"><div class="qp-bar-fill" style="width:${progPct}%"></div></div>
        <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem;color:var(--muted2)">${current+1}/${total}</span>
      </div>
      <div class="q-card">
        <div class="q-number">
          Question ${current+1} of ${total}
          <span class="pill pill-${q.difficulty||'medium'}" style="margin-left:8px">${q.difficulty||'medium'}</span>
          <span class="pill pill-muted" style="margin-left:6px">${esc(q.topic||'General')}</span>
        </div>
        <div class="q-text">${esc(q.question)}</div>
        <div class="choices" id="choices-wrap">
          ${q.choices.map((ch, i) => `
            <button class="choice ${answered && answers[current]===i ? (i===q.correct?'correct':'wrong') : ''} ${answered && i===q.correct && answers[current]!==i ? 'correct' : ''}"
              ${answered ? 'disabled' : ''}
              onclick="selectChoice(${i})">
              <span class="choice-letter">${'ABCD'[i]}</span>
              <span>${esc(ch.replace(/^[A-D]\)\s*/,''))}</span>
            </button>`).join('')}
        </div>
        <div class="q-feedback ${answered ? 'show' : ''} ${answered ? (answers[current]===q.correct ? 'correct' : 'wrong') : ''}" id="q-feedback">
          ${answered ? (answers[current]===q.correct
            ? '✓ Correct! ' + esc(q.explanation||'')
            : '✗ Incorrect. ' + esc(q.explanation||'')) : ''}
        </div>
      </div>
      <div class="quiz-nav">
        <button class="btn btn-ghost" ${current===0?'disabled':''} onclick="prevQuestion()">← Previous</button>
        <div style="display:flex;gap:6px">
          ${quiz.questions.map((_,i) => `<div style="width:8px;height:8px;border-radius:50%;background:${quizState.answered[i]?(quizState.answers[i]===quiz.questions[i].correct?'var(--easy)':'var(--coral)'):'var(--border2)'}"></div>`).join('')}
        </div>
        ${current < total-1
          ? `<button class="btn btn-primary" onclick="nextQuestion()">Next →</button>`
          : `<button class="btn btn-primary" ${!quizState.answered[current]?'disabled':''} onclick="finishQuiz()">Finish Quiz ✓</button>`}
      </div>
    </div>`;
}

function selectChoice(idx) {
  if (quizState.answered[quizState.current]) return;
  quizState.answers[quizState.current] = idx;
  quizState.answered[quizState.current] = true;
  renderQuestion();
}
function nextQuestion() { if (quizState.current < quizState.quiz.questions.length - 1) { quizState.current++; renderQuestion(); } }
function prevQuestion() { if (quizState.current > 0) { quizState.current--; renderQuestion(); } }
function confirmQuit() { if (confirm('Exit quiz? Your progress will be lost.')) nav('quizzes'); }

async function finishQuiz() {
  const { quiz, answers, startTime } = quizState;
  const correct = answers.filter((a, i) => a === quiz.questions[i].correct).length;
  const score = Math.round(correct / quiz.questions.length * 100);
  const timeSec = Math.round((Date.now() - startTime) / 1000);
  const grade = getGrade(score);

  await DB.saveAttempt({ quizId: quiz.id, score, total: quiz.questions.length, answers, timeSec });
  updateBadges();

  const gradeClr = score>=90?'var(--easy)':score>=80?'var(--teal)':score>=70?'var(--yellow)':score>=60?'var(--medium)':'var(--coral)';
  document.getElementById('resultsModalContent').innerHTML = `
    <div class="results-card" style="border:none;padding:0">
      <div style="font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:20px">Quiz Complete</div>
      <div style="margin:0 auto 16px">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surf2)" stroke-width="10"/>
          <circle cx="60" cy="60" r="52" fill="none" stroke="${gradeClr}" stroke-width="10"
            stroke-linecap="round"
            stroke-dasharray="${2*Math.PI*52}"
            stroke-dashoffset="${2*Math.PI*52 * (1 - score/100)}"
            transform="rotate(-90 60 60)"
            style="transition:stroke-dashoffset .8s ease"/>
          <text x="60" y="58" text-anchor="middle" fill="var(--text)" font-size="28" font-family="Syne,sans-serif" font-weight="800">${grade}</text>
          <text x="60" y="76" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="DM Sans,sans-serif">${score}%</text>
        </svg>
      </div>
      <div style="font-family:'DM Serif Display',serif;font-size:1.4rem;margin-bottom:6px">${esc(quiz.title)}</div>
      <div class="results-breakdown">
        <div class="rb-item"><div class="rb-val" style="color:var(--easy)">${correct}</div><div class="rb-lbl">Correct</div></div>
        <div class="rb-item"><div class="rb-val" style="color:var(--coral)">${quiz.questions.length - correct}</div><div class="rb-lbl">Incorrect</div></div>
        <div class="rb-item"><div class="rb-val">${fmtTime(timeSec)}</div><div class="rb-lbl">Time</div></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="closeResults();startQuiz(${quiz.id})">Retake Quiz</button>
        <button class="btn btn-primary" onclick="closeResults();nav('history')">View History →</button>
      </div>
    </div>`;
  document.getElementById('resultsModal').classList.add('show');
}

function closeResults() {
  document.getElementById('resultsModal').classList.remove('show');
  nav('quizzes');
}

document.getElementById('resultsModal').addEventListener('click', e => {
  if (e.target === document.getElementById('resultsModal')) closeResults();
});

/* HISTORY */
async function renderHistory() {
  const attempts = await DB.getAttempts();
  const tbody = document.getElementById('history-tbody');
  const empty = document.getElementById('history-empty');

  if (!attempts.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    document.querySelector('#history-table thead').style.display = 'none';
    return;
  }

  document.querySelector('#history-table thead').style.display = '';
  empty.style.display = 'none';

  tbody.innerHTML = attempts.map(a => {
    const grade = getGrade(a.score);
    return `<tr>
      <td style="font-weight:500;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.quizTitle || 'Quiz')}</td>
      <td style="color:var(--muted);white-space:nowrap">${fmtDate(a.createdAt)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;max-width:80px;height:4px;background:var(--surf2);border-radius:100px;overflow:hidden">
            <div style="height:100%;width:${a.score}%;background:${a.score>=80?'var(--easy)':a.score>=60?'var(--medium)':'var(--coral)'};border-radius:100px"></div>
          </div>
          <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem">${a.score}%</span>
        </div>
      </td>
      <td><div class="score-circle grade-${grade}">${grade}</div></td>
      <td style="color:var(--muted)">${fmtTime(a.timeSec || 0)}</td>
    </tr>`;
  }).join('');
}

/* BADGES + HELPERS */
async function updateBadges() {
  const [sets, quizzes, attempts] = await Promise.all([DB.getSets(), DB.getQuizzes(), DB.getAttempts()]);
  document.getElementById('nb-flashcards').textContent = sets.length;
  document.getElementById('nb-quizzes').textContent    = quizzes.length;
  document.getElementById('nb-history').textContent    = attempts.length;
}

function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function fmtTime(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec/60);
  const s = sec%60;
  return m>0 ? `${m}m ${s}s` : `${s}s`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function showGenStatus(txt, prog) {
  document.getElementById('genStatus').classList.add('show');
  setGenStatus(txt); setGenProg(prog||0);
}
function setGenStatus(t) { document.getElementById('statusText').textContent = t; }
function setGenProg(p)   { document.getElementById('progFill').style.width = p + '%'; }
function hideGenMsg() {
  document.getElementById('genStatus').classList.remove('show');
  document.getElementById('genError').classList.remove('show');
  document.getElementById('genSuccess').classList.remove('show');
}
function showGenError(msg) {
  hideGenMsg();
  document.getElementById('errorText').textContent = msg;
  document.getElementById('genError').classList.add('show');
}
function showGenSuccess(html) {
  document.getElementById('successText').innerHTML = html;
  document.getElementById('genSuccess').classList.add('show');
}

/* BOOT */
updateBadges();
renderDashboard();