// 📐 Formula-sheet generator (נוסחאון).
// A sheet is data: sections → blocks (formula, definition, steps, callout, figure, table…).
// The app lays the blocks out on A4 pages in columns, in a theme (only "standard" for now),
// shrinking or growing the font so the sheet fills exactly the number of pages you allow.
// Sheets are records of kind "sheet", so they sync through Google Drive like everything else.

const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
const KATEX_JS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';
const FS_FONT_CSS = 'https://fonts.googleapis.com/css2?family=David+Libre:wght@400;500;700&display=swap';

const FS_PROFILES = {
  figures: '🖼️ איורים ושרטוטים',
  derivations: '∂ פיתוחים ונוסחאות',
  procedures: '🪜 סד״פ ושיטות פתרון',
  tables: '▦ טבלאות והשוואות',
  proofs: '📜 משפטים והוכחות',
  code: '💻 קוד',
};
// What each choice asks the AI for (also shown as a tooltip on the checkbox).
const FS_PROFILE_HINTS = {
  figures: 'איורים ושרטוטים בסגנון חומרי הקורס',
  derivations: 'נוסחאות, זהויות ופיתוחים קצרים',
  procedures: 'סדר פעולות לכל סוג שאלה במבחן, כולל איך מזהים את סוג הבעיה ובאיזו שיטה פותרים',
  tables: 'טבלאות מקרים, השוואות וסימנים',
  proofs: 'ניסוח משפטים, תנאים ורעיון ההוכחה',
  code: 'קטעי קוד ותחביר (פייתון, MATLAB…) בגופן קוד',
};
const fsProfileChecks = sel => Object.entries(FS_PROFILES).map(([k, l]) => `<label class="chip" title="${esc(FS_PROFILE_HINTS[k] || '')}"><input type="checkbox" name="p" value="${k}" ${sel.includes(k) ? 'checked' : ''}> ${l}</label>`).join('');
const FS_SOURCES = [
  ['exams', '📝 מבחנים קודמים', 'הכי חשוב: מה שחוזר במבחנים מקבל עדיפות ומקום'],
  ['material', '📚 חומרי הקורס', 'סילבוס, דפי נוסחאות רשמיים, ספר הקורס'],
  ['summaries', '✍️ הסיכומים שלך', ''],
  ['slides', '🎓 שקפי הרצאות', ''],
  ['tutorials', '🧮 תרגולים', ''],
  ['hw', '📘 שיעורי בית', ''],
];
const FS_BLOCKS = {
  h: ['כותרת משנה', [['md', 'text', 'כותרת']]],
  kv: ['הגדרה: נוסחה', [['label', 'text', 'תווית (מודגשת)'], ['tex', 'tex', 'נוסחה (LaTeX)'], ['note', 'md', 'הערה אחרי הנוסחה']]],
  eq: ['נוסחה ממורכזת', [['tex', 'tex', 'נוסחה (LaTeX)']]],
  text: ['פסקה', [['md', 'md', 'טקסט (**מודגש**, $נוסחה$)']]],
  list: ['רשימה', [['items', 'lines', 'שורה לכל פריט'], ['style', 'select:square,bullet,num', 'סגנון']]],
  steps: ['סדר פעולות (סד״פ)', [['title', 'text', 'כותרת'], ['items', 'lines', 'שלב בכל שורה (**שם השלב:** הסבר)']]],
  callout: ['תיבת דגש / מלכודות', [['variant', 'select:tip,trap,note', 'סוג (tip=דגש אדום, trap=קיר הבושה, note=כחול)'], ['title', 'text', 'כותרת'], ['items', 'lines', 'נקודות (שורה לכל אחת)'], ['md', 'md', 'או טקסט חופשי']]],
  example: ['דוגמת בזק', [['label', 'text', 'תווית'], ['md', 'md', 'הדוגמה ($...$ עם \\Rightarrow)']]],
  figure: ['איור (SVG)', [['svg', 'code', 'קוד SVG'], ['caption', 'text', 'כיתוב'], ['width', 'number', 'רוחב (% מהעמודה)']]],
  table: ['טבלה', [['head', 'row', 'כותרות (מופרדות ב- | )'], ['rows', 'rows', 'שורה לכל שורה, תאים מופרדים ב- | ']]],
  symbols: ['טבלת סימנים ויחידות', [['rows', 'rows', 'סימן | משמעות | יחידות (שורה לכל סימן)']]],
  code: ['קטע קוד', [['title', 'text', 'כותרת'], ['code', 'code', 'קוד (מוצג כמו שהוא, משמאל לימין)']]],
};

let fsOpenId = null;
let fsSelSection = null;
let fsLayoutToken = 0;
// AI generation in progress or failed, per sheet: { state: 'run' | 'error', html, files, usePangea, useDrive }.
// Kept here (not in the page) so a redraw of the editor can't wipe the progress or the error.
const fsGen = {};
// A sheet with no blocks at all is "empty": nothing to print, export or import.
const fsHasContent = s => (s?.sections || []).some(x => (x.blocks || []).length);

const fsSheets = () => Store.list('sheet').sort((a, b) => (b.u || 0) - (a.u || 0));
const fsSheet = () => (fsOpenId ? Store.get('sheet', fsOpenId) : null);
const fsId = () => Math.random().toString(36).slice(2, 9);

function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}
async function loadKatex() {
  loadCss(KATEX_CSS); loadCss(FS_FONT_CSS);
  if (!window.katex) await loadScript(KATEX_JS);
  return window.katex;
}

// ---------- rendering blocks ----------
function fsTex(tex, display = false) {
  try { return katex.renderToString(String(tex || ''), { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' }); }
  catch { return `<code>${esc(tex)}</code>`; }
}
// Markdown-ish: **bold**, $inline$, $$display$$, line breaks.
function fsMd(s) {
  const out = [];
  let last = 0;
  const src = String(s || '');
  for (const m of src.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g)) {
    out.push(fsText(src.slice(last, m.index)));
    out.push(m[1] != null ? fsTex(m[1], true) : `<span class="fm">${fsTex(m[2])}</span>`);
    last = m.index + m[0].length;
  }
  out.push(fsText(src.slice(last)));
  return out.join('');
}
const fsText = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

function fsSvg(svg) {
  // Strict XML first; if that fails (a duplicate attribute, a stray &), the lenient HTML parser.
  let root = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml').documentElement;
  if (!root || root.nodeName !== 'svg' || root.querySelector('parsererror')) root = new DOMParser().parseFromString(String(svg || ''), 'text/html').querySelector('svg');
  if (!root) return '<div class="fb-badsvg">⚠️ SVG לא תקין</div>';
  root.querySelectorAll('script, foreignObject, iframe').forEach(n => n.remove());
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) el.removeAttribute(a.name);
  }
  return new XMLSerializer().serializeToString(root);
}
const fsCell = c => (/^\s*<svg/i.test(c) ? fsSvg(c) : fsMd(c));

