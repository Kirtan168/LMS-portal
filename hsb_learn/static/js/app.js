/**
 * HSB Learn - AI-Powered MBA Learning Management System
 * Core Client-side SPA Controller
 */

// Global Application State
const state = {
  currentView: 'dashboard',
  terms: [],
  subjects: [],
  currentTermId: null,
  currentSubjectId: null,
  currentSubjectData: null,
  allMaterials: [],
  allNotes: [],
  allQuizzes: [],
  allAssignments: [],
  // Quiz Runner State
  activeQuiz: null,
  quizCurrentIndex: 0,
  quizAnswers: {},
  quizTimerInterval: null,
  quizSeconds: 0,
  // Note Reader State
  currentNote: null,
  noteEditMode: false,
  noteSplitSource: false,
  // Settings
  settings: {}
};

// Initialize App on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  await loadSettings();
  await refreshGlobalData();
  await navigateTo('dashboard');
  setupNotifications();
  checkOnboarding();
});

// =========================================================================
// API CLIENT HELPERS
// =========================================================================

async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(endpoint, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'API request failed');
    }
    return await res.json();
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  }
}

// Refresh cached lists of terms and subjects
async function refreshGlobalData() {
  try {
    state.terms = await apiFetch('/api/terms');
    state.subjects = await apiFetch('/api/subjects');

    if (state.terms.length > 0 && !state.currentTermId) {
      const active = state.terms.find(t => t.is_active) || state.terms[0];
      state.currentTermId = active.id;
    }
    populateGlobalDropdowns();
  } catch (e) {
    console.error('Error refreshing global data', e);
  }
}

// =========================================================================
// NAVIGATION & VIEW CONTROLLER
// =========================================================================

async function navigateTo(viewName, params = {}) {
  state.currentView = viewName;

  // Hide all views
  const viewSections = [
    'dashboard', 'terms-subjects', 'subject-workspace',
    'materials', 'notes', 'quizzes', 'assignments', 'settings'
  ];

  viewSections.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add('hidden');
    const btn = document.getElementById(`nav-btn-${v}`);
    if (btn) {
      btn.className = "nav-item w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-slate-400 hover:text-white hover:bg-slate-800/60";
    }
  });

  // Activate target view
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.remove('hidden');

  const activeNavBtn = document.getElementById(`nav-btn-${viewName}`);
  if (activeNavBtn) {
    activeNavBtn.className = "nav-item w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-white bg-brand-600/20 text-brand-400 border border-brand-500/20";
  }

  // Update Header Title & Breadcrumbs
  updateHeader(viewName, params);

  // Load View Data
  switch (viewName) {
    case 'dashboard':
      await loadDashboard();
      break;
    case 'terms-subjects':
      await loadTermsAndSubjects();
      break;
    case 'subject-workspace':
      if (params.subjectId) state.currentSubjectId = params.subjectId;
      await loadSubjectWorkspace(state.currentSubjectId);
      break;
    case 'materials':
      await loadMaterialsHub();
      break;
    case 'notes':
      await loadNotesHub();
      break;
    case 'quizzes':
      await loadQuizzesHub();
      break;
    case 'assignments':
      await loadAssignmentsHub();
      break;
    case 'settings':
      await populateSettingsForm();
      break;
  }

  lucide.createIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateHeader(viewName, params) {
  const titles = {
    'dashboard': 'Academic Dashboard',
    'terms-subjects': 'My Terms & MBA Subjects',
    'subject-workspace': 'Subject Workspace',
    'materials': 'Study Materials Repository',
    'notes': 'AI Revision Notes Hub',
    'quizzes': 'Quiz Centre & Assessments',
    'assignments': 'Assignment & Deadline Tracker',
    'settings': 'Settings & AI Configuration'
  };

  const titleEl = document.getElementById('header-page-title');
  const breadcrumbsEl = document.getElementById('header-breadcrumbs');

  if (titleEl) titleEl.innerHTML = `<span>${titles[viewName] || 'HSB Learn'}</span>`;

  if (breadcrumbsEl) {
    if (viewName === 'subject-workspace' && state.currentSubjectData) {
      breadcrumbsEl.innerHTML = `
        <span>HSB Learn</span>
        <span>/</span>
        <span onclick="navigateTo('terms-subjects')" class="cursor-pointer hover:underline">Terms</span>
        <span>/</span>
        <span class="text-brand-600 font-medium">${state.currentSubjectData.name}</span>
      `;
    } else {
      breadcrumbsEl.innerHTML = `
        <span>HSB Learn</span>
        <span>/</span>
        <span class="text-brand-600 font-medium">${titles[viewName] || viewName}</span>
      `;
    }
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  sidebar.classList.toggle('hidden');
}

function toggleQuickActionMenu() {
  const dropdown = document.getElementById('quick-action-dropdown');
  dropdown.classList.toggle('hidden');
}

// Close quick action menu on outside click
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('quick-action-dropdown');
  if (dropdown && !dropdown.contains(e.target) && !e.target.closest('button[onclick*="toggleQuickActionMenu"]')) {
    dropdown.classList.add('hidden');
  }
});

// =========================================================================
// 1. DASHBOARD
// =========================================================================

async function loadDashboard() {
  try {
    const data = await apiFetch('/api/dashboard/stats');
    const { metrics, upcoming_assignments, recent_materials, recent_notes, recent_quizzes, terms } = data;

    // Metrics
    document.getElementById('metric-subjects').innerText = metrics.total_subjects;
    document.getElementById('metric-materials').innerText = metrics.total_materials;
    document.getElementById('metric-assignments').innerText = upcoming_assignments.length;
    document.getElementById('metric-quiz-score').innerText = `${metrics.quiz_avg_score}%`;
    document.getElementById('metric-quiz-attempts').innerText = `${metrics.quiz_attempts} attempts made`;

    if (metrics.overdue_assignments > 0) {
      document.getElementById('metric-overdue-tag').innerText = `(${metrics.overdue_assignments} overdue)`;
      document.getElementById('deadline-bell-badge').classList.remove('hidden');
    } else {
      document.getElementById('metric-overdue-tag').innerText = 'All up to date';
      document.getElementById('deadline-bell-badge').classList.add('hidden');
    }

    // Courses Grid
    const subjectGrid = document.getElementById('dash-subject-grid');
    subjectGrid.innerHTML = '';
    
    // Flatten subjects from terms
    const allSubjects = [];
    terms.forEach(t => {
      (t.subjects || []).forEach(s => allSubjects.push({ ...s, term_name: t.name }));
    });

    if (allSubjects.length === 0) {
      subjectGrid.innerHTML = `<p class="text-xs text-slate-500 col-span-2 py-4">No subjects added yet. Click 'Add Subject' to get started.</p>`;
    } else {
      allSubjects.slice(0, 4).forEach(subj => {
        const card = document.createElement('div');
        card.className = "bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-brand-300 transition-all cursor-pointer group flex flex-col justify-between";
        card.onclick = () => openSubjectWorkspace(subj.id);

        card.innerHTML = `
          <div>
            <div class="flex items-center justify-between mb-3">
              <span class="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-${subj.color || 'indigo'}-50 text-${subj.color || 'indigo'}-700 border border-${subj.color || 'indigo'}-200">
                ${subj.code || 'MBA'}
              </span>
              <span class="text-[11px] font-medium text-slate-400">${subj.term_name}</span>
            </div>
            <h4 class="text-sm font-bold text-slate-900 group-hover:text-brand-600 transition-colors">${subj.name}</h4>
            <p class="text-xs text-slate-500 mt-1 line-clamp-2">${subj.description || 'No description available.'}</p>
          </div>
          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>${subj.credits} Credits</span>
            <span class="text-brand-600 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center space-x-1">
              <span>Open Workspace</span>
              <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </span>
          </div>
        `;
        subjectGrid.appendChild(card);
      });
    }

    // Deadlines List
    const deadlineList = document.getElementById('dash-deadline-list');
    deadlineList.innerHTML = '';
    if (upcoming_assignments.length === 0) {
      deadlineList.innerHTML = `<p class="text-xs text-slate-500 py-3 text-center">No pending assignments. You're all caught up! 🎉</p>`;
    } else {
      upcoming_assignments.slice(0, 4).forEach(a => {
        const due = formatDueDate(a.due_date);
        const item = document.createElement('div');
        item.className = "p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/60 transition-all flex items-start justify-between gap-3";
        item.innerHTML = `
          <div class="min-w-0 flex-1">
            <div class="flex items-center space-x-1.5 mb-1">
              <span class="w-2 h-2 rounded-full ${getPriorityDotClass(a.priority)}"></span>
              <span class="text-[10px] font-bold text-slate-500 uppercase">${a.subject_name}</span>
            </div>
            <h5 class="text-xs font-bold text-slate-900 truncate">${a.title}</h5>
            <div class="flex items-center space-x-2 mt-1">
              <span class="text-[11px] font-medium ${due.isOverdue ? 'text-rose-600 font-bold' : 'text-slate-500'} flex items-center space-x-1">
                <i data-lucide="clock" class="w-3 h-3"></i>
                <span>${due.text}</span>
              </span>
            </div>
          </div>
          <button onclick="toggleAssignmentStatus(${a.id})" class="text-slate-400 hover:text-emerald-600 p-1 rounded-lg" title="Mark Done">
            <i data-lucide="circle" class="w-4 h-4"></i>
          </button>
        `;
        deadlineList.appendChild(item);
      });
    }

    // Recent Notes
    const recentNotesContainer = document.getElementById('dash-recent-notes');
    recentNotesContainer.innerHTML = '';
    if (recent_notes.length === 0) {
      recentNotesContainer.innerHTML = `<p class="text-xs text-slate-500 py-2">No revision notes generated yet.</p>`;
    } else {
      recent_notes.forEach(n => {
        const div = document.createElement('div');
        div.className = "p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/60 transition-all flex items-center justify-between cursor-pointer";
        div.onclick = () => openNoteViewer(n.id);
        div.innerHTML = `
          <div class="min-w-0 flex-1 mr-3">
            <span class="text-[10px] font-semibold text-brand-600 uppercase tracking-wider">${n.subject_name}</span>
            <h5 class="text-xs font-bold text-slate-900 truncate mt-0.5">${n.title}</h5>
          </div>
          <i data-lucide="arrow-right" class="w-4 h-4 text-slate-400"></i>
        `;
        recentNotesContainer.appendChild(div);
      });
    }

    // Recent Quizzes
    const recentQuizzesContainer = document.getElementById('dash-recent-quizzes');
    recentQuizzesContainer.innerHTML = '';
    if (recent_quizzes.length === 0) {
      recentQuizzesContainer.innerHTML = `<p class="text-xs text-slate-500 py-2">No quizzes created yet. Upload notes and click 'Generate Quiz'.</p>`;
    } else {
      recent_quizzes.forEach(q => {
        const div = document.createElement('div');
        div.className = "p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/60 transition-all flex items-center justify-between cursor-pointer";
        div.onclick = () => launchQuizRunner(q.id);
        div.innerHTML = `
          <div class="min-w-0 flex-1 mr-3">
            <div class="flex items-center space-x-2">
              <span class="text-[10px] font-semibold text-purple-600 uppercase tracking-wider">${q.subject_name}</span>
              <span class="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-medium">${q.difficulty}</span>
            </div>
            <h5 class="text-xs font-bold text-slate-900 truncate mt-0.5">${q.title}</h5>
          </div>
          <span class="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 text-xs font-bold flex items-center space-x-1">
            <i data-lucide="play" class="w-3 h-3"></i>
            <span>Take</span>
          </span>
        `;
        recentQuizzesContainer.appendChild(div);
      });
    }

    lucide.createIcons();
  } catch (e) {
    console.error('Error loading dashboard stats', e);
  }
}