function fsBlockHtml(b) {
  switch (b.t) {
    case 'h': return `<div class="fb-h">${fsMd(b.md)}</div>`;
    case 'kv': return `<div class="fb-kv"><b>${fsMd(b.label)}${b.label ? ':' : ''}</b> <span class="fm">${fsTex(b.tex)}</span>${b.note ? ` <span>${fsMd(b.note)}</span>` : ''}</div>`;
    case 'eq': return `<div class="fb-eq">${fsTex(b.tex, true)}</div>`;
    case 'text': return `<div class="fb-text">${fsMd(b.md)}</div>`;
    case 'list': {
      const tag = b.style === 'num' ? 'ol' : 'ul';
      return `<${tag} class="fb-list ${esc(b.style || 'square')}">${(b.items || []).map(i => `<li>${fsMd(i)}</li>`).join('')}</${tag}>`;
    }
    case 'steps': return `<div class="fb-steps">${b.title ? `<b>${fsMd(b.title)}</b>` : ''}<ol>${(b.items || []).map(i => `<li>${fsMd(i)}</li>`).join('')}</ol></div>`;
    case 'callout': {
      const v = ['tip', 'trap', 'note'].includes(b.variant) ? b.variant : 'tip';
      const title = b.title || (v === 'trap' ? 'קיר הבושה - מלכודות קריטיות:' : v === 'tip' ? 'דגש:' : '');
      return `<div class="fb-callout ${v}">${title ? `<div class="fb-ct">${v === 'trap' ? '<span class="bang">!</span> ' : ''}${fsMd(title)}</div>` : ''}
        <div class="fb-cb">${b.items?.length ? `<ul>${b.items.map(i => `<li>${fsMd(i)}</li>`).join('')}</ul>` : ''}${b.md ? fsMd(b.md) : ''}</div></div>`;
    }
    case 'example': return `<div class="fb-example"><b>${fsMd(b.label || 'דוגמת בזק')}:</b> ${fsMd(b.md)}</div>`;
    case 'figure': return `<figure class="fb-fig" style="--w:${Math.max(20, Math.min(100, +b.width || 90))}%">${fsSvg(b.svg)}${b.caption ? `<figcaption>${fsMd(b.caption)}</figcaption>` : ''}</figure>`;
    case 'table': return `<table class="fb-table">${b.head?.length ? `<thead><tr>${b.head.map(h => `<th>${fsMd(h)}</th>`).join('')}</tr></thead>` : ''}
      <tbody>${(b.rows || []).map(r => `<tr>${r.map(c => `<td>${fsCell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    case 'symbols': return `<table class="fb-table fb-sym"><thead><tr><th>סימן</th><th>משמעות</th><th>יחידות</th></tr></thead>
      <tbody>${(b.rows || []).map(([s, m, u]) => `<tr><td>${fsTex(s)}</td><td>${fsMd(m)}</td><td>${u ? fsTex(u) : ''}</td></tr>`).join('')}</tbody></table>`;
    case 'code': return `<div class="fb-code">${b.title ? `<b>${fsMd(b.title)}</b>` : ''}<pre dir="ltr">${esc(b.code || '')}</pre></div>`;
    default: return `<div class="fb-text">${fsMd(b.md || '')}</div>`;
  }
}

// ---------- layout: blocks → columns → A4 pages ----------
const FS_PAGE = { w: 794, h: 1122, padX: 30, padTop: 28, padBottom: 22, foot: 20, gap: 16, base: 10.6 };

function fsGeometry(cols) {
  const colW = (FS_PAGE.w - 2 * FS_PAGE.padX - (cols - 1) * FS_PAGE.gap) / cols;
  const colH = FS_PAGE.h - FS_PAGE.padTop - FS_PAGE.padBottom - FS_PAGE.foot;
  return { colW, colH };
}

// Units are what can't be split: a block, or a section title together with its first block.
function fsUnits(sheet) {
  const units = [];
  (sheet.sections || []).forEach((s, si) => {
    if (s.hidden) return;
    const blocks = (s.blocks || []).map((b, bi) => ({ b, bi })).filter(x => !x.b.hidden);
    const title = `<h3 class="fs-sec" data-sec="${si}">${fsMd(s.title)}</h3>`;
    if (!blocks.length) { units.push({ html: title, si, bi: -1 }); return; }
    blocks.forEach(({ b, bi }, k) => units.push({ html: (k === 0 ? title : '') + `<div class="fs-blk" data-sec="${si}" data-blk="${bi}">${fsBlockHtml(b)}</div>`, si, bi }));
  });
  return units;
}

function fsPack(heights, colH) {
  const cols = [[]];
  let h = 0;
  heights.forEach((uh, i) => {
    if (h + uh > colH && cols[cols.length - 1].length) { cols.push([]); h = 0; }
    cols[cols.length - 1].push(i);
    h += uh;
  });
  return cols;
}

async function fsLayout(sheet, host) {
  const token = ++fsLayoutToken;
  await loadKatex();
  await document.fonts?.ready;
  if (token !== fsLayoutToken) return null;
  const cols = Math.max(1, Math.min(4, +sheet.cols || 3));
  const target = Math.max(1, +sheet.pages || 2);
  const { colW, colH } = fsGeometry(cols);
  const units = fsUnits(sheet);

  const measure = document.createElement('div');
  measure.className = `fs-theme-${sheet.theme || 'standard'} fs-measure`;
  measure.style.width = colW + 'px';
  measure.innerHTML = units.map(u => `<div class="fs-unit">${u.html}</div>`).join('');
  document.body.appendChild(measure);
  const nodes = [...measure.children];
  // A formula wider than its column is shrunk just enough to fit (never below half size).
  const wide = $$('.katex-display > .katex, .fm', measure);
  const fitWide = () => {
    wide.forEach(el => { el.style.fontSize = ''; });
    for (const el of wide) {
      const box = el.closest('td') || el.closest('.fb-callout') || el.closest('.fs-unit');
      const avail = box.clientWidth - (box.tagName === 'TD' ? 6 : box.classList.contains('fb-callout') ? 16 : 0);
      const w = Math.max(el.getBoundingClientRect().width, el.scrollWidth); // display math is a full-width block
      if (w > avail) el.style.fontSize = (el.classList.contains('fm') ? 1 : 1.08) * Math.max(0.5, avail / w) + 'em';
    }
  };
  const heightsAt = scale => {
    measure.style.fontSize = (FS_PAGE.base * scale) + 'px';
    fitWide();
    return nodes.map(n => n.getBoundingClientRect().height);
  };

  // Auto-fit: the biggest font that still fits in the pages you allow.
  let scale = Math.max(0.6, Math.min(1.3, +sheet.scale || 1));
  let packed;
  if (sheet.autofit !== false) {
    const tries = [1.2, 1.15, 1.1, 1.06, 1.03, 1, 0.97, 0.94, 0.91, 0.88, 0.85, 0.82, 0.79, 0.76, 0.73, 0.7, 0.67, 0.64];
    for (const s of tries) {
      packed = fsPack(heightsAt(s), colH);
      scale = s;
      if (Math.ceil(packed.length / cols) <= target) break;
    }
  } else packed = fsPack(heightsAt(scale), colH);
  measure.style.fontSize = (FS_PAGE.base * scale) + 'px';

  const nPages = Math.max(1, Math.ceil(packed.length / cols));
  const footer = sheet.footer || sheet.title || '';
  const pages = [];
  for (let p = 0; p < nPages; p++) {
    const page = document.createElement('div');
    page.className = `fs-page fs-theme-${sheet.theme || 'standard'}${p >= target ? ' over' : ''}`;
    page.style.fontSize = (FS_PAGE.base * scale) + 'px';
    page.style.setProperty('--cols', cols);
    const row = document.createElement('div');
    row.className = 'fs-cols';
    for (let c = 0; c < cols; c++) {
      const col = document.createElement('div');
      col.className = 'fs-col';
      col.style.width = colW + 'px';
      for (const i of packed[p * cols + c] || []) {
        const n = nodes[i];
        n.dataset.si = units[i].si;
        col.appendChild(n);
      }
      row.appendChild(col);
    }
    page.appendChild(row);
    const foot = document.createElement('div');
    foot.className = 'fs-foot';
    foot.textContent = `${footer}${nPages > 1 ? `  ·  ${p + 1}/${nPages}` : ''}`;
    page.appendChild(foot);
    pages.push(page);
  }
  measure.remove();
  if (token !== fsLayoutToken) return null;
  host.replaceChildren(...pages);
  return { pages: nPages, target, scale, cols };
}

// ---------- screens ----------
function renderFormula(root) {
  const sheet = fsSheet();
  if (!sheet) { fsOpenId = null; renderSheetList(root); }
  else renderSheetEditor(root, sheet);
  $('#fsTour', root).onclick = () => appTour(FS_TOUR, 'pp_tour_fs');
  maybeAppTour(FS_TOUR, 'pp_tour_fs');
}

function renderSheetList(root) {
  const list = fsSheets();
  root.innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <div><h2>📐 מחולל נוסחאונים</h2><p class="muted">נוסחאון לכל קורס, בסגנון שלך: בוחרים כמה עמודים, מה חשוב, ומאיזה חומר. אחר כך עורכים (גם עם AI) ומייצאים ל-PDF.</p></div>
        <div class="row wrap">
          <button class="btn" type="button" id="fsTour">🎓 מדריך</button>
          <button class="btn" type="button" data-go="tools">← לכלים</button>
          <button class="btn" type="button" id="fsImport">📥 ייבוא JSON</button>
          <button class="btn primary" type="button" id="fsNew">＋ נוסחאון חדש</button>
        </div>
      </div>
      ${list.length ? `<div class="fs-list">${list.map(s => `
        <button type="button" class="fs-item" data-open="${esc(s.id)}">
          <span class="fs-thumb">📐</span>
          <span><b>${esc(s.title || 'נוסחאון')}</b><small class="muted">${esc(courseLabel(s.course) || '')} · ${(s.sections || []).length} פרקים · ${s.pages || 2} עמ׳</small>
          <span class="chips">${fsGen[s.id]?.state === 'run' ? '<span class="chip">✨ בבנייה ברקע…</span>' : fsGen[s.id]?.state === 'error' ? '<span class="chip">⚠️ היצירה לא הושלמה</span>' : ''}${(s.profile || []).map(p => `<span class="chip">${FS_PROFILES[p] || p}</span>`).join('')}</span></span>
        </button>`).join('')}</div>`
      : `<div class="fs-empty"><p>עוד אין נוסחאונים.</p><p class="muted">אפשר להתחיל מנוסחאון חדש, או לפתוח את הדוגמה (מכניקת מוצקים 1, בנויה מחדש מהנוסחאון שלך) כדי לראות איך זה עובד.</p></div>`}
      ${typeof FS_SAMPLE_SOLIDS !== 'undefined' ? `<div class="actions" style="justify-content:flex-start"><button class="btn" type="button" id="fsSample">📄 פתח דוגמה: מכניקת מוצקים 1</button></div>` : ''}
    </section>`;
  $('#fsNew', root).onclick = () => fsNewSheet();
  $('#fsImport', root).onclick = () => fsImportJson();
  $$('[data-open]', root).forEach(b => b.onclick = () => { fsOpenId = b.dataset.open; render(); });
  if ($('#fsSample', root)) $('#fsSample', root).onclick = () => {
    const id = uid();
    Store.put('sheet', id, structuredClone(FS_SAMPLE_SOLIDS));
    fsOpenId = id; render();
  };
}

function renderSheetEditor(root, sheet) {
  const secs = sheet.sections || [];
  const cov = sheet.coverage || [];
  root.innerHTML = `
    <section class="panel fs-editor">
      <div class="toolbar fs-bar">
        <div class="row wrap">
          <button class="btn" type="button" id="fsBack">← כל הנוסחאונים</button>
          <input id="fsTitle" class="fs-title-in" value="${esc(sheet.title || '')}" placeholder="שם הנוסחאון">
        </div>
        <div class="row wrap">
          <label class="fs-mini">עמודים <input id="fsPages" type="number" min="1" max="12" value="${+sheet.pages || 2}"></label>
          <label class="fs-mini">עמודות <select id="fsCols">${[2, 3, 4].map(n => `<option ${(+sheet.cols || 3) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="fs-mini"><input type="checkbox" id="fsAuto" ${sheet.autofit !== false ? 'checked' : ''}> התאמה אוטומטית</label>
          ${sheet.autofit === false ? `<label class="fs-mini">גודל <input id="fsScale" type="range" min="0.6" max="1.3" step="0.01" value="${+sheet.scale || 1}"></label>` : ''}
          <button class="btn" type="button" id="fsAi">✨ עזרה מ-AI</button>
          <button class="btn primary" type="button" id="fsPrint">🖨️ PDF</button>
          <button class="btn" type="button" id="fsMore" title="עוד">⋯</button>
          <button class="btn" type="button" id="fsTour" title="מדריך">🎓</button>
        </div>
      </div>
      <div class="fs-status" id="fsStatus"><span class="muted">מסדר את העמודים…</span></div>
      <div class="fs-layout">
        <aside class="fs-side">
          <div class="fs-box">
            <div class="fs-box-h"><b>🧭 אופי הקורס</b><button class="btn small" type="button" id="fsProfile">שנה</button></div>
            <div class="chips">${(sheet.profile || []).map(p => `<span class="chip">${FS_PROFILES[p] || esc(p)}</span>`).join('') || '<span class="muted">לא הוגדר</span>'}</div>
            ${sheet.brief?.emphasis ? `<p class="muted small">🎯 ${esc(sheet.brief.emphasis)}</p>` : ''}
          </div>
          <div class="fs-box">
            <div class="fs-box-h"><b>📑 פרקים</b><button class="btn small" type="button" id="fsAddSec">＋ פרק</button></div>
            <ol class="fs-outline">${secs.map((s, i) => `
              <li class="${s.hidden ? 'off' : ''} ${fsSelSection === i ? 'sel' : ''}" data-osec="${i}">
                <span class="fs-oname" data-gosec="${i}">${esc(s.title)} <small class="muted">${(s.blocks || []).length}</small></span>
                <span class="fs-oacts">
                  <button type="button" data-addblk="${i}" title="הוסף בלוק">＋</button>
                  <button type="button" data-secup="${i}" title="למעלה">▲</button>
                  <button type="button" data-secdn="${i}" title="למטה">▼</button>
                  <button type="button" data-sechide="${i}" title="${s.hidden ? 'הצג' : 'הסתר'}">${s.hidden ? '👁️' : '🙈'}</button>
                  <button type="button" data-secedit="${i}" title="שנה שם / מחק">✏️</button>
                </span>
              </li>`).join('')}</ol>
            <p class="muted small">לחץ על כל חלק בעמוד כדי לערוך אותו.</p>
          </div>
          <div class="fs-box">
            <div class="fs-box-h"><b>✅ כיסוי החומר</b>${cov.length ? `<small class="muted">${cov.filter(c => c.status === 'in').length}/${cov.length}</small>` : ''}</div>
            ${cov.length ? `<ul class="fs-cov">${cov.map(c => `<li class="${esc(c.status)}"><span>${c.status === 'in' ? '✅' : c.status === 'partial' ? '🟡' : '❌'}</span> ${esc(c.topic)}${c.note ? `<small class="muted"> · ${esc(c.note)}</small>` : ''}</li>`).join('')}</ul>`
              : '<p class="muted small">כשהנוסחאון נוצר מהסילבוס, כאן תראה אילו נושאים מכוסים ומה חסר.</p>'}
          </div>
        </aside>
        <div class="fs-preview" id="fsPreview"><div class="fs-pages" id="fsSheet"></div></div>
      </div>
    </section>`;

  const save = patch => Store.put('sheet', sheet.id, patch);
  $('#fsBack', root).onclick = () => { fsOpenId = null; render(); };
  $('#fsTitle', root).onchange = e => save({ title: e.target.value.trim() });
  $('#fsPages', root).onchange = e => save({ pages: Math.max(1, Math.min(12, +e.target.value || 2)) });
  $('#fsCols', root).onchange = e => save({ cols: +e.target.value });
  $('#fsAuto', root).onchange = e => save({ autofit: e.target.checked });
  if ($('#fsScale', root)) $('#fsScale', root).onchange = e => save({ scale: +e.target.value });
  $('#fsPrint', root).onclick = fsPrint;
  $('#fsAi', root).onclick = () => fsAiDialog(sheet);
  $('#fsMore', root).onclick = () => fsMoreDialog(sheet);
  $('#fsProfile', root).onclick = () => fsProfileDialog(sheet);
  $('#fsAddSec', root).onclick = () => {
    const title = prompt('שם הפרק החדש:');
    if (title) save({ sections: [...secs, { id: fsId(), title, blocks: [] }] });
  };
  const moveSec = (i, d) => { const j = i + d; if (j < 0 || j >= secs.length) return; const a = [...secs]; [a[i], a[j]] = [a[j], a[i]]; save({ sections: a }); };
  $$('[data-secup]', root).forEach(b => b.onclick = () => moveSec(+b.dataset.secup, -1));
  $$('[data-secdn]', root).forEach(b => b.onclick = () => moveSec(+b.dataset.secdn, 1));
  $$('[data-sechide]', root).forEach(b => b.onclick = () => { const i = +b.dataset.sechide; save({ sections: secs.map((s, k) => k === i ? { ...s, hidden: !s.hidden } : s) }); });
  $$('[data-secedit]', root).forEach(b => b.onclick = () => fsSectionDialog(sheet, +b.dataset.secedit));
  $$('[data-addblk]', root).forEach(b => b.onclick = () => fsAddBlockDialog(sheet, +b.dataset.addblk));
  $$('[data-gosec]', root).forEach(b => b.onclick = () => {
    fsSelSection = +b.dataset.gosec;
    $$('.fs-outline li', root).forEach(li => li.classList.toggle('sel', +li.dataset.osec === fsSelSection));
    const el = $(`#fsSheet .fs-sec[data-sec="${fsSelSection}"]`) || $(`#fsSheet .fs-blk[data-sec="${fsSelSection}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    fsHighlightSection();
  });

  const pagesHost = $("#fsSheet", root);
  pagesHost.onclick = e => {
    const blk = e.target.closest('.fs-blk');
    if (blk) return fsBlockDialog(sheet, +blk.dataset.sec, +blk.dataset.blk);
    const sec = e.target.closest('.fs-sec');
    if (sec) fsSectionDialog(sheet, +sec.dataset.sec);
  };
  const gen = fsGen[sheet.id];
  if (!secs.length) {
    // Nothing to lay out: say so and offer the ways to fill it, instead of a blank page that looks "done".
    fsLayoutToken++;
    $('#fsStatus', root).innerHTML = gen ? gen.html : '<span class="bad">⚠️ הנוסחאון ריק: עוד אין בו תוכן</span>';
    pagesHost.innerHTML = fsBlankHtml(sheet, gen);
    pagesHost.style.zoom = '';
    pagesHost.onclick = null;
    $('#fsBlankAi', root)?.addEventListener('click', () => fsGenerateDialog(sheet));
    $('#fsBlankRetry', root)?.addEventListener('click', () => fsGenerate(sheet.id, gen.files, gen.usePangea, gen.useDrive));
    $('#fsBlankBrief', root)?.addEventListener('click', async () => { await navigator.clipboard.writeText(fsBriefPrompt(sheet)); toast('הבריף הועתק. שלח אותו ל-Claude יחד עם חומרי הקורס, ואז "ייבוא JSON".'); });
    $('#fsBlankImport', root)?.addEventListener('click', () => fsImportJson(sheet.id));
    $('#fsBlankKey', root)?.addEventListener('click', () => go('cv'));
    return;
  }
  fsLayout(sheet, pagesHost).then(info => {
    if (!info) return;
    fsFitPreview();
    fsHighlightSection();
    const st = $('#fsStatus');
    if (!st) return;
    if (gen) { st.innerHTML = gen.html; return; }
    const over = info.pages > info.target;
    st.innerHTML = `<span class="${over ? 'bad' : 'ok'}">${over ? '⚠️' : '✓'} ${info.pages} ${info.pages === 1 ? 'עמוד' : 'עמודים'} מתוך ${info.target}</span>
      <span class="muted">· גודל גופן ${Math.round(info.scale * 100)}%${sheet.autofit !== false ? ' (אוטומטי)' : ''}</span>
      ${over ? `<span class="muted">· חורג. הסתר בלוקים, קצר, או בקש מ-AI "לקצר כדי שייכנס ל-${info.target} עמודים".</span>` : ''}`;
  });
}

// The empty sheet: what happened, and how to fill it.
function fsBlankHtml(sheet, gen) {
  if (gen?.state === 'run') return `<div class="fs-blank"><div class="fs-blank-ic">✨</div><h3>הנוסחאון בבנייה</h3><p id="fsGenMsg">${gen.html}</p><p class="muted small">קודם תכנון, אחר כך כל הפרקים נכתבים בו-זמנית, ואז בדיקה מול המקורות. זה רץ ברקע: אפשר לעבור לכל מסך אחר באפליקציה, ותקבל הודעה כשהנוסחאון מוכן. רק לא לסגור או לרענן את האפליקציה.</p><div class="fs-blank-acts"><button class="btn small" type="button" data-fsgen-cancel>✖ בטל</button></div></div>`;
  const hasKey = !!claudeKey();
  return `<div class="fs-blank">
    <div class="fs-blank-ic">${gen ? '⚠️' : '📄'}</div>
    <h3>${gen ? 'היצירה לא הושלמה' : 'הנוסחאון עדיין ריק'}</h3>
    ${gen ? `<p>${gen.html}</p>` : `<p class="muted">נשמרו רק ההגדרות (קורס, עמודים, אופי ודגשים). התוכן עצמו עוד לא נוצר.</p>`}
    <div class="fs-blank-acts">
      ${gen ? '<button class="btn primary" type="button" id="fsBlankRetry">🔁 נסה שוב עם אותם חומרים</button>' : ''}
      <button class="btn ${gen ? '' : 'primary'}" type="button" id="fsBlankAi" ${hasKey ? '' : 'disabled'}>✨ צור עם AI</button>
      <button class="btn" type="button" id="fsBlankBrief">📋 העתק בריף ל-Claude</button>
      <button class="btn" type="button" id="fsBlankImport">📥 ייבוא JSON מוכן</button>
    </div>
    ${hasKey ? '' : '<p class="muted small">ל"צור עם AI" צריך מפתח API של Anthropic. <button class="btn small" type="button" id="fsBlankKey">להגדרות AI</button></p>'}
    <p class="muted small">בלי מפתח: העתק את הבריף, שלח אותו ל-Claude עם חומרי הקורס, וייבא את קובץ ה-JSON שמתקבל. אפשר גם לבנות ידנית עם "＋ פרק".</p>
    <p class="muted small">גרסת האפליקציה: ${esc(document.querySelector('script[src*="formula.js"]')?.src.match(/v=(\d+)/)?.[1] || '?')}</p>
  </div>`;
}

function fsHighlightSection() {
  $$('#fsSheet .sel-sec').forEach(n => n.classList.remove('sel-sec'));
  if (fsSelSection == null) return;
  $$(`#fsSheet .fs-unit[data-si="${fsSelSection}"]`).forEach(n => n.classList.add('sel-sec'));
}

function fsFitPreview() {
  const wrap = $('#fsPreview'), pages = $("#fsSheet");
  if (!wrap || !pages) return;
  const z = Math.min(1.15, (wrap.clientWidth - 8) / FS_PAGE.w);
  pages.style.zoom = z;
}
window.addEventListener('resize', () => { if (currentView === 'formula') fsFitPreview(); });

// ---------- editing ----------
function fsPutSections(sheet, sections) { Store.put('sheet', sheet.id, { sections }); }

function fsFieldHtml([key, kind, label], b) {
  const v = b[key];
  if (kind.startsWith('select:')) {
    const opts = kind.slice(7).split(',');
    return `<label class="field"><span class="field-label">${esc(label)}</span><select name="${key}">${opts.map(o => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
  }
  let text = v ?? '';
  if (kind === 'lines') text = (v || []).join('\n');
  if (kind === 'row') text = (v || []).join(' | ');
  if (kind === 'rows') text = (v || []).map(r => r.join(' | ')).join('\n');
  if (kind === 'number') return `<label class="field"><span class="field-label">${esc(label)}</span><input name="${key}" type="number" value="${esc(text)}" style="width:100px"></label>`;
  if (kind === 'text') return `<label class="field"><span class="field-label">${esc(label)}</span><input name="${key}" value="${esc(text)}"></label>`;
  const rows = kind === 'code' ? 8 : kind === 'tex' ? 2 : 3;
  const ltr = ['tex', 'code'].includes(kind) ? ' dir="ltr" class="mono"' : '';
  return `<label class="field"><span class="field-label">${esc(label)}</span><textarea name="${key}" rows="${rows}"${ltr}>${esc(text)}</textarea></label>`;
}

function fsReadFields(form, t) {
  const b = { t };
  for (const [key, kind] of FS_BLOCKS[t][1]) {
    const el = form.elements[key];
    if (!el) continue;
    const v = el.value;
    if (kind === 'lines') b[key] = v.split('\n').map(s => s.trim()).filter(Boolean);
    else if (kind === 'row') b[key] = v.split('|').map(s => s.trim()).filter((s, i, a) => s || a.length > 1);
    else if (kind === 'rows') b[key] = v.split('\n').filter(s => s.trim()).map(r => r.split('|').map(s => s.trim()));
    else if (kind === 'number') b[key] = v === '' ? undefined : +v;
    else b[key] = v;
  }
  for (const k of Object.keys(b)) if (b[k] === '' || b[k] === undefined || (Array.isArray(b[k]) && !b[k].length)) delete b[k];
  return b;
}

function fsBlockDialog(sheet, si, bi, fresh) {
  const secs = structuredClone(sheet.sections || []);
  const sec = secs[si];
  const b = fresh || sec?.blocks?.[bi];
  if (!b) return;
  const t = FS_BLOCKS[b.t] ? b.t : 'text';
  openModal(`
    <h2>✏️ ${FS_BLOCKS[t][0]} <small class="muted">· ${esc(sec.title)}</small></h2>
    <div class="fs-edit-grid">
      <div>${FS_BLOCKS[t][1].map(f => fsFieldHtml(f, b)).join('')}</div>
      <div><span class="field-label">תצוגה מקדימה</span><div class="fs-theme-standard fs-live" id="fsLive"></div></div>
    </div>
    <div class="fs-ai-row">
      <input id="fsBlockAi" placeholder="✨ בקש מ-AI: למשל &quot;הוסף את המקרה של חתך דק דופן&quot; או &quot;צייר איור של קורה רתומה&quot;">
      <button class="btn" type="button" id="fsBlockAiGo">✨ שנה</button>
    </div>
    <p class="muted small" id="fsBlockAiMsg"></p>
    <div class="actions">
      ${fresh ? '' : `<button class="btn danger" value="delete" formnovalidate>מחק</button>
      <button class="btn" value="hide" formnovalidate>${b.hidden ? '👁️ הצג' : '🙈 הסתר'}</button>
      <button class="btn" value="dup" formnovalidate>שכפל</button>
      <button class="btn" value="up" formnovalidate>▲</button>
      <button class="btn" value="down" formnovalidate>▼</button>`}
      <button class="btn" value="cancel" formnovalidate>ביטול</button>
      <button class="btn primary" value="save">שמור</button>
    </div>`, (action, fd) => {
    const form = $('#modalForm');
    const nb = { ...fsReadFields(form, t), ...(b.hidden ? { hidden: true } : {}) };
    const blocks = sec.blocks || (sec.blocks = []);
    if (fresh) { if (action === 'save') blocks.push(nb); else return; }
    else if (action === 'delete') blocks.splice(bi, 1);
    else if (action === 'hide') blocks[bi] = { ...nb, hidden: !b.hidden };
    else if (action === 'dup') blocks.splice(bi + 1, 0, structuredClone(nb));
    else if (action === 'up' && bi > 0) { blocks[bi] = nb; [blocks[bi - 1], blocks[bi]] = [blocks[bi], blocks[bi - 1]]; }
    else if (action === 'down' && bi < blocks.length - 1) { blocks[bi] = nb; [blocks[bi + 1], blocks[bi]] = [blocks[bi], blocks[bi + 1]]; }
    else if (action === 'save') blocks[bi] = nb;
    else return;
    fsPutSections(sheet, secs);
  }, form => {
    const live = () => { try { $('#fsLive', form).innerHTML = fsBlockHtml(fsReadFields(form, t)); } catch {} };
    loadKatex().then(live);
    form.addEventListener('input', live);
    $('#fsBlockAiGo', form).onclick = async () => {
      const ask = $('#fsBlockAi', form).value.trim();
      if (!ask) return;
      const msg = $('#fsBlockAiMsg', form);
      msg.textContent = '✨ חושב…';
      try {
        const out = await fsAiCall(`Edit ONE block of the formula sheet "${sheet.title}" (course: ${courseLabel(sheet.course) || ''}, section: "${sec.title}").
Current block JSON:\n${JSON.stringify(fsReadFields(form, t))}\n\nThe student asks: ${ask}\n\nReturn {"blocks":[...]} with the replacement block(s) (usually one block of the same type "${t}").`, FS_BLOCKS_SCHEMA);
        const nb = out.blocks?.[0];
        if (!nb) throw new Error('לא התקבל בלוק');
        if (nb.t !== t) { msg.textContent = `ה-AI הציע בלוק מסוג אחר (${FS_BLOCKS[nb.t]?.[0] || nb.t}). הוא נוסף אחרי הבלוק הזה.`; sec.blocks.splice(bi + 1, 0, ...out.blocks); fsPutSections(sheet, secs); return; }
        for (const [key, kind] of FS_BLOCKS[t][1]) {
          const el = form.elements[key]; if (!el) continue;
          const v = nb[key];
          el.value = kind === 'lines' ? (v || []).join('\n') : kind === 'row' ? (v || []).join(' | ') : kind === 'rows' ? (v || []).map(r => r.join(' | ')).join('\n') : (v ?? '');
        }
        live();
        msg.textContent = '✓ עודכן. בדוק בתצוגה ולחץ שמור.';
      } catch (e) { msg.innerHTML = aiErrorHtml(e); }
    };
  });
  fsWide();
}

function fsAddBlockDialog(sheet, si) {
  openModal(`<h2>＋ בלוק חדש</h2><div class="fs-types">${Object.entries(FS_BLOCKS).map(([t, [l]]) => `<button class="btn" type="button" data-t="${t}">${l}</button>`).join('')}</div>
    <div class="actions"><button class="btn" value="cancel">ביטול</button></div>`, () => {}, form => {
    $$('[data-t]', form).forEach(b => b.onclick = () => {
      $('#modal').close();
      const t = b.dataset.t;
      const fresh = { t, ...(t === 'callout' ? { variant: 'tip' } : {}), ...(t === 'steps' ? { title: 'סדר פעולות (סד״פ):' } : {}), ...(t === 'list' ? { style: 'square' } : {}) };
      fsBlockDialog(sheet, si, -1, fresh);
    });
  });
}

function fsSectionDialog(sheet, si) {
  const secs = structuredClone(sheet.sections || []);
  const s = secs[si];
  if (!s) return;
  openModal(`<h2>📑 פרק</h2>
    <label class="field"><span class="field-label">שם הפרק</span><input name="title" value="${esc(s.title)}"></label>
    <div class="actions"><button class="btn danger" value="delete" formnovalidate>מחק פרק</button>
    <button class="btn" value="cancel" formnovalidate>ביטול</button><button class="btn primary" value="save">שמור</button></div>`, (action, fd) => {
    if (action === 'delete') { if (!confirm(`למחוק את "${s.title}" עם ${(s.blocks || []).length} הבלוקים שבו?`)) return false; secs.splice(si, 1); }
    else if (action === 'save') s.title = String(fd.get('title')).trim() || s.title;
    else return;
    fsPutSections(sheet, secs);
  });
}

function fsProfileDialog(sheet) {
  const cur = sheet.profile || [];
  openModal(`<h2>🧭 אופי הקורס</h2>
    <p class="muted">קובע מה הנוסחאון ידגיש: בקורס כמו מכניקת מוצקים איורים הם חלק מהעניין, במד״ר הם מיותרים.</p>
    <div class="fs-checks">${fsProfileChecks(cur)}</div>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>ביטול</button><button class="btn primary" value="save">שמור</button></div>`, (action, fd) => {
    if (action === 'save') Store.put('sheet', sheet.id, { profile: fd.getAll('p') });
  });
}

function fsMoreDialog(sheet) {
  openModal(`<h2>⋯ עוד</h2>
    <div class="fs-more">
      <button class="btn" type="button" id="fmExport">💾 ייצוא JSON (גיבוי / שליחה ל-Claude)</button>
      <button class="btn" type="button" id="fmImport">📥 החלף בתוכן מ-JSON</button>
      <button class="btn" type="button" id="fmBrief">📋 העתק בריף ליצירה עם Claude</button>
      <label class="field"><span class="field-label">כותרת תחתונה</span><input id="fmFooter" value="${esc(sheet.footer || '')}" placeholder="${esc(sheet.title || '')}"></label>
      <button class="btn danger" type="button" id="fmDelete">🗑️ מחק נוסחאון</button>
    </div>
    <div class="actions"><button class="btn" value="cancel">סגור</button></div>`, () => {}, form => {
    $('#fmExport', form).onclick = () => {
      if (!fsHasContent(sheet)) toast('שים לב: הנוסחאון ריק. הקובץ מכיל רק את ההגדרות והבריף, בלי תוכן.');
      fsDownload(`${sheet.title || 'נוסחאון'}.json`, JSON.stringify(fsExportable(sheet), null, 1));
    };
    $('#fmImport', form).onclick = () => { $('#modal').close(); fsImportJson(sheet.id); };
    $('#fmBrief', form).onclick = async () => { await navigator.clipboard.writeText(fsBriefPrompt(sheet)); toast('הבריף הועתק. הדבק אותו ל-Claude יחד עם קבצי הקורס.'); };
    $('#fmFooter', form).onchange = e => Store.put('sheet', sheet.id, { footer: e.target.value.trim() });
    $('#fmDelete', form).onclick = () => {
      if (!confirm(`למחוק את "${sheet.title}"?`)) return;
      Store.remove('sheet', sheet.id); fsOpenId = null; $('#modal').close(); render();
    };
  });
}

const fsExportable = s => { const { id, kind, u, fu, gid, del, ...rest } = s; return rest; };
function fsDownload(name, text, type = 'application/json') {
  saveFile(new Blob([text], { type }), name);
}

function fsImportJson(intoId) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = async () => {
    try {
      const data = JSON.parse(await input.files[0].text());
      if (!Array.isArray(data.sections)) throw new Error('אין בקובץ "sections"');
      if (!fsHasContent(data)) throw new Error('הקובץ ריק: יש בו רק הגדרות, בלי פרקים ונוסחאות. זו טיוטה שעוד לא מולאה');
      const id = intoId || uid();
      const prev = intoId ? Store.get('sheet', intoId) : null;
      Store.put('sheet', id, { pages: 2, cols: 3, theme: 'standard', ...(prev ? fsExportable(prev) : {}), ...data });
      fsOpenId = id; if (currentView !== 'formula') go('formula'); else render();
      toast('הנוסחאון יובא');
    } catch (e) { toast('הייבוא נכשל: ' + e.message); }
  };
  input.click();
}

// ---------- print / PDF ----------
function fsPrint() {
  const pages = $$('#fsSheet .fs-page');
  if (!pages.length || !fsHasContent(fsSheet())) return toast('הנוסחאון ריק: אין עדיין מה להדפיס.');
  const holder = document.createElement('div');
  holder.id = 'fsPrintRoot';
  pages.forEach(p => { const c = p.cloneNode(true); c.classList.remove('over'); holder.appendChild(c); });
  holder.querySelectorAll('.sel-sec').forEach(n => n.classList.remove('sel-sec'));
  document.body.appendChild(holder);
  document.body.classList.add('printing-fs');
  const prevTitle = document.title;
  document.title = fsSheet()?.title || 'נוסחאון';
  const done = () => { document.body.classList.remove('printing-fs'); holder.remove(); document.title = prevTitle; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}

// ---------- new sheet: the brief ----------
const fsSourcesHtml = () => `<div class="fs-sources">${FS_SOURCES.map(([k, l, d]) => `<label class="fs-src"><span>${l}${d ? `<small class="muted">${d}</small>` : ''}</span><input type="file" name="src_${k}" multiple accept=".pdf,.docx,.txt,.md,.tex"></label>`).join('')}
        <label class="fs-src"><span>💡 נוסחאון קיים לדוגמה והשראה<small class="muted">הסגנון והמבנה שלו ילמדו</small></span><input type="file" name="src_inspire" multiple accept=".pdf,.docx,.txt,.md,.tex,.json"></label>
        <label class="fs-src" id="fsPangeaRow"><span>💧 סיכומי פנגייה לקורס<small class="muted" id="fsPangeaNote">בודק…</small></span><input type="checkbox" name="pangea" id="fsPangea" disabled></label>
        <label class="fs-src" id="fsDriveRow"><span>📁 תיקיית ה-Drive של הקורס<small class="muted" id="fsDriveNote">בודק…</small></span><input type="checkbox" name="cdrive" id="fsDrive" disabled></label>
      </div>`;

// ---------- the course's Drive folder as a source ----------
// The folder linked to the course (Tools → 📁 Drive). Each file is sorted into a source kind by
// its sub-folder and name; the first rule that matches wins, anything else is course material.
const FS_DRIVE_RULES = [
  ['inspire', /נוסחאון/],
  ['material', /formula|נוסחאות|סילבוס|syllabus/i],
  ['exams', /מבח|בחינ|מועד|בוחן|exam|moed|quiz/i],
  ['hw', /ש["״']?ב\b|שיעורי.?בית|תרגילי?.?בית|גיליו|homework|\bhw/i],
  ['tutorials', /תרגול|tutorial|recitation/i],
  ['slides', /הרצא|שקפ|מצגת|lecture|slides/i],
  ['summaries', /סיכו|פנגי|summar|notability/i],
];
const FS_DRIVE_MAX = { exams: 14, material: 8, summaries: 10, slides: 14, tutorials: 16, hw: 8, inspire: 2 };
const FS_DRIVE_GDOC = 'application/vnd.google-apps.document';
const fsDriveCanRead = () => Sync.connected && (Sync.hasScope('driveRead') || Sync.hasScope('driveWrite'));
const fsDriveKind = f => (FS_DRIVE_RULES.find(([, re]) => re.test(`${f.cat || ''} / ${f.name}`)) || ['material'])[0];
// The files worth reading (documents up to 20MB), newest first, a few per kind.
function fsDrivePlan(code) {
  const plan = {};
  const files = (CDrive.entry(code)?.files || [])
    .filter(f => (/\.(pdf|docx|txt|md|tex)$/i.test(f.name) || f.mime === FS_DRIVE_GDOC) && f.size <= 20e6)
    .sort((a, b) => String(b.mod).localeCompare(String(a.mod)));
  for (const f of files) {
    const k = fsDriveKind(f);
    if ((plan[k] = plan[k] || []).length < FS_DRIVE_MAX[k]) plan[k].push(f);
  }
  return plan;
}
async function fsDriveDownload(f) {
  const gdoc = f.mime === FS_DRIVE_GDOC;
  const res = await Sync.api(`${DRIVE_FILES}/${f.id}${gdoc ? '/export?mimeType=text/plain' : '?alt=media'}`);
  const blob = await res.blob();
  return new File([blob], gdoc ? f.name + '.txt' : f.name, { type: gdoc ? 'text/plain' : blob.type });
}
// Reading file contents needs one more Google permission than listing their names.
function fsDriveNeedsAccess() {
  if (fsDriveCanRead()) return false;
  if (confirm('כדי למשוך את הקבצים מתיקיית הקורס, Google צריך לאשר לאפליקציה לקרוא קבצים מהדרייב שלך (קריאה בלבד). האישור חד-פעמי; אחריו חזור לכאן ולחץ שוב על "צור".\n\nלהמשיך לאישור?')) Sync.authorize(false, ['driveRead']);
  return true;
}

function fsPangeaCheck(form, code) {
  const dNote = $('#fsDriveNote', form), dBox = $('#fsDrive', form);
  if (dNote && dBox) {
    const c = courseByCode(code);
    dBox.disabled = true; dBox.checked = false;
    const show = () => {
      if ($('#fsCourse', form) && $('#fsCourse', form).value !== code) return; // the course was changed meanwhile
      const plan = fsDrivePlan(code), n = Object.values(plan).reduce((s, a) => s + a.length, 0);
      const names = { exams: 'מבחנים', material: 'חומרי קורס', summaries: 'סיכומים', slides: 'הרצאות', tutorials: 'תרגולים', hw: 'שיעורי בית', inspire: 'נוסחאון' };
      dNote.textContent = n ? `${n} קבצים: ${Object.entries(plan).map(([k, a]) => `${a.length} ${names[k]}`).join(', ')}${fsDriveCanRead() ? '' : ' (יתבקש אישור קריאה מ-Google)'}` : 'לא נמצאו בתיקייה מסמכים (PDF / Word / טקסט)';
      dBox.disabled = !n; dBox.checked = !!n;
    };
    if (!Sync.connected) dNote.textContent = 'צריך קודם להתחבר ל-Google';
    else if (!c?.drive) dNote.textContent = 'לא קושרה תיקייה לקורס הזה (כלים ← 📁 תיקיית Drive)';
    else if (!NB.canRead()) dNote.textContent = 'חסר אישור לקריאת תיקיות הדרייב (כלים ← 📁 Drive)';
    else {
      dNote.textContent = 'קורא את התיקייה…';
      if (CDrive.entry(code)) show();
      CDrive.scan(code).then(show, () => { if (!CDrive.entry(code)) dNote.textContent = 'לא הצלחתי לקרוא את התיקייה כרגע'; });
    }
  }
  const note = $('#fsPangeaNote', form), box = $('#fsPangea', form);
  Pangea.load().then(() => {
    const pg = Pangea.course(code);
    note.textContent = pg ? `${pg.pages.length} דפים נמצאו` : 'אין סיכומים לקורס הזה';
    box.disabled = !pg; box.checked = !!pg;
  }).catch(() => { note.textContent = 'לא זמין כרגע'; });
}
const fsReadSources = fd => { const files = {}; for (const [k] of [...FS_SOURCES, ['inspire']]) files[k] = fd.getAll('src_' + k).filter(f => f && f.size); return files; };

// Fill an existing (empty) sheet with AI: same materials as a new sheet, the brief is already saved.
function fsGenerateDialog(sheet) {
  openModal(`<h2>✨ יצירת הנוסחאון עם AI</h2>
    <p class="muted">הבריף כבר שמור (${sheet.pages} עמ׳, ${sheet.cols} עמודות${sheet.brief?.emphasis ? `, דגש: ${esc(sheet.brief.emphasis)}` : ''}). צרף חומרים, או צור בלי חומרים לפי הסילבוס הרגיל של הקורס.</p>
    <div class="field"><span class="field-label">📂 חומרים (לפי סדר העדיפות). קבצי PDF נקראים במכשיר בלבד.</span>${fsSourcesHtml()}</div>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>ביטול</button><button class="btn primary" value="ai">✨ צור</button></div>`, (action, fd) => {
    if (action !== 'ai') return;
    if (fd.get('cdrive') && fsDriveNeedsAccess()) return false;
    fsGenerate(sheet.id, fsReadSources(fd), !!fd.get('pangea'), !!fd.get('cdrive'));
  }, form => fsPangeaCheck(form, sheet.course));
  fsWide();
}

function fsGuessProfile(name) {
  const n = String(name || '');
  if (/מוצקים|סטטיקה|דינמיקה|תכן|זרימה|מכני|פיזיקה|חוזק|רובוט|תנודות|מעבר חום/.test(n)) return ['figures', 'derivations', 'procedures'];
  if (/מד["״]?ר|מד["״]?ח|משוואות|חדו|אלגברה|אינפי|הסתברות|סטטיסטיקה/.test(n)) return ['derivations', 'procedures', 'proofs'];
  if (/תרמו/.test(n)) return ['derivations', 'tables', 'procedures'];
  if (/מחשב|פייתון|חישוב|תכנות|אלגוריתם/.test(n)) return ['code', 'procedures', 'tables'];
  if (/כימיה|חומרים/.test(n)) return ['tables', 'derivations', 'figures'];
  return ['derivations', 'procedures'];
}

function fsNewSheet(courseCode) {
  const list = courses();
  const active = list.filter(c => c.status === 'active');
  const opt = c => `<option value="${esc(c.code)}" ${c.code === courseCode ? 'selected' : ''}>${esc(c.name)} (${esc(c.code)})</option>`;
  const hasKey = !!claudeKey();
  openModal(`
    <h2>📐 נוסחאון חדש</h2>
    <p class="muted">כמה שאלות קצרות, כדי שהנוסחאון יתאים בדיוק לקורס ולמבחן.</p>
    <div class="grid2">
      <label class="field full"><span class="field-label">קורס</span><select name="course" id="fsCourse">
        ${active.length ? `<optgroup label="בלימוד">${active.map(opt).join('')}</optgroup>` : ''}
        <optgroup label="כל הקורסים">${list.filter(c => c.status !== 'active').map(opt).join('')}</optgroup></select></label>
      <label class="field"><span class="field-label">כמה עמודים מותר במבחן?</span><input name="pages" type="number" min="1" max="12" value="2"></label>
      <label class="field"><span class="field-label">עמודות בעמוד</span><select name="cols"><option>2</option><option selected>3</option><option>4</option></select></label>
    </div>
    <div class="field"><span class="field-label">🧭 אופי הקורס (נבחר לפי שם הקורס, אפשר לשנות)</span><div class="fs-checks" id="fsProf"></div></div>
    <label class="field"><span class="field-label">🎯 על מה לשים דגש? (נושאים, סוגי שאלות, מה המרצה אוהב)</span><textarea name="emphasis" rows="2" placeholder="למשל: עבודה וירטואלית ומסבכים מופיעים בכל מבחן; חשוב לי סד״פ לכל סוג שאלה"></textarea></label>
    <label class="field"><span class="field-label">🚫 מה לא צריך? (מה כבר בראש, מה לא במבחן)</span><textarea name="skip" rows="2" placeholder="למשל: בלי טריגונומטריה בסיסית; פרק 9 לא למבחן"></textarea></label>
    <label class="field"><span class="field-label">📌 כללי המבחן ודברים נוספים</span><textarea name="rules" rows="2" placeholder="למשל: דף דו-צדדי, מודפס בצבע; מותר מחשבון"></textarea></label>
    <div class="field"><span class="field-label">📂 חומרים (לפי סדר העדיפות). קבצי PDF נקראים במכשיר בלבד.</span>
      ${fsSourcesHtml()}
    </div>
    <div class="actions">
      <button class="btn" value="cancel" formnovalidate>ביטול</button>
      <button class="btn" value="draft" title="יוצר נוסחאון ריק עם הבריף, ומעתיק את הבריף כדי לשלוח ל-Claude עם החומרים">📋 טיוטה + בריף ל-Claude</button>
      <button class="btn primary" value="ai" ${hasKey ? '' : 'disabled title="צריך מפתח API בהגדרות AI (בלשונית קו״ח)"'}>✨ צור עם AI</button>
    </div>`, (action, fd) => {
    const code = fd.get('course');
    const c = courseByCode(code);
    const brief = { emphasis: String(fd.get('emphasis') || '').trim(), skip: String(fd.get('skip') || '').trim(), rules: String(fd.get('rules') || '').trim() };
    const sheet = {
      title: `נוסחאון ${c?.name || ''}`.trim(), course: code, pages: Math.max(1, +fd.get('pages') || 2), cols: +fd.get('cols') || 3,
      theme: 'standard', autofit: true, profile: fd.getAll('p'), brief, sections: [], coverage: [],
      footer: `${c?.name || ''} · ${new Date().getFullYear()}`,
    };
    const id = uid();
    if (action === 'draft') {
      Store.put('sheet', id, sheet);
      navigator.clipboard?.writeText(fsBriefPrompt(sheet)).then(() => toast('נוצרה טיוטה ריקה והבריף הועתק. שלח אותו ל-Claude יחד עם החומרים, ואז "ייבוא JSON".'));
      fsOpenId = id; go('formula');
      return;
    }
    if (action !== 'ai') return;
    if (fd.get('cdrive') && fsDriveNeedsAccess()) return false;
    Store.put('sheet', id, sheet);
    fsOpenId = id; go('formula');
    fsGenerate(id, fsReadSources(fd), !!fd.get('pangea'), !!fd.get('cdrive'));
  }, form => {
    const sel = $('#fsCourse', form);
    const drawProf = () => {
      const guess = fsGuessProfile(courseLabel(sel.value));
      $('#fsProf', form).innerHTML = fsProfileChecks(guess);
      fsPangeaCheck(form, sel.value);
    };
    sel.onchange = drawProf;
    drawProf();
  });
  fsWide();
}

// ---------- AI ----------
const FS_STYLE_GUIDE = `STYLE (the student's own standard theme, learned from their sheets):
- Hebrew prose, right-to-left. Math ONLY in LaTeX (KaTeX subset). Only symbols/variables/units are English or Greek.
- One section per topic, titled briefly (e.g. "מאמץ, עיבור וקשרי הזזה"). Inside a section, use sub-headings (t:"h") for sub-topics.
- Definitions and named formulas as "kv" rows: bold Hebrew label + formula (e.g. label "חוק הוק", tex "\\sigma = E\\cdot\\epsilon").
- Important/general formulas as centered "eq".
- For every type of exam question: a "steps" block titled "סדר פעולות (סד״פ):" with items like "**נרמול וזיהוי:** ...".
- Short worked chain as "example" labelled "דוגמת בזק" using \\Rightarrow.
- Traps students fall into: "callout" variant "trap" (titled "קיר הבושה - מלכודות קריטיות:"). Key emphasis: variant "tip" (title "דגש: ...").
- Tables for comparisons/cases (beam load cases, integral tables, Laplace pairs…). A "symbols" table when a topic has many variables.
- Profile "procedures": a "steps" block per exam question type (what to do, in order), and how to recognise the problem type and choose the method (a table "סימן זיהוי | שיטה"). No programming syntax here.
- Profile "code": real code snippets and syntax in "code" blocks (monospace, left-to-right), short and exam-relevant. Never put code in a sheet whose profile lacks "code".
- Dense, exam-ready, no fluff. Vectors underlined (\\underline{r}) when the course does so.
FIGURES (only when the course profile includes "figures"): draw your own clean SVG (viewBox, ~240x150), white background, black 1.2px lines, blue #1d4ed8 for geometry/vectors, red #dc2626 for forces/loads, labels as <text> with font-family="KaTeX_Math, serif" font-style="italic". Model them on the diagrams in the course material (free-body diagrams, beams, supports, Mohr's circle, cross-sections). No figures for courses without "figures".`;

// Every field is required: a schema with many optional fields is too heavy for the API to compile
// ("Grammar compilation timed out"). The model leaves unused fields empty and fsCleanBlock drops them.
const FS_BLOCK_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['t', 'md', 'label', 'tex', 'note', 'title', 'variant', 'style', 'items', 'code', 'svg', 'caption', 'width', 'head', 'rows'],
  properties: {
    t: { type: 'string', enum: Object.keys(FS_BLOCKS) },
    md: { type: 'string' }, label: { type: 'string' }, tex: { type: 'string' }, note: { type: 'string' },
    title: { type: 'string' }, variant: { type: 'string', enum: ['', 'tip', 'trap', 'note'] }, style: { type: 'string', enum: ['', 'square', 'bullet', 'num'] },
    items: { type: 'array', items: { type: 'string' } }, code: { type: 'string' }, svg: { type: 'string' }, caption: { type: 'string' }, width: { type: 'number' },
    head: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
  },
};
const FS_BLOCKS_SCHEMA = { type: 'object', additionalProperties: false, required: ['blocks'], properties: { blocks: { type: 'array', items: FS_BLOCK_SCHEMA } } };
const FS_SECTIONS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['sections'],
  properties: { sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'blocks'], properties: { title: { type: 'string' }, blocks: { type: 'array', items: FS_BLOCK_SCHEMA } } } } },
};
const FS_SHEET_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'profile', 'sections', 'coverage'],
  properties: {
    title: { type: 'string' },
    profile: { type: 'array', items: { type: 'string', enum: Object.keys(FS_PROFILES) } },
    sections: FS_SECTIONS_SCHEMA.properties.sections,
    coverage: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['topic', 'status', 'note'], properties: { topic: { type: 'string' }, status: { type: 'string', enum: ['in', 'partial', 'missing'] }, note: { type: 'string' } } } },
  },
};

const FS_SYSTEM = `You build exam formula sheets (נוסחאון) for Technion students, as structured JSON that an app lays out on A4 pages.
${FS_STYLE_GUIDE}
The sheet must be specific to THIS course: its notation, its typical exam questions, its traps. Prioritise what past exams actually need.`;

// What the sheet is for and how much room it has (shared by every AI step and by the copied brief).
function fsBriefTask(sheet) {
  const c = courseByCode(sheet.course);
  return `TASK: Build the formula sheet for the course "${c?.name || sheet.course}" (${sheet.course}).
- Space: ${sheet.pages} A4 page(s), ${sheet.cols} columns each, ~10.5px font (roughly ${fsLineBudget(sheet)} short lines in total). Fill it, don't overflow.
- Course profile: ${(sheet.profile || []).map(p => FS_PROFILES[p]).join(', ') || 'decide'}.
- Emphasise: ${sheet.brief?.emphasis || '-'}
- Leave out: ${sheet.brief?.skip || '-'}
- Exam rules / notes: ${sheet.brief?.rules || '-'}
- Source priority: past exams > course material (syllabus, official sheets) > the student's summaries > lecture slides > tutorials > homework. An attached existing formula sheet is for style and inspiration.

Block types (field "t"): ${Object.entries(FS_BLOCKS).map(([t, [l, f]]) => `${t} (${l}: ${f.map(x => x[0]).join(', ')})`).join('; ')}.
"rows" is an array of arrays of strings; table cells may hold an inline <svg>.`;
}
const fsLineBudget = sheet => Math.round((+sheet.pages || 2) * (+sheet.cols || 3) * 58);