// =========================================================================
// 2. MY TERMS & SUBJECTS
// =========================================================================

async function loadTermsAndSubjects() {
  await refreshGlobalData();
  renderTermPills();
  renderTermSubjects();
}

function renderTermPills() {
  const container = document.getElementById('terms-pill-container');
  container.innerHTML = '';

  state.terms.forEach(t => {
    const isSelected = (t.id === state.currentTermId);
    const pill = document.createElement('button');
    pill.className = `px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-2 ${
      isSelected 
        ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/20' 
        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
    }`;
    pill.onclick = () => selectTerm(t.id);
    pill.innerHTML = `
      <span>${t.name}</span>
      <span class="px-1.5 py-0.2 rounded-full text-[10px] ${isSelected ? 'bg-brand-700 text-brand-100' : 'bg-slate-100 text-slate-500'} font-semibold">
        ${t.subject_count || 0}
      </span>
    `;
    container.appendChild(pill);
  });
}

async function selectTerm(termId) {
  state.currentTermId = termId;
  renderTermPills();
  await renderTermSubjects();
}

async function renderTermSubjects() {
  const currentTerm = state.terms.find(t => t.id === state.currentTermId);
  if (!currentTerm) return;

  document.getElementById('current-term-name').innerText = currentTerm.name;
  document.getElementById('current-term-year').innerText = `Academic Year: ${currentTerm.academic_year || '2026-2027'}`;
  
  const statusBadge = document.getElementById('current-term-status');
  if (currentTerm.is_active) {
    statusBadge.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200";
    statusBadge.innerText = "Active Term";
  } else {
    statusBadge.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200";
    statusBadge.innerText = "Upcoming";
  }

  const container = document.getElementById('term-subjects-grid');
  container.innerHTML = '<p class="text-xs text-slate-500 col-span-3 py-4">Loading subjects...</p>';

  const subjects = await apiFetch(`/api/subjects?term_id=${currentTerm.id}`);
  container.innerHTML = '';

  if (subjects.length === 0) {
    container.innerHTML = `
      <div class="col-span-3 bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center space-y-3">
        <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
          <i data-lucide="book-plus" class="w-6 h-6"></i>
        </div>
        <h4 class="text-sm font-bold text-slate-800">No subjects in ${currentTerm.name} yet</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">Add your MBA subjects for this term to start uploading lecture notes and generating quizzes.</p>
        <button onclick="openNewSubjectModal(${currentTerm.id})" class="px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 shadow-sm">
          + Add First Subject
        </button>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  subjects.forEach(s => {
    const card = document.createElement('div');
    card.className = "bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group";
    card.innerHTML = `
      <div class="p-5 space-y-3">
        <div class="flex items-center justify-between">
          <span class="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-${s.color || 'indigo'}-50 text-${s.color || 'indigo'}-700 border border-${s.color || 'indigo'}-200">
            ${s.code || 'MBA'}
          </span>
          <div class="flex items-center space-x-1">
            <button onclick="event.stopPropagation(); openEditSubjectModal(${s.id})" class="p-1 text-slate-400 hover:text-slate-700 rounded-lg" title="Edit Subject">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="event.stopPropagation(); deleteSubject(${s.id})" class="p-1 text-slate-400 hover:text-rose-600 rounded-lg" title="Delete Subject">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <div>
          <h4 class="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors">${s.name}</h4>
          <p class="text-xs text-slate-500 mt-0.5">${s.instructor || 'Instructor not specified'} • ${s.credits} Credits</p>
          <p class="text-xs text-slate-600 mt-2 line-clamp-2">${s.description || 'No description provided.'}</p>
        </div>

        <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
          <div class="p-1.5 bg-slate-50 rounded-lg">
            <span class="block text-xs font-bold text-slate-900">${s.materials_count || 0}</span>
            <span class="text-[10px] text-slate-400 font-medium">Docs</span>
          </div>
          <div class="p-1.5 bg-slate-50 rounded-lg">
            <span class="block text-xs font-bold text-slate-900">${s.notes_count || 0}</span>
            <span class="text-[10px] text-slate-400 font-medium">Notes</span>
          </div>
          <div class="p-1.5 bg-slate-50 rounded-lg">
            <span class="block text-xs font-bold text-slate-900">${s.quizzes_count || 0}</span>
            <span class="text-[10px] text-slate-400 font-medium">Quizzes</span>
          </div>
        </div>
      </div>

      <div class="px-5 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
        <span class="text-[11px] font-semibold text-slate-500">
          ${s.assignments_count ? `<span class="text-amber-600 font-bold">${s.assignments_count} Pending Tasks</span>` : 'No pending tasks'}
        </span>
        <button onclick="openSubjectWorkspace(${s.id})" class="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-brand-500 hover:text-brand-600 text-slate-700 text-xs font-semibold flex items-center space-x-1 transition-all shadow-2xs">
          <span>Workspace</span>
          <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  lucide.createIcons();
}

// =========================================================================
// 3. SUBJECT DEDICATED WORKSPACE
// =========================================================================

async function openSubjectWorkspace(subjectId) {
  state.currentSubjectId = subjectId;
  await navigateTo('subject-workspace', { subjectId });
}

async function loadSubjectWorkspace(subjectId) {
  if (!subjectId) return;

  const subj = await apiFetch(`/api/subjects/${subjectId}`);
  state.currentSubjectData = subj;

  // Header info
  document.getElementById('ws-subject-code').innerText = subj.code || 'MBA';
  document.getElementById('ws-subject-term').innerText = subj.term_name || 'Term';
  document.getElementById('ws-subject-name').innerText = subj.name;
  document.getElementById('ws-subject-desc').innerText = subj.description || `${subj.instructor || 'Prof.'} • ${subj.credits} Credits`;

  // Badge counts
  document.getElementById('ws-count-materials').innerText = (subj.materials || []).length;
  document.getElementById('ws-count-notes').innerText = (subj.notes || []).length;
  document.getElementById('ws-count-quizzes').innerText = (subj.quizzes || []).length;
  document.getElementById('ws-count-assignments').innerText = (subj.assignments || []).length;
  document.getElementById('ws-mat-count-label').innerText = `${(subj.materials || []).length} items`;

  // Render Tabs
  renderWorkspaceMaterials(subj.materials || []);
  renderWorkspaceNotes(subj.notes || []);
  renderWorkspaceQuizzes(subj.quizzes || []);
  renderWorkspaceAssignments(subj.assignments || []);

  // Default to materials tab
  switchWorkspaceTab('materials');
  lucide.createIcons();
}

function switchWorkspaceTab(tabName) {
  const tabs = ['materials', 'notes', 'quizzes', 'assignments'];
  tabs.forEach(t => {
    const btn = document.getElementById(`ws-tab-${t}`);
    const content = document.getElementById(`ws-content-${t}`);
    if (t === tabName) {
      btn.className = "ws-tab px-4 py-2 rounded-xl text-xs font-bold transition-all bg-brand-50 text-brand-700 border border-brand-200";
      content.classList.remove('hidden');
    } else {
      btn.className = "ws-tab px-4 py-2 rounded-xl text-xs font-medium transition-all text-slate-600 hover:bg-slate-100";
      content.classList.add('hidden');
    }
  });
  lucide.createIcons();
}

function renderWorkspaceMaterials(materials) {
  const container = document.getElementById('ws-materials-table');
  container.innerHTML = '';

  if (materials.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-slate-500">No study materials uploaded for this subject yet. Upload PDF, DOCX, PPTX or TXT files above.</div>`;
    return;
  }

  materials.forEach(m => {
    const sizeKb = Math.round((m.file_size || 0) / 1024);
    const dateFormatted = new Date(m.upload_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const row = document.createElement('div');
    row.className = "p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3";

    row.innerHTML = `
      <div class="flex items-start space-x-3 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
          ${m.file_type || 'FILE'}
        </div>
        <div class="min-w-0">
          <h5 class="text-xs font-bold text-slate-900 truncate">${m.title}</h5>
          <p class="text-[11px] text-slate-500 mt-0.5">${m.file_name} • ${sizeKb} KB • Uploaded ${dateFormatted}</p>
        </div>
      </div>

      <div class="flex items-center space-x-1.5 self-end sm:self-center">
        <button onclick="viewExtractedText(${m.id})" class="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-600 text-xs font-medium flex items-center space-x-1" title="View Extracted Text">
          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          <span>View Text</span>
        </button>

        <button onclick="triggerMaterialNotesGeneration(${m.id})" class="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center space-x-1" title="Generate AI Short Notes">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          <span>Generate Notes</span>
        </button>

        <button onclick="openGenerateQuizModal(${state.currentSubjectId}, ${m.id})" class="px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold flex items-center space-x-1" title="Generate AI Quiz">
          <i data-lucide="help-circle" class="w-3.5 h-3.5"></i>
          <span>Quiz</span>
        </button>

        <a href="/api/materials/${m.id}/download" download class="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg" title="Download File">
          <i data-lucide="download" class="w-4 h-4"></i>
        </a>

        <button onclick="deleteMaterial(${m.id})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg" title="Delete File">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
    container.appendChild(row);
  });
}

function renderWorkspaceNotes(notes) {
  const container = document.getElementById('ws-notes-list');
  container.innerHTML = '';

  if (notes.length === 0) {
    container.innerHTML = `<div class="col-span-2 p-8 text-center text-xs text-slate-500 bg-white rounded-2xl border border-dashed border-slate-300">No revision notes generated yet. Click 'Generate New Notes' above.</div>`;
    return;
  }

  notes.forEach(n => {
    const card = document.createElement('div');
    card.className = "bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between";
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-md ${n.is_ai_generated ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'}">
            ${n.is_ai_generated ? '⚡ AI Synthesized' : '📝 Manual'}
          </span>
          <span class="text-[10px] text-slate-400">${new Date(n.updated_at).toLocaleDateString()}</span>
        </div>
        <h5 class="text-sm font-bold text-slate-900 line-clamp-1">${n.title}</h5>
        <div class="text-xs text-slate-600 mt-2 line-clamp-3 font-serif">
          ${n.content_markdown.replace(/[#*`>]/g, '').slice(0, 150)}...
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <button onclick="openNoteViewer(${n.id})" class="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm">
          <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
          <span>Read & Revise</span>
        </button>

        <div class="flex items-center space-x-1">
          <button onclick="deleteNote(${n.id})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg" title="Delete Note">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderWorkspaceQuizzes(quizzes) {
  const container = document.getElementById('ws-quizzes-list');
  container.innerHTML = '';

  if (quizzes.length === 0) {
    container.innerHTML = `<div class="col-span-2 p-8 text-center text-xs text-slate-500 bg-white rounded-2xl border border-dashed border-slate-300">No quizzes generated yet. Click 'Generate Quiz' above.</div>`;
    return;
  }

  quizzes.forEach(q => {
    const card = document.createElement('div');
    card.className = "bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between";
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">${q.difficulty}</span>
          <span class="text-xs font-mono text-slate-400">${q.num_questions} Questions</span>
        </div>
        <h5 class="text-sm font-bold text-slate-900">${q.title}</h5>
        <p class="text-xs text-slate-500 mt-1">${q.question_types || 'MCQs, True/False, Concept'}</p>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <button onclick="launchQuizRunner(${q.id})" class="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm">
          <i data-lucide="play" class="w-3.5 h-3.5"></i>
          <span>Start Quiz</span>
        </button>
        <button onclick="deleteQuiz(${q.id})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg" title="Delete Quiz">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderWorkspaceAssignments(assignments) {
  const container = document.getElementById('ws-assignments-list');
  container.innerHTML = '';

  if (assignments.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">No upcoming assignments for this subject.</div>`;
    return;
  }

  assignments.forEach(a => {
    const due = formatDueDate(a.due_date);
    const isDone = (a.status === 'Completed');
    const div = document.createElement('div');
    div.className = `p-4 rounded-2xl border ${isDone ? 'bg-slate-50/50 border-slate-200 opacity-60' : 'bg-white border-slate-200'} shadow-sm flex items-center justify-between gap-3`;
    div.innerHTML = `
      <div class="flex items-center space-x-3 min-w-0">
        <button onclick="toggleAssignmentStatus(${a.id})" class="text-slate-400 hover:text-emerald-600">
          <i data-lucide="${isDone ? 'check-circle' : 'circle'}" class="w-5 h-5 ${isDone ? 'text-emerald-500' : ''}"></i>
        </button>
        <div class="min-w-0">
          <h5 class="text-xs font-bold text-slate-900 ${isDone ? 'line-through text-slate-500' : ''} truncate">${a.title}</h5>
          <p class="text-[11px] text-slate-500 mt-0.5">${a.description || 'No description'}</p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <span class="text-xs font-semibold ${due.isOverdue && !isDone ? 'text-rose-600' : 'text-slate-500'}">${due.text}</span>
        <button onclick="deleteAssignment(${a.id})" class="p-1 text-slate-400 hover:text-rose-600">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
    container.appendChild(div);
  });
}

// =========================================================================
// 4. STUDY MATERIALS HUB
// =========================================================================

async function loadMaterialsHub() {
  await refreshGlobalData();
  state.allMaterials = await apiFetch('/api/materials');
  populateSubjectFilterSelect('mat-filter-subject');
  filterMaterialsHub();
}

function filterMaterialsHub() {
  const search = (document.getElementById('mat-filter-search')?.value || '').toLowerCase();
  const subjectId = document.getElementById('mat-filter-subject')?.value || '';
  const fileType = document.getElementById('mat-filter-type')?.value || '';

  const filtered = state.allMaterials.filter(m => {
    const matchSearch = !search || m.title.toLowerCase().includes(search) || m.file_name.toLowerCase().includes(search);
    const matchSubject = !subjectId || String(m.subject_id) === String(subjectId);
    const matchType = !fileType || m.file_type.toUpperCase() === fileType.toUpperCase();
    return matchSearch && matchSubject && matchType;
  });

  const container = document.getElementById('hub-materials-table');
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-xs text-slate-500">No documents match the active filters.</div>`;
    return;
  }

  filtered.forEach(m => {
    const sizeKb = Math.round((m.file_size || 0) / 1024);
    const dateFormatted = new Date(m.upload_date).toLocaleDateString();
    const row = document.createElement('div');
    row.className = "p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3";
    row.innerHTML = `
      <div class="flex items-start space-x-3 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
          ${m.file_type || 'DOC'}
        </div>
        <div class="min-w-0">
          <div class="flex items-center space-x-2">
            <span class="text-[10px] font-bold text-brand-600 uppercase tracking-wider">${m.subject_name}</span>
            <span class="text-slate-300">•</span>
            <span class="text-[10px] text-slate-400">${m.term_name}</span>
          </div>
          <h5 class="text-xs font-bold text-slate-900 truncate mt-0.5">${m.title}</h5>
          <p class="text-[11px] text-slate-500">${m.file_name} • ${sizeKb} KB • ${dateFormatted}</p>
        </div>
      </div>

      <div class="flex items-center space-x-2 self-end sm:self-center">
        <button onclick="viewExtractedText(${m.id})" class="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-white flex items-center space-x-1">
          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          <span>View Text</span>
        </button>
        <button onclick="triggerMaterialNotesGeneration(${m.id})" class="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold hover:bg-indigo-100 flex items-center space-x-1">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          <span>Notes</span>
        </button>
        <button onclick="openGenerateQuizModal(${m.subject_id}, ${m.id})" class="px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold hover:bg-purple-100 flex items-center space-x-1">
          <i data-lucide="help-circle" class="w-3.5 h-3.5"></i>
          <span>Quiz</span>
        </button>
        <a href="/api/materials/${m.id}/download" download class="p-1.5 text-slate-400 hover:text-slate-700">
          <i data-lucide="download" class="w-4 h-4"></i>
        </a>
        <button onclick="deleteMaterial(${m.id})" class="p-1.5 text-slate-400 hover:text-rose-600">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
    container.appendChild(row);
  });

  lucide.createIcons();
}

// =========================================================================
// 5. AI REVISION NOTES HUB
// =========================================================================

async function loadNotesHub(filterSubjectId = null) {
  state.allNotes = await apiFetch('/api/notes');
  renderNotesSubjectPills(filterSubjectId);
  renderNotesGrid(filterSubjectId);
}

function renderNotesSubjectPills(selectedSubjId) {
  const container = document.getElementById('notes-subject-filter-pills');
  container.innerHTML = '';

  const allPill = document.createElement('button');
  allPill.className = `px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
    !selectedSubjId ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
  }`;
  allPill.innerText = `All (${state.allNotes.length})`;
  allPill.onclick = () => loadNotesHub(null);
  container.appendChild(allPill);

  state.subjects.forEach(s => {
    const count = state.allNotes.filter(n => n.subject_id === s.id).length;
    if (count > 0) {
      const pill = document.createElement('button');
      const isSel = (String(selectedSubjId) === String(s.id));
      pill.className = `px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
        isSel ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
      }`;
      pill.innerText = `${s.name} (${count})`;
      pill.onclick = () => loadNotesHub(s.id);
      container.appendChild(pill);
    }
  });
}

function renderNotesGrid(filterSubjectId) {
  const container = document.getElementById('hub-notes-grid');
  container.innerHTML = '';

  const filtered = filterSubjectId 
    ? state.allNotes.filter(n => n.subject_id === filterSubjectId)
    : state.allNotes;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-span-3 p-12 text-center text-xs text-slate-500 bg-white rounded-2xl border border-dashed border-slate-300">No revision notes found for this selection.</div>`;
    return;
  }

  filtered.forEach(n => {
    const card = document.createElement('div');
    card.className = "bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between";
    card.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
            ${n.subject_name}
          </span>
          <span class="text-[10px] text-slate-400 font-medium">${new Date(n.updated_at).toLocaleDateString()}</span>
        </div>
        <div>
          <h4 class="text-sm font-bold text-slate-900 line-clamp-1">${n.title}</h4>
          <p class="text-xs text-slate-500 mt-0.5">${n.material_file_name ? `From: ${n.material_file_name}` : 'Course Synthesis'}</p>
        </div>
        <div class="text-xs text-slate-600 line-clamp-4 font-serif bg-slate-50 p-3 rounded-xl border border-slate-100">
          ${n.content_markdown.replace(/[#*`>]/g, '').slice(0, 180)}...
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <button onclick="openNoteViewer(${n.id})" class="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm">
          <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
          <span>Revise Note</span>
        </button>
        <button onclick="deleteNote(${n.id})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  lucide.createIcons();
}

// Open Full Reader & Editor Modal for a Note
async function openNoteViewer(noteId) {
  try {
    const note = await apiFetch(`/api/notes/${noteId}`);
    state.currentNote = note;
    state.noteEditMode = false;
    state.noteSplitSource = false;

    document.getElementById('note-view-title').innerText = note.title;
    const scholarTag = (state.settings && state.settings.student_name)
      ? ` • Scholar: ${state.settings.student_name}${state.settings.roll_number ? ' (' + state.settings.roll_number + ')' : ''}`
      : '';
    document.getElementById('note-view-meta').innerText = `${note.subject_name} • ${note.is_ai_generated ? 'AI Revision Sheet' : 'Manual Notes'}${scholarTag}`;

    // Source pane
    const sourceContent = document.getElementById('note-source-content');
    if (note.original_text) {
      sourceContent.innerText = note.original_text;
      document.getElementById('note-source-length').innerText = `${note.original_text.length} chars`;
    } else {
      sourceContent.innerText = "No raw source document attached.";
      document.getElementById('note-source-length').innerText = "0 chars";
    }

    renderNoteMarkdown(note.content_markdown);

    document.getElementById('note-reader-container').classList.remove('hidden');
    document.getElementById('note-editor-container').classList.add('hidden');
    document.getElementById('note-split-source-pane').classList.add('hidden');
    document.getElementById('note-toggle-edit-text').innerText = "Edit Notes";

    openModal('modal-note-viewer');
    lucide.createIcons();
  } catch (e) {
    console.error('Error opening note viewer', e);
  }
}

function renderNoteMarkdown(rawMarkdown) {
  const container = document.getElementById('note-print-area');
  // Configure marked
  marked.setOptions({
    gfm: true,
    breaks: true
  });
  container.innerHTML = marked.parse(rawMarkdown || '');

  // Render KaTeX formulas if present
  if (window.renderMathInElement) {
    renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false
    });
  }
}

function toggleNoteEditMode() {
  state.noteEditMode = !state.noteEditMode;
  const reader = document.getElementById('note-reader-container');
  const editor = document.getElementById('note-editor-container');
  const toggleBtnText = document.getElementById('note-toggle-edit-text');

  if (state.noteEditMode) {
    reader.classList.add('hidden');
    editor.classList.remove('hidden');
    document.getElementById('note-edit-title-input').value = state.currentNote.title;
    document.getElementById('note-edit-content-input').value = state.currentNote.content_markdown;
    toggleBtnText.innerText = "View Reader";
  } else {
    editor.classList.add('hidden');
    reader.classList.remove('hidden');
    toggleBtnText.innerText = "Edit Notes";
  }
}

function toggleOriginalSourceSplit() {
  state.noteSplitSource = !state.noteSplitSource;
  const splitPane = document.getElementById('note-split-source-pane');
  if (state.noteSplitSource) {
    splitPane.classList.remove('hidden');
  } else {
    splitPane.classList.add('hidden');
  }
}

async function saveNoteEdits() {
  if (!state.currentNote) return;
  const newTitle = document.getElementById('note-edit-title-input').value;
  const newContent = document.getElementById('note-edit-content-input').value;

  try {
    const updated = await apiFetch(`/api/notes/${state.currentNote.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle,
        content_markdown: newContent
      })
    });

    state.currentNote = updated;
    document.getElementById('note-view-title').innerText = updated.title;
    renderNoteMarkdown(updated.content_markdown);
    toggleNoteEditMode();
    showToast('Revision notes updated successfully!', 'success');
  } catch (e) {
    console.error('Failed to save note edits', e);
  }
}

function downloadNoteAsPDF() {
  const element = document.getElementById('note-print-area');
  const s = state.settings || {};
  const studentTag = s.student_name ? `_${s.student_name.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
  const rollTag = s.roll_number ? `_${s.roll_number.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
  const opt = {
    margin: [15, 15, 15, 15],
    filename: `${state.currentNote ? state.currentNote.title.replace(/[^a-zA-Z0-9_-]/g, '_') : 'HSB_MBA_Revision_Notes'}${studentTag}${rollTag}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  showToast('Generating personalized PDF document...', 'info');
  html2pdf().set(opt).from(element).save().then(() => {
    showToast('Revision sheet downloaded as PDF!', 'success');
  });
}

// Generate Notes Triggers
async function triggerSubjectNotesGeneration(subjectId) {
  showToast('AI is reading subject study material and synthesizing revision notes...', 'info');
  try {
    const result = await apiFetch('/api/notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: subjectId })
    });
    showToast(`Revision notes generated via ${result.ai_provider || 'AI Engine'}!`, 'success');
    if (state.currentView === 'subject-workspace') {
      await loadSubjectWorkspace(subjectId);
      switchWorkspaceTab('notes');
    } else {
      await navigateTo('notes');
    }
  } catch (e) {
    console.error('Failed notes generation', e);
  }
}

async function triggerMaterialNotesGeneration(materialId) {
  const mat = state.allMaterials.find(m => m.id === materialId);
  showToast(`AI is processing '${mat ? mat.title : 'document'}'...`, 'info');
  try {
    const result = await apiFetch('/api/notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_id: mat ? mat.subject_id : state.currentSubjectId,
        material_id: materialId
      })
    });
    showToast('Revision notes generated from uploaded document!', 'success');
    if (state.currentView === 'subject-workspace') {
      await loadSubjectWorkspace(state.currentSubjectId);
      switchWorkspaceTab('notes');
    } else {
      await navigateTo('notes');
    }
    openNoteViewer(result.id);
  } catch (e) {
    console.error('Failed notes generation', e);
  }
}

function triggerQuickGenerateNotes() {
  if (state.subjects.length > 0) {
    triggerSubjectNotesGeneration(state.subjects[0].id);
  } else {
    showToast('Please add a subject first.', 'warning');
  }
}

// =========================================================================
// 6. QUIZ CENTRE & INTERACTIVE QUIZ RUNNER
// =========================================================================

async function loadQuizzesHub() {
  state.allQuizzes = await apiFetch('/api/quizzes');
  const attempts = await apiFetch('/api/quiz-attempts/all');

  // Stats calculation
  document.getElementById('quiz-hub-attempts').innerText = attempts.length;
  if (attempts.length > 0) {
    const avg = Math.round(attempts.reduce((acc, a) => acc + a.percentage, 0) / attempts.length);
    const high = Math.round(Math.max(...attempts.map(a => a.percentage)));
    document.getElementById('quiz-hub-avg-score').innerText = `${avg}%`;
    document.getElementById('quiz-hub-high-score').innerText = `${high}%`;
  } else {
    document.getElementById('quiz-hub-avg-score').innerText = '0%';
    document.getElementById('quiz-hub-high-score').innerText = '0%';
  }

  // Quizzes Grid
  const grid = document.getElementById('hub-quizzes-grid');
  grid.innerHTML = '';

  if (state.allQuizzes.length === 0) {
    grid.innerHTML = `<div class="col-span-3 p-8 text-center text-xs text-slate-500 bg-white rounded-2xl border border-dashed border-slate-300">No quizzes generated yet. Click 'Generate New Quiz' above.</div>`;
  } else {
    state.allQuizzes.forEach(q => {
      const card = document.createElement('div');
      card.className = "bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between";
      card.innerHTML = `
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
              ${q.subject_name}
            </span>
            <span class="text-xs font-semibold text-slate-500">${q.difficulty}</span>
          </div>
          <div>
            <h4 class="text-sm font-bold text-slate-900">${q.title}</h4>
            <p class="text-xs text-slate-500 mt-1">${q.num_questions} Questions • ${q.question_types || 'Mixed'}</p>
          </div>
          <div class="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between text-xs text-slate-600">
            <span>Attempts: <b>${q.attempts_count || 0}</b></span>
            <span>Best: <b class="text-emerald-600">${q.best_score ? q.best_score + '%' : 'None'}</b></span>
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <button onclick="launchQuizRunner(${q.id})" class="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm shadow-purple-500/20">
            <i data-lucide="play" class="w-3.5 h-3.5"></i>
            <span>Start Assessment</span>
          </button>
          <button onclick="deleteQuiz(${q.id})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // Attempt History Table
  const attemptsTable = document.getElementById('quiz-attempts-table');
  attemptsTable.innerHTML = '';
  document.getElementById('quiz-attempts-count').innerText = `${attempts.length} attempts recorded`;

  if (attempts.length === 0) {
    attemptsTable.innerHTML = `<div class="p-6 text-center text-xs text-slate-500">No attempts recorded yet. Take a quiz to test your knowledge!</div>`;
  } else {
    attempts.slice(0, 10).forEach(a => {
      const dateFormatted = new Date(a.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const row = document.createElement('div');
      row.className = "p-4 hover:bg-slate-50 flex items-center justify-between text-xs";
      row.innerHTML = `
        <div class="min-w-0">
          <span class="text-[10px] font-bold text-purple-600 uppercase tracking-wider">${a.subject_name}</span>
          <h5 class="font-bold text-slate-900 truncate">${a.quiz_title}</h5>
          <span class="text-[11px] text-slate-400">${dateFormatted} • ${a.time_spent_seconds || 0}s duration</span>
        </div>
        <div class="flex items-center space-x-3">
          <span class="text-xs font-bold text-slate-700">${a.score} / ${a.total_questions}</span>
          <span class="px-2.5 py-1 rounded-full font-bold text-xs ${
            a.percentage >= 70 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
          }">
            ${a.percentage}%
          </span>
        </div>
      `;
      attemptsTable.appendChild(row);
    });
  }

  lucide.createIcons();
}

// Interactive 1-Question-at-a-Time Runner
async function launchQuizRunner(quizId) {
  try {
    const quiz = await apiFetch(`/api/quizzes/${quizId}`);
    if (!quiz.questions || quiz.questions.length === 0) {
      showToast('This quiz has no questions available.', 'error');
      return;
    }

    state.activeQuiz = quiz;
    state.quizCurrentIndex = 0;
    state.quizAnswers = {};
    state.quizSeconds = 0;

    // Start timer
    if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
    state.quizTimerInterval = setInterval(() => {
      state.quizSeconds++;
      const mins = String(Math.floor(state.quizSeconds / 60)).padStart(2, '0');
      const secs = String(state.quizSeconds % 60).padStart(2, '0');
      document.getElementById('quiz-runner-timer').innerText = `${mins}:${secs}`;
    }, 1000);

    document.getElementById('quiz-runner-badge-subject').innerText = quiz.subject_name;
    document.getElementById('quiz-runner-badge-diff').innerText = quiz.difficulty;
    document.getElementById('quiz-runner-title').innerText = quiz.title;

    renderCurrentQuizQuestion();
    openModal('modal-quiz-runner');
    lucide.createIcons();
  } catch (e) {
    console.error('Failed to launch quiz', e);
  }
}

function renderCurrentQuizQuestion() {
  const quiz = state.activeQuiz;
  const q = quiz.questions[state.quizCurrentIndex];
  const total = quiz.questions.length;

  document.getElementById('quiz-runner-progress-text').innerText = `Question ${state.quizCurrentIndex + 1} of ${total}`;
  const pct = Math.round(((state.quizCurrentIndex + 1) / total) * 100);
  document.getElementById('quiz-runner-progress-bar').style.width = `${pct}%`;

  document.getElementById('quiz-q-type').innerText = q.type || 'MCQ';
  document.getElementById('quiz-q-text').innerText = q.question;

  const optionsContainer = document.getElementById('quiz-options-container');
  optionsContainer.innerHTML = '';

  const selectedAnswer = state.quizAnswers[String(q.id)];

  (q.options || []).forEach((opt, idx) => {
    const isSelected = (selectedAnswer === opt);
    const letter = String.fromCharCode(65 + idx); // A, B, C, D
    const optBtn = document.createElement('button');
    optBtn.type = 'button';
    optBtn.className = `quiz-opt w-full text-left p-3.5 rounded-xl border text-xs font-medium flex items-center space-x-3 transition-all ${
      isSelected 
        ? 'border-brand-600 bg-brand-50/50 text-brand-900 shadow-sm ring-1 ring-brand-500' 
        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-800'
    }`;
    optBtn.onclick = () => selectQuizAnswer(q.id, opt);
    optBtn.innerHTML = `
      <span class="w-6 h-6 rounded-lg ${isSelected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'} font-bold flex items-center justify-center text-xs flex-shrink-0">
        ${letter}
      </span>
      <span class="flex-1 leading-relaxed">${opt}</span>
      ${isSelected ? `<i data-lucide="check" class="w-4 h-4 text-brand-600"></i>` : ''}
    `;
    optionsContainer.appendChild(optBtn);
  });

  // Buttons visibility
  const prevBtn = document.getElementById('quiz-btn-prev');
  const nextBtn = document.getElementById('quiz-btn-next');
  const submitBtn = document.getElementById('quiz-btn-submit');

  prevBtn.style.visibility = (state.quizCurrentIndex === 0) ? 'hidden' : 'visible';

  if (state.quizCurrentIndex === total - 1) {
    nextBtn.classList.add('hidden');
    submitBtn.classList.remove('hidden');
  } else {
    nextBtn.classList.remove('hidden');
    submitBtn.classList.add('hidden');
  }

  lucide.createIcons();
}

function selectQuizAnswer(questionId, answer) {
  state.quizAnswers[String(questionId)] = answer;
  renderCurrentQuizQuestion();
}

function prevQuizQuestion() {
  if (state.quizCurrentIndex > 0) {
    state.quizCurrentIndex--;
    renderCurrentQuizQuestion();
  }
}

function nextQuizQuestion() {
  if (state.quizCurrentIndex < state.activeQuiz.questions.length - 1) {
    state.quizCurrentIndex++;
    renderCurrentQuizQuestion();
  }
}

async function submitQuizAttempt() {
  if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);

  try {
    const result = await apiFetch(`/api/quizzes/${state.activeQuiz.id}/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: state.quizAnswers,
        time_spent_seconds: state.quizSeconds
      })
    });

    closeModal('modal-quiz-runner');
    showQuizResults(result);

    // Trigger celebration confetti if score >= 70%
    if (result.percentage >= 70 && window.confetti) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  } catch (e) {
    console.error('Failed to submit quiz attempt', e);
  }
}

function showQuizResults(result) {
  document.getElementById('results-quiz-title').innerText = state.activeQuiz ? state.activeQuiz.title : 'Quiz Evaluation';
  document.getElementById('results-score-text').innerText = `${result.score} / ${result.total_questions}`;
  
  const badge = document.getElementById('results-percentage-badge');
  badge.innerText = `${result.percentage}% Accuracy`;

  const msg = document.getElementById('results-feedback-message');
  if (result.percentage >= 80) {
    msg.innerText = "🌟 Outstanding! Distinction level mastery of these MBA frameworks.";
  } else if (result.percentage >= 60) {
    msg.innerText = "👍 Solid performance! Review the explanations below for tricky edge cases.";
  } else {
    msg.innerText = "📖 Good practice. Focus on the high-yield revision checklist and retake!";
  }

  const container = document.getElementById('results-breakdown-container');
  container.innerHTML = '';

  result.breakdown.forEach((item, idx) => {
    const isCorrect = item.is_correct;
    const card = document.createElement('div');
    card.className = `p-4 rounded-2xl border ${isCorrect ? 'bg-emerald-50/30 border-emerald-200' : 'bg-rose-50/30 border-rose-200'} space-y-2.5`;
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center space-x-2">
          <span class="w-6 h-6 rounded-lg ${isCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'} font-bold flex items-center justify-center text-xs">
            ${idx + 1}
          </span>
          <span class="text-xs font-bold text-slate-800">${item.question}</span>
        </div>
        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
          ${isCorrect ? 'Correct' : 'Incorrect'}
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
        <div class="p-2 rounded-lg bg-white border border-slate-200">
          <span class="text-[10px] font-bold text-slate-400 block uppercase">Your Selection</span>
          <span class="${isCorrect ? 'text-emerald-700 font-semibold' : 'text-rose-600 font-semibold'}">${item.selected_answer || '(No answer provided)'}</span>
        </div>
        <div class="p-2 rounded-lg bg-white border border-slate-200">
          <span class="text-[10px] font-bold text-slate-400 block uppercase">Correct Answer</span>
          <span class="text-emerald-700 font-semibold">${item.correct_answer}</span>
        </div>
      </div>

      <div class="p-3 bg-white/80 rounded-xl text-xs text-slate-600 border border-slate-200/60 leading-relaxed">
        <span class="font-bold text-slate-800">Source Rationale:</span> ${item.explanation}
      </div>
    `;
    container.appendChild(card);
  });

  openModal('modal-quiz-results');
  lucide.createIcons();
}

function retakeCurrentQuiz() {
  closeModal('modal-quiz-results');
  if (state.activeQuiz) {
    launchQuizRunner(state.activeQuiz.id);
  }
}

function confirmExitQuiz() {
  if (confirm("Are you sure you want to exit? Your current progress will not be submitted.")) {
    if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
    closeModal('modal-quiz-runner');
  }
}

// =========================================================================
// 7. ASSIGNMENT TRACKER
// =========================================================================

async function loadAssignmentsHub(statusFilter = 'all') {
  state.allAssignments = await apiFetch('/api/assignments');

  // Update counts
  const allCount = state.allAssignments.length;
  const pendingCount = state.allAssignments.filter(a => a.status === 'Pending').length;
  const completedCount = state.allAssignments.filter(a => a.status === 'Completed').length;
  const overdueCount = state.allAssignments.filter(a => a.status !== 'Completed' && new Date(a.due_date) < new Date()).length;

  document.getElementById('count-all-assign').innerText = allCount;
  document.getElementById('count-pending-assign').innerText = pendingCount;
  document.getElementById('count-completed-assign').innerText = completedCount;
  document.getElementById('count-overdue-assign').innerText = overdueCount;

  const navBadge = document.getElementById('nav-badge-assignments');
  if (pendingCount > 0) {
    navBadge.classList.remove('hidden');
    navBadge.innerText = `${pendingCount} Due`;
  } else {
    navBadge.classList.add('hidden');
  }

  filterAssignmentStatus(statusFilter);
}

function filterAssignmentStatus(status) {
  const tabs = ['all', 'pending', 'completed', 'overdue'];
  tabs.forEach(t => {
    const btn = document.getElementById(`assign-filter-${t}`);
    if (t === status.toLowerCase()) {
      btn.className = "assign-tab px-3.5 py-1.5 rounded-xl text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200";
    } else {
      btn.className = "assign-tab px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100";
    }
  });

  const now = new Date();
  const filtered = state.allAssignments.filter(a => {
    if (status === 'all') return true;
    if (status === 'Pending') return a.status === 'Pending' && new Date(a.due_date) >= now;
    if (status === 'Completed') return a.status === 'Completed';
    if (status === 'Overdue') return a.status !== 'Completed' && new Date(a.due_date) < now;
    return true;
  });

  const container = document.getElementById('assignments-list-container');
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">No assignments found under this category.</div>`;
    return;
  }

  filtered.forEach(a => {
    const due = formatDueDate(a.due_date);
    const isDone = (a.status === 'Completed');
    const card = document.createElement('div');
    card.className = `p-4 md:p-5 rounded-2xl border ${isDone ? 'bg-slate-50/50 border-slate-200 opacity-60' : 'bg-white border-slate-200'} shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all`;

    card.innerHTML = `
      <div class="flex items-start space-x-3.5 min-w-0">
        <button onclick="toggleAssignmentStatus(${a.id})" class="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors">
          <i data-lucide="${isDone ? 'check-circle' : 'circle'}" class="w-5 h-5 ${isDone ? 'text-emerald-500' : ''}"></i>
        </button>

        <div class="min-w-0 space-y-1">
          <div class="flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full ${getPriorityDotClass(a.priority)}"></span>
            <span class="text-[10px] font-bold text-brand-600 uppercase tracking-wider">${a.subject_name}</span>
            <span class="text-slate-300">•</span>
            <span class="text-[10px] text-slate-400 font-medium">${a.term_name}</span>
            <span class="px-2 py-0.2 rounded text-[10px] font-bold ${getPriorityBadgeClass(a.priority)}">${a.priority} Priority</span>
          </div>

          <h4 class="text-sm font-bold text-slate-900 ${isDone ? 'line-through text-slate-400' : ''} truncate">${a.title}</h4>
          ${a.description ? `<p class="text-xs text-slate-500 line-clamp-2">${a.description}</p>` : ''}
        </div>
      </div>

      <div class="flex items-center space-x-3 self-end sm:self-center">
        <div class="text-right">
          <span class="text-xs font-bold ${due.isOverdue && !isDone ? 'text-rose-600' : 'text-slate-700'} flex items-center space-x-1">
            <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
            <span>${due.text}</span>
          </span>
          <span class="text-[10px] text-slate-400 block">${new Date(a.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        <div class="flex items-center space-x-1">
          <button onclick="openEditAssignmentModal(${a.id})" class="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
            <i data-lucide="edit-2" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteAssignment(${a.id})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  lucide.createIcons();
}

async function toggleAssignmentStatus(assignmentId) {
  try {
    const res = await apiFetch(`/api/assignments/${assignmentId}/toggle-status`, { method: 'PATCH' });
    showToast(`Assignment marked as ${res.status}!`, 'success');
    if (state.currentView === 'assignments') {
      await loadAssignmentsHub();
    } else if (state.currentView === 'dashboard') {
      await loadDashboard();
    } else if (state.currentView === 'subject-workspace') {
      await loadSubjectWorkspace(state.currentSubjectId);
    }
  } catch (e) {
    console.error('Failed to toggle status', e);
  }
}

// =========================================================================
// 8. SETTINGS, STUDENT PROFILE & ONBOARDING
// =========================================================================

function getInitials(name) {
  if (!name || !name.trim()) return 'PM';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

async function loadSettings() {
  try {
    state.settings = await apiFetch('/api/settings');
    updateUIWithSettings();
  } catch (e) {
    console.error('Error loading settings', e);
  }
}

function updateUIWithSettings() {
  const s = state.settings || {};
  const studentName = s.student_name ? s.student_name.trim() : '';
  const rollNumber = s.roll_number ? s.roll_number.trim() : '';
  const program = s.program_name || 'MBA in Product Management';
  const initials = getInitials(studentName);

  // Sidebar Profile Card
  const userDispName = document.getElementById('user-display-name');
  if (userDispName) userDispName.innerText = studentName || 'MBA Scholar';

  const userDispRoll = document.getElementById('user-display-roll');
  if (userDispRoll) userDispRoll.innerText = rollNumber ? `Roll: ${rollNumber}` : 'Roll: Not set (Click to edit)';

  const userAvatar = document.getElementById('user-display-avatar');
  if (userAvatar) userAvatar.innerText = initials;

  // Header Quick Profile Pill
  const headerName = document.getElementById('header-student-name');
  if (headerName) headerName.innerText = studentName ? studentName.split(' ')[0] : 'Scholar';

  const headerRoll = document.getElementById('header-student-roll');
  if (headerRoll) headerRoll.innerText = rollNumber ? `Roll: ${rollNumber}` : 'Roll: Not set';

  const headerAvatar = document.getElementById('header-avatar-initials');
  if (headerAvatar) headerAvatar.innerText = initials;

  // Dashboard Welcome Banner
  const dashName = document.getElementById('dash-student-name');
  if (dashName) dashName.innerText = studentName ? studentName : 'Scholar';

  const dashRoll = document.getElementById('dash-roll-badge');
  if (dashRoll) dashRoll.innerText = rollNumber ? `Roll No: ${rollNumber}` : 'Roll No: Not set';

  const dashProgram = document.getElementById('dash-program-badge');
  if (dashProgram) dashProgram.innerText = program;

  // AI model tag
  if (s.gemini_model) {
    const tag = document.getElementById('ai-model-tag');
    if (tag) tag.innerText = s.gemini_model.replace('gemini-', '');
  }

  lucide.createIcons();
}

function checkOnboarding() {
  const s = state.settings || {};
  const hasOnboarded = (s.has_onboarded === '1' || s.has_onboarded === 1);
  const localOnboarded = (localStorage.getItem('hsb_onboarded') === '1' || sessionStorage.getItem('hsb_onboarded') === '1');
  const hasDetails = s.student_name && s.student_name.trim() && s.roll_number && s.roll_number.trim();

  const onboardingPage = document.getElementById('page-onboarding');
  if (!onboardingPage) return;

  if ((hasOnboarded || localOnboarded) && hasDetails) {
    hideOnboardingPage();
  } else if (!hasOnboarded && !localOnboarded) {
    showOnboardingPage(false);
  } else {
    hideOnboardingPage();
  }
}

function showOnboardingPage(isEditing = false) {
  const onboardingPage = document.getElementById('page-onboarding');
  if (!onboardingPage) return;

  onboardingPage.style.display = 'flex';
  onboardingPage.classList.remove('hidden');

  const s = state.settings || {};
  const nameInput = document.getElementById('onboard-name-input');
  const rollInput = document.getElementById('onboard-roll-input');
  const yearInput = document.getElementById('onboard-year-input');
  const backBtn = document.getElementById('onboarding-page-back-btn');

  if (nameInput) nameInput.value = s.student_name || '';
  if (rollInput) rollInput.value = s.roll_number || '';
  if (yearInput) yearInput.value = s.academic_year || '2026-2027';

  // If student already has credentials and is viewing the page, show back button
  if (isEditing || (s.student_name && s.roll_number)) {
    if (backBtn) backBtn.classList.remove('hidden');
  } else {
    if (backBtn) backBtn.classList.add('hidden');
  }

  lucide.createIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideOnboardingPage() {
  const onboardingPage = document.getElementById('page-onboarding');
  if (onboardingPage) {
    onboardingPage.style.display = 'none';
    onboardingPage.classList.add('hidden');
    onboardingPage.setAttribute('style', 'display: none !important;');
  }
  const modalOnboarding = document.getElementById('modal-onboarding');
  if (modalOnboarding) {
    modalOnboarding.style.display = 'none';
    modalOnboarding.classList.add('hidden');
  }
}

async function handleStandaloneOnboardingSubmit(e) {
  if (e) {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {}
  }

  const nameInput = document.getElementById('onboard-name-input') || document.getElementById('onboarding-student-name');
  const rollInput = document.getElementById('onboard-roll-input') || document.getElementById('onboarding-roll-number');
  const yearInput = document.getElementById('onboard-year-input') || document.getElementById('onboarding-academic-year');
  const termInput = document.getElementById('onboard-term-input');

  const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : (state.settings && state.settings.student_name ? state.settings.student_name : 'Kirtan Bansal');
  const roll = rollInput && rollInput.value.trim() ? rollInput.value.trim() : (state.settings && state.settings.roll_number ? state.settings.roll_number : '2026MBAPM017');
  const year = yearInput && yearInput.value.trim() ? yearInput.value.trim() : '2026-2027';
  const termName = termInput ? termInput.value : 'Term 1';

  // 1. Instantly hide onboarding screens and save in local storage
  hideOnboardingPage();
  try {
    localStorage.setItem('hsb_onboarded', '1');
    sessionStorage.setItem('hsb_onboarded', '1');
  } catch (err) {}

  const updated = {
    ...state.settings,
    student_name: name,
    roll_number: roll,
    program_name: 'MBA in Product Management',
    academic_year: year,
    institution: 'Hari Shankar Singhania School of Business (HSB)',
    has_onboarded: '1'
  };

  state.settings = { ...state.settings, ...updated };
  updateUIWithSettings();

  // If a term was selected, switch to that term
  if (state.terms && state.terms.length > 0) {
    const matchedTerm = state.terms.find(t => t.name === termName);
    if (matchedTerm) state.currentTermId = matchedTerm.id;
  }

  // 2. Open dashboard workspace directly
  await navigateTo('dashboard');

  try {
    const res = await apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: updated })
    });

    if (res && res.settings) {
      state.settings = res.settings;
      updateUIWithSettings();
    }
  } catch (err) {
    console.warn('Profile saved locally; background db sync note:', err);
  }

  showToast(`Welcome, ${name}! Your MBA Workspace is ready.`, 'success');

  if (window.confetti) {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 }
    });
  }
}

window.handleOnboardingSubmit = handleStandaloneOnboardingSubmit;

async function populateSettingsForm() {
  await loadSettings();
  const s = state.settings;

  const geminiRadio = document.querySelector('input[name="ai_provider"][value="gemini"]');
  const openaiRadio = document.querySelector('input[name="ai_provider"][value="openai"]');

  if (s.ai_provider === 'openai') {
    openaiRadio.checked = true;
    document.getElementById('settings-openai-fields').classList.remove('hidden');
    document.getElementById('settings-gemini-fields').classList.add('hidden');
  } else {
    geminiRadio.checked = true;
    document.getElementById('settings-gemini-fields').classList.remove('hidden');
    document.getElementById('settings-openai-fields').classList.add('hidden');
  }

  document.getElementById('input-gemini-key').value = s.gemini_api_key || '';
  document.getElementById('select-gemini-model').value = s.gemini_model || 'gemini-2.5-flash';
  document.getElementById('input-openai-key').value = s.openai_api_key || '';
  document.getElementById('input-openai-model').value = s.openai_model || 'gpt-4o-mini';

  document.getElementById('input-student-name').value = s.student_name || '';
  document.getElementById('input-student-roll').value = s.roll_number || '';
  document.getElementById('input-program-name').value = s.program_name || 'MBA in Product Management';
  document.getElementById('input-academic-year').value = s.academic_year || '2026-2027';
  document.getElementById('input-institution-name').value = s.institution || 'Hari Shankar Singhania School of Business (HSB)';

  // Radio toggle listeners
  document.querySelectorAll('input[name="ai_provider"]').forEach(r => {
    r.onchange = () => {
      if (r.value === 'openai') {
        document.getElementById('settings-openai-fields').classList.remove('hidden');
        document.getElementById('settings-gemini-fields').classList.add('hidden');
      } else {
        document.getElementById('settings-gemini-fields').classList.remove('hidden');
        document.getElementById('settings-openai-fields').classList.add('hidden');
      }
    };
  });
}

async function saveAllSettings() {
  const provider = document.querySelector('input[name="ai_provider"]:checked')?.value || 'gemini';
  const updated = {
    ...state.settings,
    ai_provider: provider,
    gemini_api_key: document.getElementById('input-gemini-key').value.trim(),
    gemini_model: document.getElementById('select-gemini-model').value,
    openai_api_key: document.getElementById('input-openai-key').value.trim(),
    openai_model: document.getElementById('input-openai-model').value.trim(),
    student_name: document.getElementById('input-student-name').value.trim(),
    roll_number: document.getElementById('input-student-roll').value.trim(),
    program_name: document.getElementById('input-program-name').value.trim(),
    academic_year: document.getElementById('input-academic-year').value.trim(),
    institution: document.getElementById('input-institution-name').value.trim(),
    has_onboarded: '1'
  };

  try {
    const res = await apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: updated })
    });
    state.settings = res.settings;
    updateUIWithSettings();
    showToast('Settings saved successfully!', 'success');
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

async function testApiKeyConnection() {
  const provider = document.querySelector('input[name="ai_provider"]:checked')?.value || 'gemini';
  const apiKey = (provider === 'gemini') ? document.getElementById('input-gemini-key').value.trim() : document.getElementById('input-openai-key').value.trim();
  const model = (provider === 'gemini') ? document.getElementById('select-gemini-model').value : document.getElementById('input-openai-model').value;

  if (!apiKey) {
    showToast('Please enter an API key to test.', 'warning');
    return;
  }

  showToast('Pinging AI model...', 'info');
  try {
    const res = await apiFetch('/api/settings/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, api_key: apiKey, model })
    });
    if (res.success) {
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'error');
    }
  } catch (e) {
    console.error('Test connection error', e);
  }
}

// =========================================================================
// MODAL CONTROLS & FORM HANDLERS
// =========================================================================

function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) {
    m.classList.remove('hidden');
    lucide.createIcons();
  }
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('hidden');
}

// Populate helper selects
function populateGlobalDropdowns() {
  populateSubjectFilterSelect('upload-subject-select');
  populateSubjectFilterSelect('manual-note-subject-select');
  populateSubjectFilterSelect('quiz-gen-subject-select');
  populateSubjectFilterSelect('assign-subject-select');

  const termSelect = document.getElementById('subject-term-select');
  if (termSelect) {
    termSelect.innerHTML = '';
    state.terms.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.innerText = t.name;
      termSelect.appendChild(opt);
    });
  }
}

function populateSubjectFilterSelect(selectId) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const currentVal = el.value;
  el.innerHTML = '';
  state.subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.innerText = `${s.name} (${s.code || 'MBA'})`;
    el.appendChild(opt);
  });
  if (currentVal) el.value = currentVal;
}

// Upload Modal
function openUploadModal(presetSubjectId = null) {
  populateGlobalDropdowns();
  if (presetSubjectId) {
    document.getElementById('upload-subject-select').value = presetSubjectId;
  }
  document.getElementById('upload-doc-title').value = '';
  document.getElementById('upload-doc-desc').value = '';
  document.getElementById('upload-file-input').value = '';
  openModal('modal-upload');
}

async function handleUploadSubmit(e) {
  e.preventDefault();
  const subjectId = document.getElementById('upload-subject-select').value;
  const title = document.getElementById('upload-doc-title').value.trim();
  const description = document.getElementById('upload-doc-desc').value.trim();
  const fileInput = document.getElementById('upload-file-input');

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please select at least one file.', 'warning');
    return;
  }

  const formData = new FormData();
  for (let i = 0; i < fileInput.files.length; i++) {
    formData.append('files', fileInput.files[i]);
  }
  if (title) formData.append('title', title);
  if (description) formData.append('description', description);

  const btn = document.getElementById('btn-submit-upload');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Extracting Text...</span>`;
  lucide.createIcons();

  try {
    const res = await fetch(`/api/subjects/${subjectId}/materials/upload`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    closeModal('modal-upload');
    showToast(`Successfully uploaded ${data.count} document(s) with text extraction!`, 'success');

    if (state.currentView === 'subject-workspace') {
      await loadSubjectWorkspace(subjectId);
    } else if (state.currentView === 'materials') {
      await loadMaterialsHub();
    } else {
      await loadDashboard();
    }
  } catch (err) {
    showToast(err.message || 'Upload error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i><span>Upload & Extract</span>`;
    lucide.createIcons();
  }
}

// Manual Note Modal
function openManualNoteModal(presetSubjectId = null) {
  populateGlobalDropdowns();
  if (presetSubjectId) {
    document.getElementById('manual-note-subject-select').value = presetSubjectId;
  }
  document.getElementById('manual-note-title').value = '';
  document.getElementById('manual-note-content').value = '';
  openModal('modal-manual-note');
}

async function handleManualNoteSubmit(e) {
  e.preventDefault();
  const subjectId = document.getElementById('manual-note-subject-select').value;
  const title = document.getElementById('manual-note-title').value.trim();
  const content = document.getElementById('manual-note-content').value.trim();

  try {
    await apiFetch(`/api/subjects/${subjectId}/materials/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content })
    });
    closeModal('modal-manual-note');
    showToast('Manual study notes saved!', 'success');
    if (state.currentView === 'subject-workspace') {
      await loadSubjectWorkspace(subjectId);
    } else {
      await loadDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}

// Subject Modal
function openNewSubjectModal(presetTermId = null) {
  populateGlobalDropdowns();
  document.getElementById('modal-subject-title').innerText = "Add New MBA Subject";
  document.getElementById('subject-edit-id').value = "";
  document.getElementById('subject-name-input').value = "";
  document.getElementById('subject-code-input').value = "";
  document.getElementById('subject-instructor-input').value = "";
  document.getElementById('subject-credits-input').value = "3";
  document.getElementById('subject-color-input').value = "indigo";
  document.getElementById('subject-desc-input').value = "";

  if (presetTermId) {
    document.getElementById('subject-term-select').value = presetTermId;
  } else if (state.currentTermId) {
    document.getElementById('subject-term-select').value = state.currentTermId;
  }
  openModal('modal-subject');
}

function openEditSubjectModal(subjectId) {
  const s = state.subjects.find(sub => sub.id === subjectId);
  if (!s) return;
  populateGlobalDropdowns();
  document.getElementById('modal-subject-title').innerText = "Edit Subject";
  document.getElementById('subject-edit-id').value = s.id;
  document.getElementById('subject-term-select').value = s.term_id;
  document.getElementById('subject-name-input').value = s.name;
  document.getElementById('subject-code-input').value = s.code || '';
  document.getElementById('subject-instructor-input').value = s.instructor || '';
  document.getElementById('subject-credits-input').value = s.credits || 3;
  document.getElementById('subject-color-input').value = s.color || 'indigo';
  document.getElementById('subject-desc-input').value = s.description || '';
  openModal('modal-subject');
}

async function handleSubjectSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById('subject-edit-id').value;
  const payload = {
    term_id: parseInt(document.getElementById('subject-term-select').value),
    name: document.getElementById('subject-name-input').value.trim(),
    code: document.getElementById('subject-code-input').value.trim(),
    instructor: document.getElementById('subject-instructor-input').value.trim(),
    credits: parseInt(document.getElementById('subject-credits-input').value) || 3,
    color: document.getElementById('subject-color-input').value,
    description: document.getElementById('subject-desc-input').value.trim()
  };

  try {
    if (editId) {
      await apiFetch(`/api/subjects/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('Subject updated!', 'success');
    } else {
      await apiFetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('Subject added to term!', 'success');
    }
    closeModal('modal-subject');
    await refreshGlobalData();
    if (state.currentView === 'terms-subjects') {
      await renderTermSubjects();
    } else {
      await loadDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteSubject(subjectId) {
  if (confirm("Are you sure you want to delete this subject and all its notes and materials?")) {
    await apiFetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
    showToast('Subject deleted.', 'info');
    await refreshGlobalData();
    if (state.currentView === 'terms-subjects') {
      await renderTermSubjects();
    } else {
      await loadDashboard();
    }
  }
}

// Term Modal
function openNewTermModal() {
  document.getElementById('modal-term-title').innerText = "Add Academic Term";
  document.getElementById('term-edit-id').value = "";
  document.getElementById('term-name-input').value = "";
  document.getElementById('term-year-input').value = "2026-2027";
  document.getElementById('term-active-checkbox').checked = false;
  openModal('modal-term');
}

function openEditTermModal() {
  const t = state.terms.find(term => term.id === state.currentTermId);
  if (!t) return;
  document.getElementById('modal-term-title').innerText = "Edit Academic Term";
  document.getElementById('term-edit-id').value = t.id;
  document.getElementById('term-name-input').value = t.name;
  document.getElementById('term-year-input').value = t.academic_year || '2026-2027';
  document.getElementById('term-active-checkbox').checked = !!t.is_active;
  openModal('modal-term');
}

async function handleTermSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById('term-edit-id').value;
  const payload = {
    name: document.getElementById('term-name-input').value.trim(),
    academic_year: document.getElementById('term-year-input').value.trim(),
    is_active: document.getElementById('term-active-checkbox').checked ? 1 : 0
  };

  try {
    if (editId) {
      await apiFetch(`/api/terms/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('Term updated!', 'success');
    } else {
      const created = await apiFetch('/api/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      state.currentTermId = created.id;
      showToast('Term created!', 'success');
    }
    closeModal('modal-term');
    await refreshGlobalData();
    await loadTermsAndSubjects();
  } catch (err) {
    console.error(err);
  }
}

async function deleteCurrentTerm() {
  if (confirm("Are you sure you want to delete this entire term and its subjects?")) {
    await apiFetch(`/api/terms/${state.currentTermId}`, { method: 'DELETE' });
    showToast('Term deleted.', 'info');
    state.currentTermId = null;
    await refreshGlobalData();
    await loadTermsAndSubjects();
  }
}

// Generate Quiz Modal
function openGenerateQuizModal(presetSubjectId = null, presetMaterialId = null) {
  populateGlobalDropdowns();
  const subjSelect = document.getElementById('quiz-gen-subject-select');
  if (presetSubjectId) {
    subjSelect.value = presetSubjectId;
  }
  updateQuizMaterialOptions(subjSelect.value, presetMaterialId);
  openModal('modal-generate-quiz');
}

async function updateQuizMaterialOptions(subjectId, selectMaterialId = null) {
  const matSelect = document.getElementById('quiz-gen-material-select');
  matSelect.innerHTML = '<option value="">All Uploaded Notes in this Subject</option>';
  if (!subjectId) return;

  try {
    const materials = await apiFetch(`/api/materials?subject_id=${subjectId}`);
    materials.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.innerText = m.title;
      matSelect.appendChild(opt);
    });
    if (selectMaterialId) matSelect.value = selectMaterialId;
  } catch (e) {
    console.error(e);
  }
}

async function handleGenerateQuizSubmit(e) {
  e.preventDefault();
  const subjectId = parseInt(document.getElementById('quiz-gen-subject-select').value);
  const materialIdVal = document.getElementById('quiz-gen-material-select').value;
  const materialId = materialIdVal ? parseInt(materialIdVal) : null;
  const numQuestions = parseInt(document.getElementById('quiz-gen-num').value);
  const difficulty = document.getElementById('quiz-gen-diff').value;
  const questionTypes = document.getElementById('quiz-gen-types').value;

  const btn = document.getElementById('btn-submit-generate-quiz');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Generating Questions...</span>`;
  lucide.createIcons();

  try {
    const result = await apiFetch('/api/quizzes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_id: subjectId,
        material_id: materialId,
        num_questions: numQuestions,
        difficulty: difficulty,
        question_types: questionTypes
      })
    });

    closeModal('modal-generate-quiz');
    showToast(`Quiz generated with ${result.questions.length} questions!`, 'success');
    launchQuizRunner(result.id);
  } catch (err) {
    showToast(err.message || 'Quiz generation failed', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i><span>Generate & Start</span>`;
    lucide.createIcons();
  }
}

// Assignment Modal
function openNewAssignmentModal(presetSubjectId = null) {
  populateGlobalDropdowns();
  document.getElementById('modal-assignment-title').innerText = "Add Assignment Deadline";
  document.getElementById('assignment-edit-id').value = "";
  document.getElementById('assign-title-input').value = "";
  document.getElementById('assign-desc-input').value = "";
  document.getElementById('assign-priority-select').value = "Medium";

  // Default due date to 3 days from now at 23:59
  const in3Days = new Date();
  in3Days.setDate(in3Days.getDate() + 3);
  in3Days.setHours(23, 59, 0, 0);
  const isoStr = in3Days.toISOString().slice(0, 16);
  document.getElementById('assign-due-input').value = isoStr;
  document.getElementById('assign-reminder-input').value = "";

  if (presetSubjectId) {
    document.getElementById('assign-subject-select').value = presetSubjectId;
  }
  openModal('modal-assignment');
}

function openEditAssignmentModal(assignmentId) {
  const a = state.allAssignments.find(item => item.id === assignmentId);
  if (!a) return;
  populateGlobalDropdowns();
  document.getElementById('modal-assignment-title').innerText = "Edit Assignment";
  document.getElementById('assignment-edit-id').value = a.id;
  document.getElementById('assign-subject-select').value = a.subject_id;
  document.getElementById('assign-title-input').value = a.title;
  document.getElementById('assign-due-input').value = a.due_date ? a.due_date.slice(0, 16) : '';
  document.getElementById('assign-priority-select').value = a.priority || 'Medium';
  document.getElementById('assign-reminder-input').value = a.reminder_datetime ? a.reminder_datetime.slice(0, 16) : '';
  document.getElementById('assign-desc-input').value = a.description || '';
  openModal('modal-assignment');
}

async function handleAssignmentSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById('assignment-edit-id').value;
  const subjectId = parseInt(document.getElementById('assign-subject-select').value);
  const subject = state.subjects.find(s => s.id === subjectId);

  const payload = {
    term_id: subject ? subject.term_id : state.currentTermId,
    subject_id: subjectId,
    title: document.getElementById('assign-title-input').value.trim(),
    due_date: document.getElementById('assign-due-input').value,
    priority: document.getElementById('assign-priority-select').value,
    reminder_datetime: document.getElementById('assign-reminder-input').value,
    description: document.getElementById('assign-desc-input').value.trim()
  };

  try {
    if (editId) {
      await apiFetch(`/api/assignments/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('Assignment updated!', 'success');
    } else {
      await apiFetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('Assignment deadline added!', 'success');
    }
    closeModal('modal-assignment');
    if (state.currentView === 'assignments') {
      await loadAssignmentsHub();
    } else if (state.currentView === 'subject-workspace') {
      await loadSubjectWorkspace(subjectId);
      switchWorkspaceTab('assignments');
    } else {
      await loadDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteAssignment(assignmentId) {
  if (confirm("Delete this assignment deadline?")) {
    await apiFetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' });
    showToast('Assignment deleted.', 'info');
    if (state.currentView === 'assignments') {
      await loadAssignmentsHub();
    } else if (state.currentView === 'subject-workspace') {
      await loadSubjectWorkspace(state.currentSubjectId);
    } else {
      await loadDashboard();
    }
  }
}

// Extracted Text Viewer Modal
async function viewExtractedText(materialId) {
  try {
    const materials = await apiFetch(`/api/materials`);
    const mat = materials.find(m => m.id === materialId);
    if (!mat) return;

    document.getElementById('extracted-text-title').innerText = mat.title;
    document.getElementById('extracted-text-meta').innerText = `${mat.file_name} • ${mat.extracted_text ? mat.extracted_text.length : 0} characters parsed`;
    document.getElementById('extracted-text-body').innerText = mat.extracted_text || 'No text could be extracted from this document.';
    openModal('modal-extracted-text');
  } catch (e) {
    console.error(e);
  }
}

async function deleteMaterial(materialId) {
  if (confirm("Delete this uploaded document?")) {
    await apiFetch(`/api/materials/${materialId}`, { method: 'DELETE' });
    showToast('Document deleted.', 'info');
    if (state.currentView === 'subject-workspace') {
      await loadSubjectWorkspace(state.currentSubjectId);
    } else if (state.currentView === 'materials') {
      await loadMaterialsHub();
    } else {
      await loadDashboard();
    }
  }
}

async function deleteNote(noteId) {
  if (confirm("Delete these revision notes?")) {
    await apiFetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    showToast('Revision notes deleted.', 'info');
    if (state.currentView === 'notes') {
      await loadNotesHub();
    } else if (state.currentView === 'subject-workspace') {
      await loadSubjectWorkspace(state.currentSubjectId);
      switchWorkspaceTab('notes');
    } else {
      await loadDashboard();
    }
  }
}

async function deleteQuiz(quizId) {
  if (confirm("Delete this quiz and its attempt records?")) {
    await apiFetch(`/api/quizzes/${quizId}`, { method: 'DELETE' });
    showToast('Quiz deleted.', 'info');
    if (state.currentView === 'quizzes') {
      await loadQuizzesHub();
    } else if (state.currentView === 'subject-workspace') {
      await loadSubjectWorkspace(state.currentSubjectId);
      switchWorkspaceTab('quizzes');
    } else {
      await loadDashboard();
    }
  }
}

function openNewManualRevisionNoteModal() {
  if (state.subjects.length === 0) {
    showToast('Please create a subject first.', 'warning');
    return;
  }
  openManualNoteModal(state.subjects[0].id);
}

// =========================================================================
// UTILITIES & NOTIFICATIONS
// =========================================================================

function formatDueDate(isoDateStr) {
  if (!isoDateStr) return { text: 'No due date', isOverdue: false };
  const due = new Date(isoDateStr);
  const now = new Date();
  const diffMs = due - now;
  const isOverdue = diffMs < 0;

  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (isOverdue) {
    const overdueDays = Math.abs(diffDays);
    return {
      text: overdueDays === 0 ? 'Overdue today' : `Overdue by ${overdueDays} day(s)`,
      isOverdue: true
    };
  } else {
    if (diffHours < 24) {
      return { text: `Due in ${Math.max(1, diffHours)} hour(s)`, isOverdue: false };
    } else if (diffDays === 1) {
      return { text: 'Due tomorrow', isOverdue: false };
    } else {
      return { text: `Due in ${diffDays} days`, isOverdue: false };
    }
  }
}

function getPriorityDotClass(priority) {
  switch (priority) {
    case 'High': return 'bg-rose-500';
    case 'Medium': return 'bg-amber-500';
    case 'Low': return 'bg-emerald-500';
    default: return 'bg-slate-400';
  }
}

function getPriorityBadgeClass(priority) {
  switch (priority) {
    case 'High': return 'bg-rose-50 text-rose-700 border border-rose-200';
    case 'Medium': return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'Low': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function togglePasswordVisibility(inputId) {
  const el = document.getElementById(inputId);
  if (el) {
    el.type = (el.type === 'password') ? 'text' : 'password';
  }
}

function handleGlobalSearch(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return;
  // If user presses enter on search, navigate to materials or notes
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    'success': 'bg-slate-900 text-white border-emerald-500',
    'error': 'bg-rose-950 text-rose-100 border-rose-500',
    'warning': 'bg-amber-950 text-amber-100 border-amber-500',
    'info': 'bg-slate-900 text-white border-brand-500'
  };

  const icons = {
    'success': 'check-circle-2',
    'error': 'alert-circle',
    'warning': 'alert-triangle',
    'info': 'info'
  };

  toast.className = `toast px-4 py-3 rounded-2xl border text-xs font-semibold shadow-xl flex items-center space-x-2.5 ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 flex-shrink-0"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function setupNotifications() {
  // Check upcoming assignments every 60 seconds
  setInterval(() => {
    if (state.allAssignments) {
      const now = new Date();
      state.allAssignments.forEach(a => {
        if (a.status !== 'Completed' && a.due_date) {
          const due = new Date(a.due_date);
          const diffMin = (due - now) / (1000 * 60);
          if (diffMin > 0 && diffMin <= 60 && !a._notified) {
            a._notified = true;
            if (Notification.permission === 'granted') {
              new Notification(`HSB Deadline Alert: ${a.title}`, {
                body: `Due in ${Math.round(diffMin)} minutes!`,
                icon: '/static/favicon.ico'
              });
            }
          }
        }
      });
    }
  }, 60000);
}

function requestBrowserNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Browser notifications are not supported in this browser.', 'warning');
    return;
  }
  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      showToast('Notifications enabled! You will receive submission reminders.', 'success');
      new Notification('HSB Learn Reminders Activated', {
        body: 'Deadline tracking and study alerts are now active.'
      });
    } else {
      showToast('Notifications permission was denied.', 'warning');
    }
  });
}