function fsBriefPrompt(sheet) {
  return `${FS_SYSTEM}

${fsBriefTask(sheet)}
- Also return "coverage": every syllabus topic with status in / partial / missing (and a short note), so gaps are visible.

OUTPUT: one JSON object: {"title", "profile":[${Object.keys(FS_PROFILES).map(k => `"${k}"`).join('|')}], "sections":[{"title","blocks":[...]}], "coverage":[{"topic","status","note"}]}`;
}

// Drops the fields a block doesn't use (the schema makes the model send all of them, empty).
function fsCleanBlock(b) {
  const out = {};
  for (const [k, v] of Object.entries(b || {})) {
    if (v === '' || v == null || (Array.isArray(v) && !v.length) || (k === 'width' && !v)) continue;
    out[k] = v;
  }
  return out;
}
function fsCleanOut(out) {
  if (Array.isArray(out?.blocks)) out.blocks = out.blocks.map(fsCleanBlock).filter(b => b.t);
  if (Array.isArray(out?.sections)) out.sections = out.sections.filter(s => s && typeof s === 'object').map(s => ({ ...s, title: String(s.title || ''), blocks: (Array.isArray(s.blocks) ? s.blocks : []).map(fsCleanBlock).filter(b => b.t) }));
  if (Array.isArray(out?.coverage)) out.coverage = out.coverage.filter(c => c?.topic).map(c => (c.note ? c : { topic: c.topic, status: c.status }));
  return out;
}
// The JSON object inside a free-text answer (with or without a ```json fence around it).
function fsParseJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('ה-AI לא החזיר JSON תקין. נסה שוב.');
  try { return JSON.parse(text.slice(a, b + 1)); } catch { throw new Error('ה-AI החזיר JSON שבור. נסה שוב.'); }
}

// A request with no sign of life for this long is treated as stuck and stopped.
const FS_STALL_MS = 10 * 60_000;

// One request to Claude that returns JSON. opts: { maxTokens, effort, signal, onText } (or just maxTokens).
async function fsAiCall(prompt, schema, opts = {}) {
  if (typeof opts === 'number') opts = { maxTokens: opts };
  const { maxTokens = 16000, effort = 'medium', signal, onText } = opts;
  const client = await claudeClient();
  const ask = async strict => {
    // The format note goes last in the message, so the system prompt and the sources before it
    // stay identical between requests (that is what lets the API reuse them from its cache).
    const extra = strict
      ? 'FORMAT: every block object carries every field of the schema: leave the fields that block type does not use empty ("" for text, [] for lists, 0 for numbers).'
      : `FORMAT: answer with ONE JSON object only (no prose, no code fence), matching this JSON schema; omit the fields a block type does not use:\n${JSON.stringify(schema)}`;
    const content = typeof prompt === 'string' ? `${prompt}\n\n${extra}` : [...prompt, { type: 'text', text: extra }];
    const ac = new AbortController();
    const stop = () => ac.abort();
    if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop);
    let last = Date.now(), stalled = false;
    const watchdog = setInterval(() => { if (Date.now() - last > FS_STALL_MS) { stalled = true; stop(); } }, 5000);
    try {
      const stream = client.beta.messages.stream({
        model: CV_MODEL,
        max_tokens: maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort, ...(strict ? { format: { type: 'json_schema', schema } } : {}) },
        system: FS_SYSTEM,
        // prompt: text, or content blocks (PDF documents for scanned material + text)
        messages: [{ role: 'user', content }],
      }, { signal: ac.signal });
      stream.on?.('streamEvent', () => { last = Date.now(); });
      if (onText) stream.on?.('text', d => onText(d));
      const response = await stream.finalMessage();
      if (response.stop_reason === 'refusal') throw new Error('הבקשה נדחתה');
      if (response.stop_reason === 'max_tokens') throw new Error('התשובה נחתכה (ארוכה מדי). נסה בקשה מצומצמת יותר.');
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
      return fsCleanOut(strict ? JSON.parse(text) : fsParseJson(text));
    } catch (e) {
      if (stalled) throw new Error('אין תגובה מ-Anthropic כבר 10 דקות, הבקשה נעצרה.');
      if (signal?.aborted) throw Object.assign(new Error('היצירה בוטלה'), { cancelled: true });
      throw e;
    } finally {
      clearInterval(watchdog);
      signal?.removeEventListener('abort', stop);
    }
  };
  if (fsNoStrict) return ask(false);
  try { return await ask(true); }
  catch (e) {
    // The API couldn't use the schema (too complex / compile timeout): same request as plain JSON,
    // and later requests skip the attempt that is known to fail.
    const msg = String(e?.error?.error?.message || e?.message || '');
    if (e?.cancelled || !/grammar|schema|compil/i.test(msg)) throw e;
    console.warn('formula sheet: structured output unavailable, using plain JSON:', msg);
    fsNoStrict = true;
    return ask(false);
  }
}
let fsNoStrict = false;

function fsAiDialog(sheet) {
  const secs = sheet.sections || [];
  const ideas = [`קצר כדי שייכנס ל-${sheet.pages || 2} עמודים`, 'הוסף טבלת סימנים ויחידות', 'הוסף "קיר הבושה" לכל פרק חשוב', 'הוסף סד״פ לכל סוג שאלה במבחן', 'בדוק שהנוסחאות נכונות ותקן טעויות'];
  openModal(`<h2>✨ עזרה מ-AI</h2>
    <p class="muted">כתוב מה לשנות. ה-AI מקבל את הנוסחאון (או פרק אחד) ומחזיר גרסה מתוקנת; אפשר לבטל.</p>
    <label class="field"><span class="field-label">על מה לעבוד?</span><select name="scope"><option value="all">כל הנוסחאון</option>${secs.map((s, i) => `<option value="${i}" ${fsSelSection === i ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select></label>
    <label class="field"><span class="field-label">הבקשה</span><textarea name="ask" rows="3" required></textarea></label>
    <div class="chips">${ideas.map(i => `<button type="button" class="chip" data-idea="${esc(i)}">${esc(i)}</button>`).join('')}</div>
    ${claudeKey() ? '' : '<p class="bad small">צריך מפתח API של Anthropic (בלשונית קו״ח ← הגדרות AI). בלי מפתח: "⋯ ← ייצוא JSON", שלח ל-Claude, ו"החלף בתוכן מ-JSON".</p>'}
    <p class="muted small" id="fsAiMsg"></p>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>סגור</button><button class="btn primary" value="go" ${claudeKey() ? '' : 'disabled'}>✨ בצע</button></div>`, (action, fd) => {
    if (action !== 'go') return;
    const ask = String(fd.get('ask') || '').trim(), scope = fd.get('scope');
    if (!ask) return false;
    const msg = $('#fsAiMsg');
    msg.textContent = '✨ עובד על זה… (יכול לקחת דקה)';
    $$('#modalForm button').forEach(b => b.disabled = true);
    const part = scope === 'all' ? secs : [secs[+scope]];
    fsAiCall(`Formula sheet "${sheet.title}" (course: ${courseLabel(sheet.course)}, ${sheet.pages} pages × ${sheet.cols} columns, profile: ${(sheet.profile || []).join(', ')}).
${scope === 'all' ? 'The whole sheet' : 'One section of it'}:\n${JSON.stringify({ sections: part })}\n\nThe student asks: ${ask}\n\nReturn {"sections":[...]} replacing ${scope === 'all' ? 'all sections' : 'that one section (you may return more than one if splitting makes sense)'}.`, FS_SECTIONS_SCHEMA, 32000)
      .then(out => {
        if (!fsHasContent(out)) throw new Error('ה-AI החזיר תשובה ריקה. הנוסחאון לא שונה; נסה שוב או נסח את הבקשה אחרת.');
        const before = structuredClone(secs);
        const next = scope === 'all' ? out.sections : [...secs.slice(0, +scope), ...out.sections, ...secs.slice(+scope + 1)];
        fsPutSections(sheet, next.map(s => ({ id: fsId(), ...s })));
        $('#modal').close();
        toast('✨ עודכן', () => fsPutSections(sheet, before));
      })
      .catch(e => { msg.innerHTML = aiErrorHtml(e); $$('#modalForm button').forEach(b => b.disabled = false); });
    return false;
  }, form => {
    $$('[data-idea]', form).forEach(b => b.onclick = () => { form.elements.ask.value = b.dataset.idea; });
  });
}

// ---------- full generation: plan → every section at once → check → fit ----------
// One request for a whole sheet is slow and gets cut off at the answer-length limit. So: a short
// plan first, then every section in its own request, all running at the same time, then one check
// against the sources, then (if it doesn't fit the pages) one round of shortening.
const FS_GEN_EFFORT = 'high'; // the same for every step: changing it would drop the API's cache of the sources
const FS_OUTLINE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'profile', 'sections', 'coverage'],
  properties: {
    title: { type: 'string' },
    profile: { type: 'array', items: { type: 'string', enum: Object.keys(FS_PROFILES) } },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'brief', 'lines'], properties: { title: { type: 'string' }, brief: { type: 'string' }, lines: { type: 'integer' } } } },
    coverage: FS_SHEET_SCHEMA.properties.coverage,
  },
};
const FS_FIXES_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['fixes'],
  properties: { fixes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['section', 'block', 'action', 'why', 'data'],
    properties: { section: { type: 'integer' }, block: { type: 'integer' }, action: { type: 'string', enum: ['replace', 'delete'] }, why: { type: 'string' }, data: FS_BLOCK_SCHEMA } } } },
};
const fsWait = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('היצירה בוטלה'), { cancelled: true })); }); });
const fsClock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
// The cancel button of a generation (the editor is redrawn often, so it is wired once here).
document.addEventListener('click', e => { if (e.target.closest?.('[data-fsgen-cancel]')) fsGen[fsOpenId]?.cancel?.(); });

// Reads everything you attached (and the Drive folder / Pangea if asked) into text and documents.
async function fsReadMaterials(sheet, files, usePangea, useDrive, say) {
  const parts = [];
  const driveFailed = [];
  if (useDrive) {
    // The course's Drive folder: downloaded here, then read exactly like files attached by hand.
    if (!fsDriveCanRead()) throw new Error('חסר אישור לקריאת קבצים מהדרייב. פתח שוב "צור עם AI" ואשר את הבקשה של Google.');
    if (!Sync.token()) throw new Error('החיבור ל-Google פג. התחבר מחדש (הכפתור למעלה) ונסה שוב.');
    await CDrive.scan(sheet.course).catch(() => {});
    const plan = fsDrivePlan(sheet.course);
    const total = Object.values(plan).reduce((s, a) => s + a.length, 0);
    files = Object.fromEntries(Object.entries(files || {}).map(([k, a]) => [k, [...a]]));
    // Downloads run six at a time.
    const queue = Object.entries(plan).flatMap(([k, list]) => list.map(f => [k, f]));
    let done = 0;
    const got = {};
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (let job; (job = queue.shift());) {
        const [k, f] = job;
        try { (got[k] = got[k] || []).push(await fsDriveDownload(f)); }
        catch (e) { if (e.auth) throw new Error('החיבור ל-Google פג באמצע ההורדה. התחבר מחדש ונסה שוב.'); driveFailed.push(f.name); }
        say(`⬇️ מוריד מהדרייב: ${++done}/${total}`);
      }
    }));
    for (const [k, list] of Object.entries(got)) (files[k] = files[k] || []).push(...list);
    if (total && driveFailed.length === total) throw new Error('לא הצלחתי להוריד אף קובץ מתיקיית הדרייב של הקורס.');
  }
  // Scanned or handwritten PDFs have almost no text: Claude reads those as documents (it sees
  // the pages). They are attached in priority order (past exams first) up to the request limits.
  const docs = [], skipped = [];
  let docPages = 0, docBytes = 0;
  const budget = { exams: 120000, material: 80000, summaries: 60000, slides: 60000, tutorials: 40000, hw: 30000, inspire: 30000, pangea: 60000 };
  for (const [k, l] of [...FS_SOURCES, ['inspire', 'existing formula sheet (style/inspiration only)']]) {
    let text = '';
    for (const f of (files || {})[k] || []) {
      say(`📖 קורא ${esc(f.name)}…`);
      try {
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
          const { text: t, pages } = await fsPdfText(f);
          if (t.replace(/\s/g, '').length < pages * 150) { // mostly scans
            if (docPages + pages <= 90 && docBytes + f.size <= 22e6) {
              docPages += pages; docBytes += f.size;
              docs.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await fsBase64(f) }, title: f.name, context: `source kind: ${k} (${l})` });
              text += `\n--- ${f.name}: scanned, attached as a document ---\n`;
            } else skipped.push(f.name);
            continue;
          }
          text += `\n--- ${f.name} ---\n${t}`;
        } else text += `\n--- ${f.name} ---\n` + (/\.json$/i.test(f.name) ? await f.text() : await fileToText(f));
      } catch (e) { console.warn('formula sheet: could not read', f.name, e); skipped.push(f.name); }
    }
    if (text.trim()) parts.push(`<source kind="${k}" label="${esc(l)}">\n${text.slice(0, budget[k])}\n</source>`);
  }
  if (usePangea) {
    const pg = Pangea.course(sheet.course);
    let text = '';
    for (const [i, p] of (pg?.pages || []).entries()) {
      say(`💧 קורא את פנגייה ${i + 1}/${pg.pages.length}…`);
      try { text += `\n--- ${p.title} ---\n` + await Pangea.pageText(p.url); } catch {}
    }
    if (text.trim()) parts.push(`<source kind="summaries" label="Pangea student summaries">\n${text.slice(0, budget.pangea)}\n</source>`);
  }
  const left = [...skipped, ...driveFailed];
  return { docs, text: parts.join('\n\n') || '(no files: use your knowledge of the standard Technion syllabus for this course)', left };
}

async function fsGenerate(id, files, usePangea, useDrive) {
  const prev = fsGen[id];
  if (prev?.state === 'run') return toast('הנוסחאון הזה כבר בבנייה…');
  const given = files; // what you attached by hand
  // A retry with the same materials continues from where it stopped (sources read, plan, finished sections).
  const work = (prev?.state === 'error' && prev.files === given && prev.usePangea === usePangea && prev.useDrive === useDrive && prev.work) || {};
  const ac = new AbortController();
  const t0 = Date.now();
  // The status lives in fsGen, so it survives every redraw of the editor (sync, edits, tab switches).
  const setStatus = (html, state = 'run') => {
    fsGen[id] = { state, html, files: given, usePangea, useDrive, work, t0, cancel: () => ac.abort() };
    if (currentView === 'formula' && !fsOpenId && state !== 'run') render(); // the list shows the sheet's state
    if (fsOpenId !== id || currentView !== 'formula') return;
    const st = $('#fsStatus'); if (st) st.innerHTML = html;
    const msg = $('#fsGenMsg');
    if (msg && state === 'run') msg.innerHTML = html; else if ($('#fsSheet .fs-blank')) render();
  };
  let stage = 'הכנת החומרים'; // named in the error, so a failure says where it happened
  const say = (text, name) => { if (name) stage = name; setStatus(`<span class="muted">${text}</span>`); };
  const call = (content, schema, maxTokens) => fsAiCall(content, schema, { maxTokens, effort: FS_GEN_EFFORT, signal: ac.signal });
  try {
    say('📖 מכין את החומרים…');
    const sheet = Store.get('sheet', id);
    if (!work.src) work.src = await fsReadMaterials(sheet, files, usePangea, useDrive, say);
    if (ac.signal.aborted) throw Object.assign(new Error('היצירה בוטלה'), { cancelled: true });
    // Everything up to here is the same in every request, so the API keeps it in its cache: the
    // plan request pays for the sources once, and the section requests read them at a fraction.
    const shared = [...work.src.docs, { type: 'text', text: `${fsBriefTask(sheet)}\n\nSOURCES:\n${work.src.text}`, cache_control: { type: 'ephemeral' } }];
    const step = text => [...shared, { type: 'text', text }];
    const budget = fsLineBudget(sheet);

    // 1. The plan.
    if (!work.outline) {
      say('🧭 שלב 1/4: מתכנן את הפרקים', 'תכנון הפרקים');
      const out = await call(step(`STEP 1: PLAN the sheet. Do not write any blocks yet.
Return:
- "title" and "profile".
- "sections", in the order they appear on the sheet (about ${Math.max(5, Math.round(budget / 45))} of them). For each: "title"; "brief": exactly what goes into it (sub-topics, the named formulas and theorems, which סד״פ / tables / traps / examples), precise enough that a writer who sees only this plan and the sources writes it with no overlap with the other sections and nothing forgotten; "lines": its share of the space in short lines (the shares add up to about ${budget}). Give the most room to what the exams and the student's emphasis need.
- "coverage": every syllabus topic with status in / partial / missing and a short note.`), FS_OUTLINE_SCHEMA, 48000);
      out.sections = (out.sections || []).filter(s => s?.title);
      if (!out.sections.length) throw new Error('ה-AI לא החזיר תכנון פרקים. נסה שוב.');
      work.outline = out;
      work.sections = [];
    }
    const plan = work.outline, n = plan.sections.length;
    const planText = JSON.stringify(plan.sections.map((s, i) => ({ n: i + 1, title: s.title, brief: s.brief, lines: s.lines })));

    // 2. Every section, all at the same time. One that fails is tried again by itself.
    const done = () => work.sections.filter(Boolean).length;
    const progress = () => say(`✍️ שלב 2/4: כותב את כל ${n} הפרקים במקביל · ${done()}/${n} מוכנים`);
    stage = 'כתיבת הפרקים';
    progress();
    const errors = [];
    await Promise.all(plan.sections.map(async (s, i) => {
      if (work.sections[i]) return;
      for (let attempt = 1; ; attempt++) {
        try {
          const out = await call(step(`STEP 2: WRITE ONE SECTION of the sheet.
The plan of the whole sheet: ${planText}
Write ONLY section ${i + 1}: "${s.title}". Its content: ${s.brief}
Room: about ${s.lines} short lines (a "kv" row ≈ 1, a centered "eq" ≈ 2, a table row ≈ 1.3, a step or list item ≈ 1-2). Fill it; do not go more than 10% over. Do not repeat what the plan gives to other sections.
Return {"blocks":[...]} (the section title is added by the app).`), FS_BLOCKS_SCHEMA, 48000);
          if (!out.blocks?.length) throw new Error('פרק ריק');
          work.sections[i] = { title: s.title, blocks: out.blocks };
          progress();
          return;
        } catch (e) {
          if (e?.cancelled || ac.signal.aborted) throw e;
          if (e?.status === 401 || e?.status === 403 || /credit balance/i.test(String(e?.message))) { errors.push(e); return; }
          if (attempt >= 3) { errors.push(e); return; }
          await fsWait(e?.status === 429 || e?.status === 529 ? 25000 * attempt : 2000, ac.signal); // busy: give it room
        }
      }
    }));
    if (ac.signal.aborted) throw Object.assign(new Error('היצירה בוטלה'), { cancelled: true });
    if (done() < n) throw Object.assign(errors[0] instanceof Error ? errors[0] : new Error('חלק מהפרקים לא נוצרו'), { fsPartial: `${done()} מתוך ${n} פרקים כבר מוכנים; "נסה שוב" ייצור רק את החסרים.` });
    let sections = work.sections.map(s => ({ ...s }));

    // 3. One check of everything against the sources. A failure here doesn't cost you the sheet.
    let fixed = 0, checked = true;
    try {
      say('🔎 שלב 3/4: בודק נוסחאות מול המקורות', 'בדיקה');
      const numbered = sections.map((s, si) => ({ section: si, title: s.title, blocks: s.blocks.map((b, bi) => ({ block: bi, ...b })) }));
      const out = await call(step(`STEP 3: CHECK the written sheet against the sources.
The sheet: ${JSON.stringify(numbered)}
Check every formula, sign, condition and theorem statement (the official formula pages and the lecture notes decide), that the notation is the course's, that the LaTeX is valid KaTeX, and that nothing is said twice in different sections.
Return {"fixes":[...]} with ONLY the blocks that must change: "section" and "block" are the numbers above; "action" is "replace" (with the corrected block in "data") or "delete" (a duplicate; "data" is ignored); "why" in a few words. An empty list if everything is right.`), FS_FIXES_SCHEMA, 48000);
      const fixes = (out.fixes || []).filter(f => sections[f.section]?.blocks[f.block]);
      for (const f of fixes.filter(f => f.action === 'replace')) { const b = fsCleanBlock(f.data); if (b.t) { sections[f.section].blocks = sections[f.section].blocks.map((x, k) => (k === f.block ? b : x)); fixed++; } }
      for (const f of fixes.filter(f => f.action === 'delete').sort((a, b) => b.block - a.block)) { sections[f.section].blocks = sections[f.section].blocks.filter((x, k) => k !== f.block); fixed++; }
      sections = sections.filter(s => s.blocks.length);
    } catch (e) {
      if (e?.cancelled || ac.signal.aborted) throw e;
      console.warn('formula sheet: check step failed', e);
      checked = false;
    }

    // 4. Does it fit? Measured with the real layout; if not, every section is shortened (again all at once).
    try {
      say('📏 שלב 4/4: מודד התאמה לעמודים', 'התאמה לעמודים');
      const info = await fsLayout({ ...sheet, sections, autofit: true }, document.createElement('div'));
      const over = info && (info.pages > info.target ? 0.75 : info.scale < 0.82 ? 0.88 : 0);
      if (over) {
        say(`✂️ שלב 4/4: מקצר כדי להיכנס ל-${info.target} עמודים`);
        sections = await Promise.all(sections.map(async s => {
          try {
            const out = await call(`Formula sheet "${plan.title}" (${courseLabel(sheet.course)}). The whole sheet is too long for its ${info.target} page(s).
Shorten this section to about ${Math.round(over * 100)}% of its length: keep what an exam needs most (the סד״פ, the key formulas, the traps), drop derivations and what is obvious, merge rows. Same block types and style.
The section: ${JSON.stringify(s)}
Return {"blocks":[...]}.`, FS_BLOCKS_SCHEMA, 48000);
            return out.blocks?.length ? { ...s, blocks: out.blocks } : s;
          } catch (e) { if (e?.cancelled) throw e; return s; }
        }));
      }
    } catch (e) {
      if (e?.cancelled || ac.signal.aborted) throw e;
      console.warn('formula sheet: fit step failed', e);
    }

    if (!fsHasContent({ sections })) throw new Error('ה-AI החזיר נוסחאון ריק. נסה שוב; אם זה חוזר, צרף חומרי קורס או פרט יותר בדגשים.');
    const left = work.src.left;
    delete fsGen[id];
    if (currentView === 'formula' && !fsOpenId) setTimeout(render, 0);
    Store.put('sheet', id, { title: plan.title || sheet.title, profile: plan.profile?.length ? plan.profile : sheet.profile, sections: sections.map(s => ({ id: fsId(), ...s })), coverage: plan.coverage || [] });
    toast(`✨ הנוסחאון מוכן (${fsClock(Date.now() - t0)})${checked ? (fixed ? ` · ${fixed} תיקונים בבדיקה` : ' · נבדק מול המקורות') : ' · שלב הבדיקה נכשל, כדאי לבקש "בדוק שהנוסחאות נכונות" בעזרה מ-AI'}${left.length ? ` · לא נקראו: ${left.join(', ')}` : ''}`);
  } catch (e) {
    console.error(e);
    const partial = e?.fsPartial || (work.outline && !e?.cancelled ? 'מה שכבר נוצר נשמר; "נסה שוב" ימשיך מאותה נקודה.' : '');
    setStatus(`<span class="bad">${e?.cancelled ? 'היצירה בוטלה.' : `היצירה נכשלה בשלב "${stage}": ${aiErrorHtml(e)}`}</span>${partial || (e?.cancelled && work.outline) ? ` <span class="muted">${esc(partial || '"נסה שוב" ימשיך מאותה נקודה.')}</span>` : ''}`, 'error');
  }
}

// Text of a PDF and its page count (to tell typed files from scans).
async function fsPdfText(file) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map(i => i.str).join(' ') + '\n';
  return { text, pages: doc.numPages };
}
const fsBase64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });

// Wider dialog for the editors; back to normal when it closes.
function fsWide() {
  const dlg = $('#modal');
  dlg.classList.add('wide');
  // A late "close" from the dialog before this one must not shrink this one.
  dlg.addEventListener('close', () => { if (!dlg.open) dlg.classList.remove('wide'); }, { once: true });
}
