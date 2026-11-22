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
// What each choice adds, and when to tick it (shown when hovering over the option).
const FS_PROFILE_HINTS = {
  figures: 'מוסיף: איורים ושרטוטים (SVG) בסגנון חומרי הקורס.\n✅ לסמן כשהשרטוט הוא חלק מהפתרון: מוצקים, סטטיקה, דינמיקה, זרימה, חשמל ומגנטיות (שדות, מעגלים), אופטיקה, מעבר חום.\n❌ לא במתמטיקה (מד״ר, מד״ח, אינפי, אלגברה): שם האיורים רק תופסים מקום.',
  derivations: 'מוסיף: נוסחאות, זהויות ופיתוחים קצרים.\n✅ כמעט תמיד.\n❌ רק בקורס תכנות או קורס מילולי לגמרי.',
  procedures: 'מוסיף: לכל סוג שאלה במבחן זיהוי, סדר פעולות (סד״פ) ובחירת שיטה. זה הלב של התבנית.\n✅ כמעט תמיד, ובמיוחד בקורסים של "פתור את הבעיה".\n❌ רק בקורס שכולו שינון הגדרות.',
  tables: 'מוסיף: טבלאות מקרים, השוואות, ערכים וסימנים.\n✅ כשיש הרבה מקרים להשוות או ערכים לשלוף: תרמודינמיקה, התמרות לפלס ופורייה, מקרי עומס בקורות, תכונות חומרים, אינטגרלים.\n❌ כשהקורס בנוי מנוסחאות בודדות: הטבלאות יבואו על חשבון סד״פ.',
  proofs: 'מוסיף: משפטים עם תנאיהם, המסקנה, ואיך משתמשים בהם בשאלה.\n✅ כששואלים במבחן "הוכח", "נמק" או "האם קיים", או כשיש משפטי קיום ויחידות, מקסימום וכו׳ (מד״ר, מד״ח, אינפי, אלגברה).\n❌ בקורס חישובי טהור (רוב קורסי ההנדסה).',
  code: 'מוסיף: קטעי קוד ותחביר בגופן קוד.\n✅ רק בקורס שבו כותבים או קוראים קוד במבחן: מבוא למדמ״ח, פייתון, MATLAB.\n❌ לא בשביל אלגוריתם פתרון ידני: זה כבר בסד״פ.',
};
const fsProfileChecks = sel => Object.entries(FS_PROFILES).map(([k, l]) => `<label class="chip fs-tip" data-tip="${esc(FS_PROFILE_HINTS[k] || '')}" aria-label="${esc(l)}: ${esc(FS_PROFILE_HINTS[k] || '')}"><input type="checkbox" name="p" value="${k}" ${sel.includes(k) ? 'checked' : ''}> ${l}</label>`).join('');
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
  // The fonts the sheet uses (KaTeX's, above all) are only fetched once something uses them, so wait for
  // them again now. Measuring before they arrive gave heights that were too small: text was cut off.
  measure.getBoundingClientRect();
  await document.fonts?.ready;
  if (token !== fsLayoutToken) { measure.remove(); return null; }
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

  const footer = sheet.footer || sheet.title || '';
  // Packs the units into columns (auto-fit: the biggest font that still fits in the pages you allow)
  // and lays them out as pages. `slack` is room held back at the bottom of every column.
  const build = slack => {
    measure.append(...nodes); // back into the measuring box (they were moved into pages by an earlier try)
    const room = colH - slack;
    let scale = Math.max(0.6, Math.min(1.3, +sheet.scale || 1));
    let packed;
    if (sheet.autofit !== false) {
      const tries = [1.2, 1.15, 1.1, 1.06, 1.03, 1, 0.97, 0.94, 0.91, 0.88, 0.85, 0.82, 0.79, 0.76, 0.73, 0.7, 0.67, 0.64];
      for (const s of tries) {
        packed = fsPack(heightsAt(s), room);
        scale = s;
        if (Math.ceil(packed.length / cols) <= target) break;
      }
    } else packed = fsPack(heightsAt(scale), room);
    measure.style.fontSize = (FS_PAGE.base * scale) + 'px';

    const nPages = Math.max(1, Math.ceil(packed.length / cols));
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
    return { pages, nPages, scale };
  };

  let slack = 0, built = build(0);
  // The measuring box and the real column can differ by a pixel or so per block (fonts, rounding), and a
  // column's overflow is cut off. So after the pages are on screen, look at how much each column
  // overflows and, if it does, pack again with that much room held back.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (token !== fsLayoutToken) break;
    host.replaceChildren(...built.pages);
    if (!host.isConnected) break;
    if (host.id === 'fsSheet') fsFitPreview(); // the preview is zoomed, and text lays out a little differently when zoomed
    const over = Math.max(0, ...$$('.fs-col', host).map(c => c.scrollHeight - c.clientHeight));
    if (over <= 1) break;
    slack += over + 3;
    built = build(slack);
  }
  measure.remove();
  if (token !== fsLayoutToken) return null;
  host.replaceChildren(...built.pages);
  return { pages: built.nPages, target, scale: built.scale, cols };
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
          <button class="btn" type="button" id="fsDigestBtn" title="שלב הכנה חד-פעמי לכל קורס: חוסך את רוב עלות הקלט בכל נוסחאון">📚 תקציר קורס${Object.keys(fsDigestRun).length ? ' (בהכנה…)' : ''}</button>
          <button class="btn" type="button" id="fsImport">📥 ייבוא JSON</button>
          <button class="btn primary" type="button" id="fsNew">＋ נוסחאון חדש</button>
        </div>
      </div>
      <div class="fs-list-wrap"><div>
      ${list.length ? `<div class="fs-list">${list.map(s => `
        <button type="button" class="fs-item" data-open="${esc(s.id)}">
          <span class="fs-thumb">📐</span>
          <span><b>${esc(s.title || 'נוסחאון')}</b><small class="muted">${esc(courseLabel(s.course) || '')} · ${(s.sections || []).length} פרקים · ${s.pages || 2} עמ׳</small>
          <span class="chips">${fsJob('sheet:' + s.id) ? `<span class="chip">${fsJob('sheet:' + s.id).error ? '⚠️ היצירה החסכונית נעצרה' : '⏳ בתור החסכוני'}</span>` : ''}${fsGen[s.id]?.state === 'run' ? '<span class="chip">✨ בבנייה ברקע…</span>' : fsGen[s.id]?.state === 'error' ? '<span class="chip">⚠️ היצירה לא הושלמה</span>' : ''}${(s.profile || []).map(p => `<span class="chip">${FS_PROFILES[p] || p}</span>`).join('')}</span></span>
        </button>`).join('')}</div>`
      : `<div class="fs-empty"><p>עוד אין נוסחאונים.</p><p class="muted">אפשר להתחיל מנוסחאון חדש, או לפתוח את הדוגמה (מכניקת מוצקים 1, בנויה מחדש מהנוסחאון שלך) כדי לראות איך זה עובד.</p></div>`}
      ${typeof FS_SAMPLE_SOLIDS !== 'undefined' ? `<div class="actions" style="justify-content:flex-start"><button class="btn" type="button" id="fsSample">📄 פתח דוגמה: מכניקת מוצקים 1</button></div>` : ''}
      </div><aside class="fs-box fs-activity" id="fsActivity">${fsActivityHtml()}</aside></div>
    </section>`;
  $('#fsNew', root).onclick = () => fsNewSheet();
  $('#fsImport', root).onclick = () => fsImportJson();
  $('#fsDigestBtn', root).onclick = () => fsDigestDialog();
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
            ${sheet.advice ? `<p class="small">💡 <b>המלצת מבנה:</b> ${esc(sheet.advice)}</p>` : ''}
            ${sheet.ai ? `<p class="muted small" title="הערכה לפי מחירון ה-API; החיוב בפועל מופיע בחשבון Anthropic שלך">🧾 עלות היצירה: ${fsUsageText(sheet.ai)}</p>` : ''}
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
  const gen = fsGen[sheet.id], job = fsJob('sheet:' + sheet.id);
  if (!secs.length && job) {
    fsLayoutToken++;
    $('#fsStatus', root).innerHTML = job.error ? `<span class="bad">⚠️ ${esc(job.error)}</span>` : `<span class="muted">⏳ בתור החסכוני · שלב ${FS_STAGES[job.stage]?.[1] || 1}/3</span>`;
    pagesHost.innerHTML = fsBatchCardHtml(job);
    pagesHost.style.zoom = '';
    pagesHost.onclick = null;
    return;
  }
  if (!secs.length) {
    // Nothing to lay out: say so and offer the ways to fill it, instead of a blank page that looks "done".
    fsLayoutToken++;
    $('#fsStatus', root).innerHTML = gen ? gen.html : '<span class="bad">⚠️ הנוסחאון ריק: עוד אין בו תוכן</span>';
    pagesHost.innerHTML = fsBlankHtml(sheet, gen);
    pagesHost.style.zoom = '';
    pagesHost.onclick = null;
    $('#fsBlankAi', root)?.addEventListener('click', () => fsGenerateDialog(sheet));
    $('#fsBlankRetry', root)?.addEventListener('click', () => fsGenerate(sheet.id, gen.files, gen.usePangea, gen.useDrive, gen.useDigest));
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
    ${gen?.work?.used ? `<p class="muted small">🧾 נוצל עד עכשיו: ${fsUsageText(gen.work.used)}</p>` : ''}
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
      <button class="btn" type="button" id="fmAppend">➕ הוסף פרק מ-JSON (בלי לדרוס)</button>
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
    $('#fmAppend', form).onclick = () => { $('#modal').close(); fsAppendJson(sheet.id); };
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

// Adds sections from a JSON file to the END of an existing sheet, keeping the sections already there.
// Accepts a whole sheet ({sections:[…]}), one section ({title, blocks}) or a list of sections.
function fsAppendJson(intoId) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = async () => {
    try {
      const text = await input.files[0].text();
      // Same repair as the AI answers: a single backslash ("\vec", "\frac") is not valid JSON.
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { parsed = JSON.parse(text.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')); }
      const data = fsFixTex(parsed);
      const raw = Array.isArray(data) ? data : Array.isArray(data.sections) ? data.sections : (Array.isArray(data.blocks) ? [data] : null);
      if (!raw) throw new Error('בקובץ אין פרק: צריך "sections" או "blocks"');
      const added = fsCleanOut({ sections: raw }).sections
        .filter(s => s.blocks.length && s.blocks.every(b => FS_BLOCKS[b.t]))
        .map(s => ({ id: fsId(), ...s }));
      if (!added.length) throw new Error('אין בקובץ פרק עם בלוקים תקינים');
      const sheet = Store.get('sheet', intoId);
      if (!sheet) throw new Error('הנוסחאון לא נמצא');
      fsPutSections(sheet, [...(sheet.sections || []), ...added]);
      fsOpenId = intoId; if (currentView !== 'formula') go('formula'); else render();
      toast(`נוספו ${added.length} פרקים לסוף הנוסחאון`);
    } catch (e) { toast('ההוספה נכשלה: ' + e.message); }
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
const fsSourcesHtml = (withDigest = true) => `${withDigest ? `<div class="fs-sources fs-digest-src">
        <label class="fs-src"><span>📚 תקציר הקורס<small class="muted" id="fsDigestNote">בודק…</small></span><input type="checkbox" name="digest" id="fsDigest" disabled></label>
      </div>
      <p class="muted small"><button type="button" class="btn small" id="fsDigestMake">📚 הכן תקציר קורס</button> שלב הכנה חד-פעמי. עם תקציר, אין צורך לצרף שוב את החומרים למטה.</p>` : ''}<div class="fs-sources">${FS_SOURCES.map(([k, l, d]) => `<label class="fs-src"><span>${l}${d ? `<small class="muted">${d}</small>` : ''}</span><input type="file" name="src_${k}" multiple accept=".pdf,.docx,.txt,.md,.tex"></label>`).join('')}
        <label class="fs-src"><span>💡 נוסחאון קיים לדוגמה והשראה<small class="muted">הסגנון והמבנה שלו ילמדו</small></span><input type="file" name="src_inspire" multiple accept=".pdf,.docx,.txt,.md,.tex,.json"></label>
        <label class="fs-src" id="fsPangeaRow"><span>💧 סיכומי פנגייה לקורס<small class="muted" id="fsPangeaNote">בודק…</small></span><input type="checkbox" name="pangea" id="fsPangea" disabled></label>
        <label class="fs-src" id="fsDriveRow"><span>📁 תיקיית ה-Drive של הקורס<small class="muted" id="fsDriveNote">בודק…</small></span><input type="checkbox" name="cdrive" id="fsDrive" disabled></label>
      </div>
      <details class="fs-drive-pick" id="fsDrivePick" hidden><summary>🗂️ בחר אילו קבצים מהדרייב לשלוח</summary><div id="fsDriveList"></div></details>`;

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
// Every document in the folder that can be read, newest first.
const fsDriveFiles = code => (CDrive.entry(code)?.files || [])
  .filter(f => (/\.(pdf|docx|txt|md|tex)$/i.test(f.name) || f.mime === FS_DRIVE_GDOC) && f.size <= 20e6)
  .sort((a, b) => String(b.mod).localeCompare(String(a.mod)));
// The files you picked for a course (saved on this device); null = not picked yet, so the default.
const LS_FS_DRIVE_PICK = 'pp_fs_drive_pick';
function fsDrivePick(code, ids) {
  let all = {};
  try { all = JSON.parse(lsGet(LS_FS_DRIVE_PICK, '{}')) || {}; } catch {}
  if (ids === undefined) return Array.isArray(all[code]) ? new Set(all[code]) : null;
  if (ids === null) delete all[code]; else all[code] = [...ids];
  lsSet(LS_FS_DRIVE_PICK, JSON.stringify(all));
}
// What will be sent, by source kind: your pick, or by default the newest few of each kind.
function fsDrivePlan(code) {
  const plan = {}, pick = fsDrivePick(code);
  for (const f of fsDriveFiles(code)) {
    const k = fsDriveKind(f);
    if (pick ? pick.has(f.id) : (plan[k] || []).length < FS_DRIVE_MAX[k]) (plan[k] = plan[k] || []).push(f);
  }
  return plan;
}
const FS_KIND_NAMES = { exams: 'מבחנים', material: 'חומרי קורס', summaries: 'סיכומים', slides: 'הרצאות', tutorials: 'תרגולים', hw: 'שיעורי בית', inspire: 'נוסחאון' };
// The checklist under the Drive row: every file, grouped by kind, ticked = sent.
function fsDrivePickDraw(form, code, onChange) {
  const box = $('#fsDriveList', form), wrap = $('#fsDrivePick', form);
  if (!box || !wrap) return;
  const files = fsDriveFiles(code);
  wrap.hidden = !files.length;
  if (!files.length) return;
  const sent = new Set(Object.values(fsDrivePlan(code)).flat().map(f => f.id));
  const groups = {};
  for (const f of files) (groups[fsDriveKind(f)] = groups[fsDriveKind(f)] || []).push(f);
  const order = [...FS_SOURCES.map(([k]) => k), 'inspire'];
  const size = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1e3)) + 'KB');
  box.innerHTML = `<p class="muted small fs-pick-hint">💡 <b>מומלץ לסנן:</b> סריקות בכתב יד של הרצאות ותרגולים כשיש לאותו חומר קובץ מוקלד (סריקה נשלחת כתמונות: איטית ויקרה פי כמה, מסומנת 🖼️); קבצים כפולים (אותה הרצאה פעמיים, או פנגייה גם בדרייב וגם בתיבת פנגייה); פתרונות מלאים של שיעורי בית; גרסאות ישנות. <b>להשאיר:</b> דפי נוסחאות רשמיים, מבחנים קודמים, רשימות הרצאה מוקלדות וסיכום אחד טוב.</p><div class="row wrap fs-pick-tools"><button type="button" class="btn small" data-pickall="1">סמן הכל</button><button type="button" class="btn small" data-pickall="0">נקה הכל</button><button type="button" class="btn small" data-pickall="d">ברירת מחדל</button><small class="muted">הבחירה נשמרת לקורס הזה. פחות קבצים = מהיר וזול יותר.</small></div>`
    + order.filter(k => groups[k]).map(k => `<fieldset class="fs-pick-grp"><legend><label><input type="checkbox" data-pickgrp="${k}"> ${FS_KIND_NAMES[k]} <small class="muted">(${groups[k].length})</small></label></legend>
      ${groups[k].map(f => `<label class="fs-pick-row"><input type="checkbox" data-pickid="${esc(f.id)}" ${sent.has(f.id) ? 'checked' : ''}><span>${esc(f.name)}</span><small class="muted">${esc(f.cat || '')} · ${size(f.size)}${/\.pdf$/i.test(f.name) && f.size > 900e3 && /slides|tutorials|hw/.test(k) ? ' 🖼️' : ''}</small></label>`).join('')}</fieldset>`).join('');
  const sync = () => {
    $$('[data-pickgrp]', box).forEach(g => { const rows = $$(`[data-pickid]`, g.closest('fieldset')); const on = rows.filter(r => r.checked).length; g.checked = on === rows.length; g.indeterminate = on > 0 && on < rows.length; });
  };
  const save = () => { fsDrivePick(code, $$('[data-pickid]', box).filter(r => r.checked).map(r => r.dataset.pickid)); sync(); onChange(); };
  $$('[data-pickid]', box).forEach(r => r.onchange = save);
  $$('[data-pickgrp]', box).forEach(g => g.onchange = () => { $$('[data-pickid]', g.closest('fieldset')).forEach(r => { r.checked = g.checked; }); save(); });
  $$('[data-pickall]', box).forEach(b => b.onclick = () => {
    if (b.dataset.pickall === 'd') { fsDrivePick(code, null); fsDrivePickDraw(form, code, onChange); onChange(); return; }
    $$('[data-pickid]', box).forEach(r => { r.checked = b.dataset.pickall === '1'; }); save();
  });
  sync();
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
  // The course digest (the prepare step): when there is one, it replaces reading the materials again.
  const gNote = $('#fsDigestNote', form), gBox = $('#fsDigest', form), dg = fsDigest(code);
  if (gNote && gBox) {
    gBox.disabled = !dg; gBox.checked = !!dg;
    gNote.textContent = fsDigestRun[code] ? `בהכנה: ${fsDigestRun[code]}` : fsJob('digest:' + code) && !fsJob('digest:' + code).error ? `⏳ בתור החסכוני, מוכן בערך ב-${fsJobEta(fsJob('digest:' + code)).at}${dg ? ' (בינתיים: התקציר הקודם)' : ''}` : dg ? `מוכן · ${fsDigestInfo(dg)}. הנוסחאון ייכתב ממנו (זול ומהיר)` : 'אין עדיין. מומלץ להכין לפני היצירה: חוסך טוקנים בכל נוסחאון של הקורס';
    const mk = $('#fsDigestMake', form);
    if (mk) { mk.textContent = dg ? '📚 עדכן / הצג תקציר' : '📚 הכן תקציר קורס'; mk.onclick = () => { $('#modal').close(); setTimeout(() => fsDigestDialog(code), 30); }; }
  }
  const useDg = !!(dg && gBox); // with a digest, the full materials are off unless you tick them
  const dNote = $('#fsDriveNote', form), dBox = $('#fsDrive', form);
  if (dNote && dBox) {
    const c = courseByCode(code);
    dBox.disabled = true; dBox.checked = false;
    const show = () => {
      if ($('#fsCourse', form) && $('#fsCourse', form).value !== code) return; // the course was changed meanwhile
      const note = () => {
        const plan = fsDrivePlan(code), n = Object.values(plan).reduce((s, a) => s + a.length, 0), all = fsDriveFiles(code).length;
        const mb = Object.values(plan).flat().reduce((s, f) => s + (f.size || 0), 0) / 1e6;
        dNote.textContent = !all ? 'לא נמצאו בתיקייה מסמכים (PDF / Word / טקסט)'
          : n ? `${n} מתוך ${all} קבצים (${mb.toFixed(1)}MB): ${Object.entries(plan).map(([k, a]) => `${a.length} ${FS_KIND_NAMES[k]}`).join(', ')}${fsDrivePick(code) ? ' · לפי הבחירה שלך' : ''}${fsDriveCanRead() ? '' : ' (יתבקש אישור קריאה מ-Google)'}`
          : `לא נבחר אף קובץ (מתוך ${all}). בחר למטה`;
        dBox.disabled = !n;
        return n;
      };
      const n = note();
      dBox.checked = !!n && !useDg;
      fsDrivePickDraw(form, code, () => { const k = note(); if (!k) dBox.checked = false; else if (!useDg) dBox.checked = true; });
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
  // Pangea summaries that are already saved in the course's Drive folder would be read twice.
  const inDrive = !!courseByCode(code)?.drive && (CDrive.entry(code)?.files || []).some(f => /פנגי|pangea/i.test(`${f.cat} ${f.name}`));
  Pangea.load().then(() => {
    const pg = Pangea.course(code);
    note.textContent = pg ? `${pg.pages.length} דפים נמצאו${inDrive ? ' · כבר שמורים בתיקיית הדרייב, אז לא מסומן' : ''}` : 'אין סיכומים לקורס הזה';
    box.disabled = !pg; box.checked = !!pg && !useDg && !inDrive;
  }).catch(() => { note.textContent = 'לא זמין כרגע'; });
}
const fsReadSources = fd => { const files = {}; for (const [k] of [...FS_SOURCES, ['inspire']]) files[k] = fd.getAll('src_' + k).filter(f => f && f.size); return files; };

// Fill an existing (empty) sheet with AI: same materials as a new sheet, the brief is already saved.
function fsGenerateDialog(sheet) {
  openModal(`<h2>✨ יצירת הנוסחאון עם AI</h2>
    <p class="muted">הבריף כבר שמור (${sheet.pages} עמ׳, ${sheet.cols} עמודות${sheet.brief?.emphasis ? `, דגש: ${esc(sheet.brief.emphasis)}` : ''}). צרף חומרים, או צור בלי חומרים לפי הסילבוס הרגיל של הקורס.</p>
    <div class="field"><span class="field-label">📂 חומרים (לפי סדר העדיפות). קבצי PDF נקראים במכשיר בלבד.</span>${fsSourcesHtml()}</div>
    ${fsModeHtml('sheet')}
    <div class="actions"><button class="btn" value="cancel" formnovalidate>ביטול</button><button class="btn primary" value="ai">✨ צור</button></div>`, (action, fd) => {
    if (action !== 'ai') return;
    if (fsWantsBatch(fd)) {
      if (!fsDigest(sheet.course)) { toast('במצב חסכוני הנוסחאון נכתב מתקציר הקורס. הכן קודם תקציר (📚 הכן תקציר קורס), או בחר ⚡ מהיר.'); return false; }
      fsBatchStartSheet(sheet.id);
      return;
    }
    if (fd.get('cdrive') && fsDriveNeedsAccess()) return false;
    fsGenerate(sheet.id, fsReadSources(fd), !!fd.get('pangea'), !!fd.get('cdrive'), !!fd.get('digest'));
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
    <label class="field"><span class="field-label">🧩 שינויים בתבנית (לא חובה). כל נושא בנוי כך: זיהוי ← סד״פ ← נוסחאות מפתח ← דוגמת בזק אחת ← קיר הבושה</span><textarea name="template" rows="2" placeholder="למשל: בלי דוגמת בזק בנושאי תיאוריה; טבלת סימנים בתחילת הנוסחאון"></textarea></label>
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
    const brief = { emphasis: String(fd.get('emphasis') || '').trim(), skip: String(fd.get('skip') || '').trim(), rules: String(fd.get('rules') || '').trim(), template: String(fd.get('template') || '').trim() };
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
    if (fsWantsBatch(fd)) {
      if (!fsDigest(code)) { toast('במצב חסכוני הנוסחאון נכתב מתקציר הקורס. הכן קודם תקציר (📚 הכן תקציר קורס), או בחר ⚡ מהיר.'); return false; }
      Store.put('sheet', id, sheet);
      fsOpenId = id; go('formula');
      fsBatchStartSheet(id);
      return;
    }
    if (fd.get('cdrive') && fsDriveNeedsAccess()) return false;
    Store.put('sheet', id, sheet);
    fsOpenId = id; go('formula');
    fsGenerate(id, fsReadSources(fd), !!fd.get('pangea'), !!fd.get('cdrive'), !!fd.get('digest'));
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
THE FIXED TEMPLATE (taken from the student's own sheets). The sheet is a technical manual: a student who meets a question finds its section, sees how to recognise it, and follows the steps. Nothing to interpret, no theory to read through.
- One section = ONE exam problem type, titled with its name (e.g. "משוואות ברנולי", "בעיית קושי: שיטת האופיינים", "גלים על חצי ישר: שיקופים"). Many short sections, never a few big ones. No sub-headings ("h") inside a section.
- A "method" section, always in this order:
  1. "kv" with label "זיהוי": the standard form in "tex", and in "note" the few words that tell this type apart.
  2. "steps" titled "סדר פעולות (סד״פ):": 3-6 items "**שם השלב:** the action", each one concrete thing to do, in order, with the formula that step uses written inside it. Imperative, technical; say what to do next, not why.
  3. At most two key formulas the steps rely on ("eq" or "kv"), or one small table only when the cases ARE the method (e.g. eigenvalues by boundary condition).
  4. Exactly ONE "example" labelled "דוגמת בזק": a single chain with \\Rightarrow from the given problem to the answer's form.
  5. One "callout" variant "trap" titled "קיר הבושה - מלכודות קריטיות:" with 2-4 items "**שם המלכודת:** …".
- A "theory" section (a theorem / condition used in questions): "kv" rows with labels "התנאי" and "המסקנה" (or "התכלס"), then "steps" "סד״פ:" for how a question uses it, then the trap callout. No example needed.
- A "reference" section (identities, transform pairs, partial fractions, integrals): "table" / "kv" only. Reference sections go at the end.
- At most one "callout" variant "tip" ("דגש: …") per section, only for a must-know distinction. No prose paragraphs, no history, no motivation.
- Definitions and named formulas as "kv" rows: bold Hebrew label + formula (e.g. label "חוק הוק", tex "\\sigma = E\\cdot\\epsilon"). Important formulas as centered "eq".
- Profile "code": real code snippets and syntax in "code" blocks (monospace, left-to-right), short and exam-relevant. Never put code in a sheet whose profile lacks "code".
- Dense, exam-ready, no fluff. Vectors underlined (\\underline{r}) when the course does so.
FIGURES (only when the course profile includes "figures"): draw your own clean SVG (viewBox, ~240x150), white background, black 1.2px lines, blue #1d4ed8 for geometry/vectors, red #dc2626 for forces/loads, labels as <text> with font-family="KaTeX_Math, serif" font-style="italic". Model them on the diagrams in the course material (free-body diagrams, beams, supports, Mohr's circle, cross-sections). No figures for courses without "figures".`;

// These schemas are shown to the model as the description of the answer (they are not compiled by
// the API: with this many optional fields that failed with "Grammar compilation timed out").
const FS_BLOCK_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['t'],
  properties: {
    t: { type: 'string', enum: Object.keys(FS_BLOCKS) },
    md: { type: 'string' }, label: { type: 'string' }, tex: { type: 'string' }, note: { type: 'string' },
    title: { type: 'string' }, variant: { type: 'string', enum: ['tip', 'trap', 'note'] }, style: { type: 'string', enum: ['square', 'bullet', 'num'] },
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
    coverage: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['topic', 'status'], properties: { topic: { type: 'string' }, status: { type: 'string', enum: ['in', 'partial', 'missing'] }, note: { type: 'string' } } } },
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
- Changes to THE FIXED TEMPLATE the student asked for: ${sheet.brief?.template || '- (use it as is)'}
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
// The JSON object inside the answer (with or without a ```json fence around it). The answer is
// plain JSON written by the model, so LaTeX backslashes that weren't doubled are repaired here.
function fsParseJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('ה-AI לא החזיר JSON תקין. נסה שוב.');
  const raw = text.slice(a, b + 1);
  let out;
  try { out = JSON.parse(raw); }
  catch {
    // "\sigma", "\partial", "\underline": a backslash that is not a JSON escape. Double it and read again.
    try { out = JSON.parse(raw.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')); }
    catch { throw new Error('ה-AI החזיר JSON שבור. נסה שוב.'); }
  }
  return fsFixTex(out);
}
// "\frac", "\beta", "\theta", "\rho", "\nabla" with a single backslash ARE JSON escapes (form feed,
// backspace, tab, return, newline), so they parse without an error into control characters. Put the
// backslash back. A real line break is kept, except inside a formula field.
function fsFixTex(v, key) {
  if (typeof v === 'string') {
    let s = v.replace(/\f/g, '\\f').replace(/[\b]/g, '\\b').replace(/\u000b/g, '\\v').replace(/\r(?=[a-zA-Z])/g, '\\r').replace(/\t(?=[a-zA-Z])/g, '\\t');
    s = key === 'tex' ? s.replace(/\n(?=[a-zA-Z])/g, '\\n') : s.replace(/\n(?=(?:abla|eq|ot|otin|eg|u|i)(?![a-zA-Z\u0590-\u05ff]))/g, '\\n');
    return s;
  }
  if (Array.isArray(v)) return v.map(x => fsFixTex(x, key));
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = fsFixTex(v[k], k); }
  return v;
}

// Tokens and estimated cost. USD per million tokens for CV_MODEL (Claude Opus 5.5): input, output,
// reading the cached sources, writing them to the cache. An estimate: the bill is in your Anthropic account.
const FS_PRICE = { in: 4, out: 20, read: 0.2, write: 5 };
// The course digest is a distilling job (read everything, keep the substance): Claude Sonnet 5.5
// does it well at half the price of Opus, and it is where most of the tokens go. The sheet itself
// (plan, sections, check) stays on Opus.
const FS_DIGEST_MODEL = 'claude-sonnet-5-5';
const FS_PRICES = { 'claude-opus-5-5': FS_PRICE, 'claude-sonnet-5-5': { in: 2, out: 10, read: 0.1, write: 2.5 } };
const fsUsdOf = (u, p) => ((u.in || 0) * p.in + (u.out || 0) * p.out + (u.read || 0) * p.read + (u.write || 0) * p.write) / 1e6;
// Adds one answer's tokens, and its cost at the price of the model that wrote it (half in a batch).
function fsAddUsage(total, u, model) {
  if (!u) return;
  if (total.usd == null) total.usd = fsUsdOf(total, FS_PRICE) * (total.batch ? 0.5 : 1);
  const one = { in: u.input_tokens || 0, out: u.output_tokens || 0, read: u.cache_read_input_tokens || 0, write: u.cache_creation_input_tokens || 0 };
  total.in += one.in; total.out += one.out; total.read += one.read; total.write += one.write;
  total.usd += fsUsdOf(one, FS_PRICES[String(model || '').replace(/-\d{8}$/, '')] || FS_PRICE) * (total.batch ? 0.5 : 1);
  total.calls = (total.calls || 0) + 1;
}
// Older records have no "usd" (everything was Opus then).
const fsUsd = u => (u.usd != null ? u.usd : fsUsdOf(u, FS_PRICE) * (u.batch ? 0.5 : 1)); // batches: half price
const fsK = n => (n >= 1000 ? Math.round(n / 1000) + 'K' : String(n || 0));
const fsUsageText = u => `~$${fsUsd(u).toFixed(2)} (${fsK((u.in || 0) + (u.read || 0) + (u.write || 0))} טוקנים קלט, ${fsK(u.out)} פלט, ${u.calls || 0} בקשות)`;

// A request with no sign of life for this long is treated as stuck and stopped.
const FS_STALL_MS = 10 * 60_000;

// One request to Claude; returns the text of the answer.
// prompt: text, or content blocks (PDF documents for scanned material + text). tail: the format note.
// opts: { maxTokens, effort, signal, onUsage, onStart }.
async function fsAiRaw(prompt, tail, opts = {}) {
  const { maxTokens = 16000, effort = 'medium', signal } = opts;
  const client = await claudeClient();
  // The format note goes last in the message, so the system prompt and the sources before it stay
  // identical between requests (that is what lets the API reuse them from its cache).
  const content = typeof prompt === 'string' ? `${prompt}\n\n${tail}` : [...prompt, { type: 'text', text: tail }];
  const ac = new AbortController();
  const stop = () => ac.abort();
  if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop);
  let last = Date.now(), stalled = false, started = false;
  const watchdog = setInterval(() => { if (Date.now() - last > FS_STALL_MS) { stalled = true; stop(); } }, 5000);
  try {
    const stream = client.beta.messages.stream({
      model: opts.model || CV_MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort },
      system: FS_SYSTEM,
      messages: [{ role: 'user', content }],
    }, { signal: ac.signal });
    stream.on?.('streamEvent', () => { last = Date.now(); if (!started) { started = true; opts.onStart?.(); } });
    const response = await stream.finalMessage();
    opts.onUsage?.(response.usage, response.model);
    if (response.stop_reason === 'refusal') throw new Error('הבקשה נדחתה');
    if (response.stop_reason === 'max_tokens') throw new Error('התשובה נחתכה (ארוכה מדי). נסה בקשה מצומצמת יותר.');
    return response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  } catch (e) {
    if (stalled) throw new Error('אין תגובה מ-Anthropic כבר 10 דקות, הבקשה נעצרה.');
    if (signal?.aborted) throw Object.assign(new Error('היצירה בוטלה'), { cancelled: true });
    throw e;
  } finally {
    clearInterval(watchdog);
    signal?.removeEventListener('abort', stop);
  }
}

// A request that returns JSON. The answer is plain JSON (not the API's schema-constrained mode):
// that mode couldn't compile this schema, and it made every block carry all 15 fields.
async function fsAiCall(prompt, schema, opts = {}) {
  if (typeof opts === 'number') opts = { maxTokens: opts };
  const text = await fsAiRaw(prompt, fsJsonTail(schema), opts);
  return fsCleanOut(fsParseJson(text));
}
const fsAiText = (prompt, opts) => fsAiRaw(prompt, FS_TEXT_TAIL, opts);

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

// ---------- course digest: the "prepare" step ----------
// Done once per course, before generating: Claude reads all the materials and writes one dense
// reference (formulas, notation, question types). Sheets are then written from the digest instead
// of from the full materials, so each sheet costs a fraction of the input. Saved as a record of
// kind "digest" (id = course code), so it syncs like everything else.
const fsDigestRun = {}; // course code → the stage while its digest is being prepared
// course code → { msg, stage, at, used, rate } of the last failed attempt. Saved on the device, so a
// failure is still shown (on the sheets page and in the digest dialog) after a refresh.
const LS_FS_DIGEST_ERR = 'pp_fs_digest_err', LS_FS_DIGEST_PARTS = 'pp_fs_digest_parts';
const fsDigestErr = (() => { try { return JSON.parse(lsGet(LS_FS_DIGEST_ERR, '{}')) || {}; } catch { return {}; } })();
const fsDigestErrSave = () => lsSet(LS_FS_DIGEST_ERR, JSON.stringify(fsDigestErr));
// Parts of a digest that were already written, kept until the digest is done: a second attempt
// with the same files sends only the parts that are missing, so nothing paid for is thrown away.
const fsPartsAll = () => { try { return JSON.parse(lsGet(LS_FS_DIGEST_PARTS, '{}')) || {}; } catch { return {}; } };
function fsPartsPut(code, sig, text) { const all = fsPartsAll(); all[code] = { ...(all[code] || {}), [sig]: text }; if (!text) delete all[code][sig]; lsSet(LS_FS_DIGEST_PARTS, JSON.stringify(all)); }
const fsPartsClear = code => { const all = fsPartsAll(); delete all[code]; lsSet(LS_FS_DIGEST_PARTS, JSON.stringify(all)); };
// The API's own words for a failure (status and message), shown under the friendly explanation.
const fsErrDetail = e => [e?.status, String(e?.error?.error?.message || e?.error?.message || e?.message || e || '').slice(0, 240)].filter(Boolean).join(' · ');
const fsPartSig = ch => `${ch.names.join('|')}#${ch.text.length}#${ch.docs.length}`;
const fsDigest = code => Store.get('digest', code);
const fsDigestInfo = d => `${new Date(d.at).toLocaleDateString(LOCALE)} · ${d.manual ? 'הודבק מ-Claude.ai' : `${d.n || 0} מקורות`} · כ-${fsK(Math.round(d.text.length / 2.5))} טוקנים`;
const fsDigestTask = c => `TASK: write the COURSE DIGEST for "${c?.name || ''}" (${c?.code || ''}): one dense reference document from which exam formula sheets will later be written WITHOUT access to these sources. Whatever is not in the digest will not reach the sheet, so be complete on substance and ruthless on fluff.
Include, in the course's order of topics:
1. Syllabus: the list of topics (and anything the sources say is not examined).
2. For each topic: every definition, formula, identity and theorem (with its conditions) in LaTeX, in the course's own notation; the standard solution procedures (סד״פ) step by step; how to recognise each problem type and which method follows; the usual traps and mistakes; one short worked pattern where the method is not obvious.
3. The official formula page(s), if present: reproduce their content precisely under a heading marked "(דף רשמי)", so a sheet can keep or avoid the overlap.
4. Past exams, if present: which question types recur and how often, and what they demand.
5. A notation table: symbols, conventions, units.
Hebrew prose, math in LaTeX. No introduction and no study advice. As long as the material needs, up to about 15,000 tokens.`;

// The materials in parts of about 25K tokens (or 30 scanned pages), in source-priority order.
function fsDigestChunks(items) {
  const chunks = [];
  let cur = null;
  const flush = () => { if (cur && (cur.text || cur.docs.length)) chunks.push(cur); cur = null; };
  for (const it of items) {
    if (!it.text && !it.doc) continue;
    const size = it.text.length + (it.doc ? it.doc.pages * 3000 : 0);
    // A request may be at most 32MB, and a scan goes in base64 (a third bigger): up to 16MB of scans a part.
    if (cur && (cur.size + size > 75000 || cur.pages + (it.doc?.pages || 0) > 30 || cur.bytes + (it.doc?.bytes || 0) > 16e6)) flush();
    cur = cur || { text: '', docs: [], names: [], size: 0, pages: 0, bytes: 0 };
    if (it.doc) { cur.docs.push(it.doc.doc); cur.pages += it.doc.pages; cur.bytes += it.doc.bytes || 0; cur.text += `\n--- ${it.name}: scanned, attached as a document (source kind: ${it.kind}) ---\n`; }
    else cur.text += `\n<source kind="${it.kind}" label="${esc(it.label)}" file="${esc(it.name)}">\n${it.text}\n</source>\n`;
    cur.names.push(it.name); cur.size += size;
  }
  flush();
  chunks.forEach(ch => { ch.weight = ch.size; });
  return chunks;
}

const fsDigestPartAsk = (c, i, total, ch, room) => `${fsDigestTask(c)}\n\nTHIS REQUEST: you see only PART ${i + 1} of ${total} of the materials (${ch.names.join(', ')}). Digest ONLY what is in this part, under the same headings; the parts are joined in order afterwards, so no introduction and no summary. Length: up to about ${room} tokens.\n\nSOURCES:\n${ch.text}`;

async function fsMakeDigest(code, files, usePangea, useDrive) {
  if (fsDigestRun[code]) return toast('התקציר של הקורס הזה כבר בהכנה…');
  const c = courseByCode(code);
  const used = { in: 0, out: 0, read: 0, write: 0, calls: 0 };
  let stage = 'קריאת החומרים';
  const say = (t, name) => { if (name) stage = name; fsDigestRun[code] = String(t).replace(/<[^>]+>/g, ''); toast(`📚 תקציר ${c?.name || code}: ${fsDigestRun[code]}`); fsDigestRefresh(code); };
  delete fsDigestErr[code]; fsDigestErrSave();
  say('קורא את החומרים…');
  if (currentView === 'formula' && !fsOpenId) render();
  try {
    const src = await fsReadMaterials({ course: code }, files, usePangea, useDrive, say, '', { split: true });
    if (!src.count) throw new Error('לא נבחרו חומרים (או שאף קובץ לא נקרא), ואין ממה להכין תקציר.');
    // One long answer from Claude took 10+ minutes (it writes at a fixed speed). So the materials are
    // split into parts that are digested at the same time, and the parts are joined in order.
    const chunks = fsDigestChunks(src.items);
    const total = chunks.reduce((s, ch) => s + ch.weight, 0) || 1;
    const outs = new Array(chunks.length), failed = [], saved = fsPartsAll()[code] || {};
    let ready = 0, waiting = '';
    chunks.forEach((ch, i) => { if (saved[fsPartSig(ch)]) { outs[i] = saved[fsPartSig(ch)]; ready++; } });
    const reused = ready;
    const progress = () => say(`Claude מזקק ${src.count} מקורות ב-${chunks.length} חלקים · ${ready}/${chunks.length} מוכנים${reused ? ` (${reused} מהניסיון הקודם)` : ''}${waiting}`, 'הזיקוק ב-Claude');
    progress();
    const queue = chunks.map((ch, i) => i).filter(i => !outs[i]);
    // Three at a time: a new API account may read only so many tokens a minute ("rate limit"),
    // and scanned pages are heavy. A request turned away for that waits as long as the API says.
    let rated = false;
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let i; (i = queue.shift()) !== undefined;) {
        const ch = chunks[i], room = Math.max(1500, Math.round(15000 * ch.weight / total));
        for (let attempt = 1; ; attempt++) {
          try {
            outs[i] = (await fsAiText([...ch.docs, { type: 'text', text: fsDigestPartAsk(c, i, chunks.length, ch, room) }], { maxTokens: 32000, effort: 'medium', model: FS_DIGEST_MODEL, onUsage: (u, m) => fsAddUsage(used, u, m) })).trim();
            fsPartsPut(code, fsPartSig(ch), outs[i]);
            break;
          } catch (e) {
            const busy = e?.status === 429 || e?.status === 529;
            if (busy) rated = true;
            if (attempt >= (busy ? 5 : 2) || e?.status === 401 || e?.status === 403 || /credit balance/i.test(String(e?.message))) { failed.push({ i, e }); break; }
            const wait = busy ? Math.min(120, Math.max(20, +(e?.headers?.get?.('retry-after') || e?.headers?.['retry-after'] || 0) || 30 * attempt)) : 3;
            waiting = ` · ממתין ${wait} שנ׳ (${busy ? 'מגבלת קצב של Anthropic' : 'תקלה זמנית'})`; progress();
            await new Promise(r => setTimeout(r, wait * 1000));
            waiting = ''; progress();
          }
        }
        ready++; progress();
      }
    }));
    // A part missing means material missing from every sheet later, so it is not saved half-done:
    // the parts that were written are kept, and "try again" sends only the missing ones.
    if (failed.length) throw Object.assign(failed[0].e instanceof Error ? failed[0].e : new Error(String(failed[0].e)), { fsRate: rated, fsKept: ready - failed.length });
    const text = outs.map((t, i) => (t ? `<!-- חלק ${i + 1}: ${chunks[i].names.join(', ')} -->\n${t}` : '')).filter(Boolean).join('\n\n');
    if (text.length < 500) throw new Error('התקציר שחזר קצר מדי. נסה שוב.');
    if (failed.length) src.left.push(...failed.flatMap(f => chunks[f.i].names));
    Store.put('digest', code, { text, at: Date.now(), n: src.count, ai: used, model: FS_DIGEST_MODEL });
    fsPartsClear(code);
    toast(`📚 התקציר של ${c?.name || code} מוכן · ${fsUsageText(used).split(' (')[0]}${src.left.length ? ` · לא נקראו: ${src.left.join(', ')}` : ''}${fsTwinsNote(src.twins)} · עכשיו אפשר ליצור ממנו נוסחאון`);
  } catch (e) {
    console.error('course digest failed at', stage, e);
    fsDigestErr[code] = { msg: aiError(e).text, stage, at: Date.now(), detail: fsErrDetail(e), used: used.calls ? { ...used } : null, rate: !!e?.fsRate || e?.status === 429, kept: e?.fsKept || 0 };
    fsDigestErrSave();
    toast(`הכנת התקציר נכשלה בשלב "${stage}": ${aiError(e).text}`);
  } finally {
    delete fsDigestRun[code];
    fsDigestRefresh(code);
    if (currentView === 'formula' && !fsOpenId && !$('#modal').open) render();
  }
}
// Redraws the state line of an open digest dialog for this course.
// ---------- the "in progress" panel on the sheets page ----------
// Everything being prepared right now: digests and sheets, fast or in the economy queue, with
// their stage and (for the queue) the expected ready time. Click one to open it.
function fsActivityHtml() {
  const rows = [], name = code => esc(courseByCode(code)?.name || code);
  const plain = h => esc(String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  for (const [code, text] of Object.entries(fsDigestRun)) rows.push(`<li data-act-digest="${esc(code)}"><b>📚 תקציר ${name(code)}</b><small>⚡ ${plain(text)}</small></li>`);
  for (const [code, err] of Object.entries(fsDigestErr)) if (!fsDigestRun[code]) rows.push(`<li data-act-digest="${esc(code)}" class="bad"><b>📚 תקציר ${name(code)}</b><small>⚠️ נכשל (${fsHm(err.at)}): ${esc(err.msg)}${err.kept ? ` · ${err.kept} חלקים נשמרו` : ''}</small></li>`);
  for (const [key, job] of Object.entries(fsJobs())) {
    const [type, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const eta = job.error ? null : fsJobEta(job);
    const stage = job.type === 'sheet' ? ` · שלב ${FS_STAGES[job.stage]?.[1] || 1}/3` : '';
    const what = type === 'digest' ? `📚 תקציר ${name(id)}` : `📐 ${esc(Store.get('sheet', id)?.title || 'נוסחאון')}`;
    rows.push(`<li ${type === 'digest' ? `data-act-digest="${esc(id)}"` : `data-act-sheet="${esc(id)}"`} class="${job.error ? 'bad' : ''}"><b>${what}</b><small>${job.error ? `⚠️ נעצר: ${esc(job.error)}` : `💰 בתור החסכוני${stage} · מוכן בערך ב-${eta.at} (עוד ~${eta.min} דק׳)${fsDirectRun[key] ? ` · ✍️ ${fsDirectRun[key]} חלקים כבדים נכתבים עכשיו ישירות (השאר את האפליקציה פתוחה)` : ''}`}</small></li>`);
  }
  for (const [id, g] of Object.entries(fsGen)) {
    const s = Store.get('sheet', id);
    if (!s || !g) continue;
    rows.push(`<li data-act-sheet="${esc(id)}" class="${g.state === 'error' ? 'bad' : ''}"><b>📐 ${esc(s.title || 'נוסחאון')}</b><small>${g.state === 'run' ? `⚡ ${plain(g.html)}` : `⚠️ ${plain(g.html)}`}</small></li>`);
  }
  const ready = Store.list('digest').sort((a, b) => (b.at || 0) - (a.at || 0));
  return `<div class="fs-box-h"><b>⚙️ בתהליך</b>${rows.length ? `<small class="muted">${rows.length}</small>` : ''}</div>
    ${rows.length ? `<ul class="fs-act-list">${rows.join('')}</ul>` : '<p class="muted small">אין כרגע מסמכים בהכנה.</p>'}
    <p class="muted small">⚡ מהיר: נעצר אם סוגרים או מרעננים את האפליקציה. 💰 חסכוני: ממשיך גם אחרי סגירה.</p>
    ${ready.length ? `<div class="fs-box-h"><b>📚 תקצירים מוכנים</b></div><ul class="fs-act-list">${ready.map(d => `<li data-act-digest="${esc(d.id)}"><b>${name(d.id)}</b><small>${esc(fsDigestInfo(d))}</small></li>`).join('')}</ul>` : ''}`;
}
function fsActivityRefresh() {
  const box = $('#fsActivity');
  if (box && currentView === 'formula' && !fsOpenId) box.innerHTML = fsActivityHtml();
}
document.addEventListener('click', e => {
  const d = e.target.closest?.('#fsActivity [data-act-digest]'), s = e.target.closest?.('#fsActivity [data-act-sheet]');
  if (d) fsDigestDialog(d.dataset.actDigest);
  if (s) { fsOpenId = s.dataset.actSheet; render(); }
});
setInterval(fsActivityRefresh, 30000); // the expected times move on

function fsDigestRefresh(code) {
  fsActivityRefresh();
  const sel = $('#modal[open] #fsDigestState') && $('#modal #fsCourse');
  if (sel && sel.value === code) sel.dispatchEvent(new Event('change'));
  // The "new sheet" / "create" dialogs show the digest row: keep its line current too.
  const note = $('#modal[open] #fsDigestNote');
  if (note && fsDigestRun[code] && ($('#modal #fsCourse')?.value || fsSheet()?.course) === code) note.textContent = `בהכנה: ${fsDigestRun[code]}`;
}

function fsDigestDialog(code0) {
  const list = courses();
  const active = list.filter(c => c.status === 'active');
  const opt = c => `<option value="${esc(c.code)}" ${c.code === code0 ? 'selected' : ''}>${esc(c.name)} (${esc(c.code)})${fsDigest(c.code) ? ' ✓' : ''}</option>`;
  const hasKey = !!claudeKey();
  openModal(`<h2>📚 תקציר קורס</h2>
    <p class="muted">שלב הכנה, פעם אחת לכל קורס: Claude קורא את כל החומרים וכותב מסמך מרוכז אחד (נוסחאות, סימונים, סד״פ, סוגי שאלות). אחר כך כל נוסחאון של הקורס נכתב מהתקציר במקום מכל החומרים, וזה חוסך את רוב עלות הקלט. מה שלא נכנס לתקציר לא יגיע לנוסחאון, אז אפשר לקרוא ולתקן אותו כאן.</p>
    <p class="muted small">התקציר נכתב ב-Claude Sonnet 5.5 (זיקוק, בחצי מחיר); הנוסחאון עצמו ב-Opus 5.5. סריקה של חומר שיש לו גם קובץ מוקלד (אותו סוג ואותם מספרים בשם, למשל "הרצאה 3 סרוקה" ו"הרצאה 3") מדולגת אוטומטית.</p>
    <label class="field"><span class="field-label">קורס</span><select name="course" id="fsCourse">
      ${active.length ? `<optgroup label="בלימוד">${active.map(opt).join('')}</optgroup>` : ''}
      <optgroup label="כל הקורסים">${list.filter(c => c.status !== 'active').map(opt).join('')}</optgroup></select></label>
    <div id="fsDigestState"></div>
    <details class="set-sub" id="fsDigestManual"><summary>✍️ דרך נוספת, בלי עלות API: להכין את התקציר ב-Claude.ai</summary>
      <ol class="small">
        <li>לחץ "העתק הנחיה", פתח שיחה חדשה ב-<a href="https://claude.ai/new" target="_blank" rel="noopener">claude.ai</a>, צרף את קבצי הקורס (PDF, עדיף מוקלדים) והדבק את ההנחיה.</li>
        <li>העתק את התשובה המלאה של Claude והדבק אותה כאן, ואז "שמור כתקציר הקורס".</li>
      </ol>
      <p class="muted small">משתמש במנוי Claude שלך ולא במפתח ה-API. מתאים לקורס עם הרבה קבצים סרוקים או כשהחשבון מגיע למגבלת קצב.</p>
      <div class="row wrap"><button type="button" class="btn small" id="fsDigestCopy">📋 העתק הנחיה</button></div>
      <textarea id="fsDigestPaste" rows="6" style="width:100%" placeholder="הדבק כאן את התקציר שקיבלת מ-Claude"></textarea>
      <div class="row wrap"><button type="button" class="btn small primary" id="fsDigestPasteSave">💾 שמור כתקציר הקורס</button></div>
    </details>
    <div class="field"><span class="field-label">📂 חומרים לתקציר. קבצי PDF נקראים במכשיר בלבד.</span>${fsSourcesHtml(false)}</div>
    ${fsModeHtml('digest')}
    ${hasKey ? '' : '<p class="bad small">צריך מפתח API של Anthropic (בלשונית קו״ח ← הגדרות AI).</p>'}
    <div class="actions"><button class="btn" value="cancel" formnovalidate>סגור</button><button class="btn primary" value="make" ${hasKey ? '' : 'disabled'}>📚 הכן תקציר</button></div>`, (action, fd) => {
    if (action !== 'make') return;
    if (fd.get('cdrive') && fsDriveNeedsAccess()) return false;
    (fsWantsBatch(fd) ? fsBatchStartDigest : fsMakeDigest)(String(fd.get('course')), fsReadSources(fd), !!fd.get('pangea'), !!fd.get('cdrive'));
  }, form => {
    const sel = $('#fsCourse', form);
    $('#fsDigestCopy', form).onclick = async () => {
      const c = courseByCode(sel.value);
      await navigator.clipboard.writeText(`${fsDigestTask(c)}\n\nSOURCES: the course files attached to this message. Read all of them.\n\n${FS_TEXT_TAIL}`);
      toast('ההנחיה הועתקה. הדבק אותה ב-claude.ai יחד עם קבצי הקורס.');
    };
    $('#fsDigestPasteSave', form).onclick = () => {
      const text = $('#fsDigestPaste', form).value.trim();
      if (text.length < 500) return toast('התקציר קצר מדי. הדבק את כל התשובה של Claude.');
      Store.put('digest', sel.value, { text, at: Date.now(), n: 0, manual: true });
      delete fsDigestErr[sel.value]; fsDigestErrSave(); fsPartsClear(sel.value);
      $('#fsDigestPaste', form).value = '';
      toast('📚 התקציר נשמר. עכשיו אפשר ליצור ממנו נוסחאון.');
      sel.dispatchEvent(new Event('change')); fsActivityRefresh();
    };
    const draw = () => {
      const code = sel.value, d = fsDigest(code), box = $('#fsDigestState', form);
      const err = fsDigestErr[code];
      box.innerHTML = (err ? `<p class="bad small">⚠️ הניסיון האחרון (${new Date(err.at).toLocaleString(LOCALE, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}) נכשל בשלב "${esc(err.stage)}": ${esc(err.msg)}${err.used ? ` · נוצל ${esc(fsUsageText(err.used).split(' (')[0])}` : ''}</p>
          ${err.detail ? `<p class="muted small" dir="ltr" style="text-align:left">${esc(err.detail)}</p>` : ''}
          <p class="small">💡 ${err.kept ? `${err.kept} חלקים שכבר נכתבו נשמרו: ניסיון חוזר עם אותם קבצים ישלח רק את החסרים. ` : ''}${err.rate ? 'הסיבה: מגבלת קצב של חשבון ה-API (כמה טוקנים מותר לשלוח בדקה). מומלץ <b>💰 חסכוני</b>: התור לא מוגבל כך, חצי מחיר, וממשיך גם אם סוגרים את האפליקציה. או: פחות קבצים סרוקים.' : (err.batch ? 'אם זה חוזר, אפשר להכין את התקציר בלי ה-API: "✍️ דרך נוספת" למטה.' : 'אפשר לנסות שוב, או לבחור <b>💰 חסכוני</b> (ממשיך גם אם סוגרים את האפליקציה).')}</p>` : '')
        + (fsJob('digest:' + code) ? (fsJob('digest:' + code).error ? `<p class="bad small">⚠️ התקציר החסכוני נעצר: ${esc(fsJob('digest:' + code).error)} <button type="button" class="btn small" data-djob-clear="${esc(code)}">הסר</button></p>` : `<p class="small">⏳ <b>בתור החסכוני</b> · התחיל ב-${fsHm(fsJob('digest:' + code).at)} · מוכן בערך ב-<b>${fsJobEta(fsJob('digest:' + code)).at}</b> (בעוד כ-${fsJobEta(fsJob('digest:' + code)).min} דק׳). אפשר לסגור את החלון; תקבל התראה. <button type="button" class="btn small" data-djob-cancel="${esc(code)}">✖ בטל</button></p>`) : '')
        + (fsDigestRun[code] ? `<p class="muted small">📚 בהכנה כרגע: ${esc(fsDigestRun[code])}</p>`
        : d ? `<p class="small"><b class="ok">✓ יש תקציר</b> · ${esc(fsDigestInfo(d))}${d.ai ? ` · עלה ${esc(fsUsageText(d.ai).split(' (')[0])}` : ''}. הכנה מחדש תחליף אותו.</p>
          <details class="set-sub"><summary>הצג / ערוך את התקציר</summary>
            <textarea id="fsDigestText" rows="14" style="width:100%">${esc(d.text)}</textarea>
            <div class="row wrap"><button type="button" class="btn small" id="fsDigestSave">שמור שינויים</button><button type="button" class="btn small danger" id="fsDigestDel">מחק תקציר</button></div>
          </details>`
        : '<p class="muted small">עוד אין תקציר לקורס הזה.</p>');
      if ($('#fsDigestSave', form)) $('#fsDigestSave', form).onclick = () => { Store.put('digest', code, { text: $('#fsDigestText', form).value.trim() }); toast('התקציר נשמר'); };
      if ($('#fsDigestDel', form)) $('#fsDigestDel', form).onclick = () => { if (confirm('למחוק את תקציר הקורס?')) { Store.remove('digest', code); draw(); } };
      fsPangeaCheck(form, code);
    };
    sel.onchange = draw;
    draw();
  });
  fsWide();
}

// ---------- the fixed template ----------
// Puts a section's blocks in the template's order (זיהוי → סד״פ → key formulas → one example → traps),
// drops sub-headings and keeps a single "דוגמת בזק". Reference sections are left as written.
function fsShape(blocks, kind = 'method') {
  if (kind === 'reference') return blocks;
  const rank = b => (b.t === 'kv' && /זיהוי/.test(b.label || '') ? 0 : b.t === 'kv' && /תנאי/.test(b.label || '') ? 0.5 : b.t === 'kv' && /מסקנה|התכלס/.test(b.label || '') ? 0.6
    : b.t === 'steps' ? 1 : b.t === 'callout' && b.variant === 'trap' ? 5 : b.t === 'example' ? 4 : b.t === 'callout' ? 3 : 2);
  let ex = 0;
  return blocks.filter(b => b.t !== 'h' && (b.t !== 'example' || !ex++)).map((b, i) => [b, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
}
// Which blocks give way first when the sheet is too long: 1 = extras (paragraphs, lists, tips),
// 2 = key formulas beyond the first two, 3 = tables in method sections. The template's core
// (זיהוי, סד״פ, the example, the traps) is never hidden.
function fsKeepRank(b, kind, k, all) {
  if (kind === 'reference') return 9;
  if (b.t === 'steps' || b.t === 'example' || (b.t === 'callout' && b.variant === 'trap') || (b.t === 'kv' && /זיהוי|תנאי|מסקנה|התכלס/.test(b.label || ''))) return 9;
  if (b.t === 'text' || b.t === 'list' || b.t === 'callout') return 1;
  if (b.t === 'eq' || b.t === 'kv') return all.slice(0, k).filter(x => x.t === 'eq' || (x.t === 'kv' && !/זיהוי|תנאי|מסקנה|התכלס/.test(x.label || ''))).length >= 2 ? 2 : 9;
  if (b.t === 'table' || b.t === 'symbols') return kind === 'method' ? 3 : 9;
  return 9;
}

// ---------- the step prompts (the same for a direct run and a batch run) ----------
const fsPlanAsk = budget => `STEP 1: PLAN the sheet. Do not write any blocks yet.
Return:
- "title" and "profile".
- "sections": the exam problem types of the course, one section each, in the course's order, following THE FIXED TEMPLATE (about ${Math.max(6, Math.round(budget / 32))} of them; reference sections last). For each: "title" (the problem type's name); "kind" ("method", "theory" or "reference"); "brief": what the writer puts in each part of the template (how to recognise it, the steps, the key formulas, the idea of the one example, the traps), precise enough that a writer who sees only this plan and the sources writes it with no overlap with the other sections; "lines": its share of the space in short lines (the shares add up to about ${budget}). The most room goes to what the exams and the student's emphasis need.
- "advice": empty, unless the course needs something other than the template (e.g. a theory section that every method depends on should come first, or a topic with no method at all). Then one or two short Hebrew sentences of recommendation to the student.
- "coverage": every syllabus topic with status in / partial / missing and a short note.`;
const fsSectionAsk = (planText, i, s) => `STEP 2: WRITE ONE SECTION of the sheet.
The plan of the whole sheet: ${planText}
Write ONLY section ${i + 1}: "${s.title}", a "${s.kind || 'method'}" section of THE FIXED TEMPLATE, in the template's order. Its content: ${s.brief}
Room: about ${s.lines} short lines (a "kv" row ≈ 1, a centered "eq" ≈ 2, a table row ≈ 1.3, a step or list item ≈ 1-2). Fill it; do not go more than 10% over. Do not repeat what the plan gives to other sections.
Return {"blocks":[...]} (the section title is added by the app).`;
const fsCheckAsk = numbered => `STEP 3: CHECK the written sheet against the sources.
The sheet: ${JSON.stringify(numbered)}
Check every formula, sign, condition and theorem statement (the official formula pages and the lecture notes decide), that the notation is the course's, that the LaTeX is valid KaTeX, that every "method" section has its "זיהוי", its סד״פ, ONE "דוגמת בזק" and its trap callout (and no sub-headings), and that nothing is said twice in different sections.
Return {"fixes":[...]} with ONLY the blocks that must change: "section" and "block" are the numbers above; "action" is "replace" (with the corrected block in "data") or "delete" (a duplicate; "data" is ignored); "why" in a few words. An empty list if everything is right.`;
const fsPlanText = plan => JSON.stringify(plan.sections.map((s, i) => ({ n: i + 1, title: s.title, brief: s.brief, lines: s.lines })));
const fsNumbered = sections => sections.map((s, si) => ({ section: si, title: s.title, blocks: s.blocks.map((b, bi) => ({ block: bi, ...b })) }));
// The check's answer applied: corrected blocks replaced, duplicates removed, template order restored.
function fsApplyFixes(sections, out) {
  sections = sections.map(s => ({ ...s, blocks: [...s.blocks] }));
  let fixed = 0;
  const fixes = (out?.fixes || []).filter(f => sections[f.section]?.blocks[f.block]);
  for (const f of fixes.filter(f => f.action === 'replace' && f.data)) { const b = fsCleanBlock(f.data); if (b.t) { sections[f.section].blocks[f.block] = b; fixed++; } }
  for (const f of fixes.filter(f => f.action === 'delete').sort((a, b) => b.block - a.block)) { sections[f.section].blocks.splice(f.block, 1); fixed++; }
  return { sections: sections.filter(s => s.blocks.length).map(s => ({ ...s, blocks: fsShape(s.blocks, s.kind) })), fixed };
}
// Too long for the pages: hide the least important blocks, in three rounds (no AI involved).
async function fsFitLocal(sheet, sections) {
  let hid = 0;
  const fits = async () => { const info = await fsLayout({ ...sheet, sections, autofit: true }, document.createElement('div')); return !info || (info.pages <= info.target && info.scale >= 0.8); };
  for (let level = 1; level <= 3 && !(await fits()); level++) {
    sections = sections.map(s => ({ ...s, blocks: s.blocks.map((b, k) => { if (b.hidden || fsKeepRank(b, s.kind, k, s.blocks) > level) return b; hid++; return { ...b, hidden: true }; }) }));
  }
  return { sections, hid };
}

document.addEventListener('click', e => {
  const c = e.target.closest?.('[data-djob-cancel]'), x = e.target.closest?.('[data-djob-clear]');
  if (c) fsBatchCancel('digest:' + c.dataset.djobCancel).then(() => fsDigestRefresh(c.dataset.djobCancel));
  if (x) { fsJobPut('digest:' + x.dataset.djobClear, null); fsDigestRefresh(x.dataset.djobClear); }
});

// ---------- economy mode: the Message Batches API ----------
// The same requests (same model, same prompts) sent as a batch: half the price, but answered
// within up to an hour instead of minutes. A sheet goes through three batches in a row (plan →
// sections → check). The job is saved on this device, so closing the app loses nothing: on the
// next start the app looks at the batch again and carries on.
// A sheet in economy mode is written from the course digest only, so every stage can be rebuilt
// after a restart without the original files.
const LS_FS_MODE = 'pp_fs_mode', LS_FS_JOBS = 'pp_fs_jobs', LS_FS_BATCH_HIST = 'pp_fs_batch_hist';
const FS_STAGES = { plan: ['תכנון הפרקים', 1], sections: ['כתיבת הפרקים', 2], check: ['בדיקה מול המקורות', 3], digest: ['זיקוק תקציר הקורס', 1] };
const FS_STAGE_GUESS = { plan: 10, sections: 15, check: 10, digest: 15 }; // minutes, before there is history

const fsJobs = () => { try { return JSON.parse(lsGet(LS_FS_JOBS, '{}')) || {}; } catch { return {}; } };
function fsJobPut(key, job) { const all = fsJobs(); if (job) all[key] = job; else delete all[key]; lsSet(LS_FS_JOBS, JSON.stringify(all)); }
const fsJob = key => fsJobs()[key] || null;

const fsJsonTail = schema => `FORMAT: answer with ONE JSON object only (no prose, no code fence), matching the JSON schema below. Give each block only the fields its type uses. Inside JSON strings every LaTeX backslash is doubled ("\\\\frac{a}{b}", "\\\\theta").
${JSON.stringify(schema)}`;
const FS_TEXT_TAIL = 'FORMAT: plain text with Markdown headings and lists, math in $...$. No JSON.';
// One request of a batch: exactly what a direct call sends (a batch can't carry "fallbacks").
function fsBatchReq(id, prompt, tail, maxTokens, effort, model = CV_MODEL) {
  const content = typeof prompt === 'string' ? `${prompt}\n\n${tail}` : [...prompt, { type: 'text', text: tail }];
  return { custom_id: id, params: { model, max_tokens: maxTokens, system: FS_SYSTEM, output_config: { effort }, messages: [{ role: 'user', content }] } };
}

// How long a stage takes, from your earlier batches (median of the last 10), else a general guess.
function fsStageMinutes(stage) {
  let h = [];
  try { h = (JSON.parse(lsGet(LS_FS_BATCH_HIST, '{}')) || {})[stage] || []; } catch {}
  if (!h.length) return { min: FS_STAGE_GUESS[stage], n: 0 };
  const s = [...h].sort((a, b) => a - b);
  return { min: Math.max(1, Math.round(s[Math.floor(s.length / 2)] / 60000)), n: h.length };
}
function fsStageDone(stage, ms) {
  let all = {};
  try { all = JSON.parse(lsGet(LS_FS_BATCH_HIST, '{}')) || {}; } catch {}
  all[stage] = [...(all[stage] || []), ms].slice(-10);
  lsSet(LS_FS_BATCH_HIST, JSON.stringify(all));
}
// When the whole job should be ready: what is left of this stage plus the stages after it.
function fsJobEta(job) {
  const order = job.type === 'digest' ? ['digest'] : ['plan', 'sections', 'check'];
  const cur = fsStageMinutes(job.stage);
  let min = Math.max(1, cur.min - (Date.now() - job.at) / 60000);
  for (const st of order.slice(order.indexOf(job.stage) + 1)) min += fsStageMinutes(st).min;
  const at = new Date(Date.now() + min * 60000);
  return { min: Math.round(min), at: at.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }), learned: cur.n };
}
const fsHm = t => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

// ---- the mode choice (shown in the create and digest dialogs) ----
const fsModeHtml = what => {
  const m = lsGet(LS_FS_MODE, 'fast');
  return `<div class="field"><span class="field-label">⏱️ אופן היצירה</span><div class="fs-modes">
    <label class="fs-mode"><input type="radio" name="mode" value="fast" ${m !== 'batch' ? 'checked' : ''}><span><b>⚡ מהיר</b><small class="muted">כמה דקות, מחיר מלא</small></span></label>
    <label class="fs-mode"><input type="radio" name="mode" value="batch" ${m === 'batch' ? 'checked' : ''}><span><b>💰 חסכוני (חצי מחיר)</b><small class="muted">אותו מודל ואותה איכות, בתור של Anthropic: בדרך כלל עד שעה${what === 'sheet' ? ' לכל אחד משלושת השלבים' : ''}, עם התראה כשמוכן.${what === 'sheet' ? ' נכתב מתקציר הקורס בלבד.' : ''}</small></span></label>
  </div></div>`;
};
const fsWantsBatch = fd => { const b = fd.get('mode') === 'batch'; lsSet(LS_FS_MODE, b ? 'batch' : 'fast'); return b; };
function fsAskNotify() {
  try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch {}
}
function fsNotify(title, body) {
  toast(`${title} · ${body}`);
  try { if (window.Notification && Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification(title, { body, icon: 'icons/icon-192.png', tag: 'fs-batch' }); } catch {}
}

// Anthropic doesn't let a browser call the batch API directly (no CORS): the calls go through this
// app's own relay on Vercel (api/anthropic-batch.js), which passes them on with your key.
async function fsBatchClient() {
  const key = claudeKey();
  if (!key) throw new Error('צריך מפתח API של Anthropic (בלשונית "הגדרות AI")');
  const { default: Anthropic } = await import(ANTHROPIC_SDK_URL);
  return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, fetch: (url, init) => {
    const u = new URL(String(url?.url || url));
    return fetch(`/api/anthropic-batch?p=${encodeURIComponent(u.pathname + u.search)}`, init);
  } });
}
// The relay takes at most 4.5MB a request, so a batch is kept under 4MB.
const FS_BATCH_MAX = 4e6;
const fsReqSize = r => JSON.stringify(r).length;

// ---- starting ----
const fsBatchMem = {}; // job key → its requests by id, kept in memory to resend failed ones
// Parts of an economy digest too big for the queue: written now (3 at a time), saved like the others.
const fsDirectRun = {}; // job key → how many direct parts are still being written
async function fsDigestDirect(key, job, list) {
  const c = courseByCode(job.code), used = { in: 0, out: 0, read: 0, write: 0, calls: 0, usd: 0 };
  let left = list.length;
  fsDirectRun[key] = left; fsActivityRefresh();
  const queue = [...list];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (let p; (p = queue.shift());) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const t = (await fsAiText([...p.ch.docs, { type: 'text', text: fsDigestPartAsk(c, p.i, job.names.length, p.ch, p.room) }], { maxTokens: 32000, effort: 'medium', model: FS_DIGEST_MODEL, onUsage: (u, m) => fsAddUsage(used, u, m) })).trim();
          if (t) fsPartsPut(job.code, job.sigs[p.i], t);
          break;
        } catch (e) {
          console.warn('direct digest part', p.i, e);
          if (attempt === 3 || [400, 401, 403, 413].includes(e?.status)) break;
          await new Promise(r => setTimeout(r, e?.status === 429 || e?.status === 529 ? 30000 * attempt : 3000));
        }
      }
      fsDirectRun[key] = --left; fsActivityRefresh();
    }
  }));
  // Their cost joins the job's (at the full price: they didn't go through the queue).
  const cur = fsJob(key);
  if (cur) fsJobPut(key, { ...cur, used: { ...cur.used, in: cur.used.in + used.in, out: cur.used.out + used.out, read: cur.used.read + used.read, write: cur.used.write + used.write, calls: (cur.used.calls || 0) + used.calls, usd: fsUsd(cur.used) + used.usd } });
  delete fsDirectRun[key];
  fsBatchSchedule(1000); // the queue part may have ended meanwhile
}
// Joins the saved parts of a digest (in order) into the course digest.
function fsDigestSave(job) {
  const saved = fsPartsAll()[job.code] || {};
  const text = job.names.map((names, i) => `<!-- חלק ${i + 1}: ${names.join(', ')} -->\n${saved[job.sigs[i]]}`).join('\n\n');
  Store.put('digest', job.code, { text, at: Date.now(), n: job.count, ai: job.used, model: FS_DIGEST_MODEL });
  delete fsDigestErr[job.code]; fsDigestErrSave(); fsPartsClear(job.code);
  fsDigestRefresh(job.code);
}
async function fsBatchSubmit(key, job, requests) {
  const size = requests.reduce((s, r) => s + fsReqSize(r), 0);
  if (size > FS_BATCH_MAX) throw new Error(`הבקשה לתור גדולה מדי (${(size / 1e6).toFixed(1)}MB, המקסימום 4MB). בחר ⚡ מהיר, או קצר את תקציר הקורס.`);
  const client = await fsBatchClient();
  const b = await client.messages.batches.create({ requests });
  fsJobPut(key, { ...job, batchId: b.id, at: Date.now(), counts: null, error: '', fails: 0, waiting: false });
  fsBatchSchedule(5000);
  fsBatchRedraw(key);
}
const fsSheetShared = sheet => {
  const d = fsDigest(sheet.course);
  return [{ type: 'text', text: `${fsBriefTask(sheet)}\n\nSOURCES:\n<course_digest note="prepared earlier from the full course materials; treat it as the main source">\n${d?.text || ''}\n</course_digest>`, cache_control: { type: 'ephemeral' } }];
};
async function fsBatchStartSheet(id) {
  const sheet = Store.get('sheet', id), key = 'sheet:' + id;
  if (!fsDigest(sheet?.course)) return toast('במצב חסכוני הנוסחאון נכתב מתקציר הקורס, ולקורס הזה עוד אין תקציר. הכן קודם תקציר (📚).');
  if (fsJob(key) && !fsJob(key).error) return toast('הנוסחאון הזה כבר בתור החסכוני');
  fsAskNotify();
  try {
    const used = { in: 0, out: 0, read: 0, write: 0, calls: 0, batch: true };
    await fsBatchSubmit(key, { type: 'sheet', id, stage: 'plan', t0: Date.now(), used },
      [fsBatchReq('plan', [...fsSheetShared(sheet), { type: 'text', text: fsPlanAsk(fsLineBudget(sheet)) }], fsJsonTail(FS_OUTLINE_SCHEMA), 48000, 'high')]);
    toast('💰 נשלח לתור החסכוני. תקבל התראה כשהנוסחאון מוכן.');
  } catch (e) { console.error(e); toast(`השליחה לתור נכשלה: ${aiError(e).text}`); }
}
async function fsBatchStartDigest(code, files, usePangea, useDrive) {
  const key = 'digest:' + code, c = courseByCode(code);
  if (fsJob(key) && !fsJob(key).error) return toast('התקציר של הקורס הזה כבר בתור החסכוני');
  fsAskNotify();
  let stage = 'קריאת החומרים';
  delete fsDigestErr[code]; fsDigestErrSave();
  fsDigestRun[code] = 'קורא את החומרים…'; fsDigestRefresh(code);
  try {
    const src = await fsReadMaterials({ course: code }, files, usePangea, useDrive, t => { fsDigestRun[code] = String(t).replace(/<[^>]+>/g, ''); fsDigestRefresh(code); }, '', { split: true });
    stage = 'שליחה לתור החסכוני';
    fsDigestRun[code] = `שולח ${src.count} מקורות לתור…`; fsDigestRefresh(code);
    if (!src.count) throw new Error('לא נבחרו חומרים (או שאף קובץ לא נקרא), ואין ממה להכין תקציר.');
    const chunks = fsDigestChunks(src.items);
    const total = chunks.reduce((s, ch) => s + ch.weight, 0) || 1;
    const used = { in: 0, out: 0, read: 0, write: 0, calls: 0, batch: true, usd: 0 };
    const job = { type: 'digest', code, stage: 'digest', t0: Date.now(), used, names: chunks.map(ch => ch.names), sigs: chunks.map(fsPartSig), count: src.count, left: src.left, twins: src.twins };
    // Parts already written in an earlier attempt (fast or economy) with the same files are not sent again.
    const saved = fsPartsAll()[code] || {};
    const todo = chunks.map((ch, i) => i).filter(i => !saved[job.sigs[i]]);
    if (!todo.length) { fsDigestSave(job); toast(`📚 התקציר של ${c?.name || code} הורכב מהחלקים שכבר נכתבו, בלי עלות נוספת.`); return; }
    const reqs = todo.map(i => fsBatchReq('p' + i, [...chunks[i].docs, { type: 'text', text: fsDigestPartAsk(c, i, chunks.length, chunks[i], Math.max(1500, Math.round(15000 * chunks[i].weight / total))) }], FS_TEXT_TAIL, 32000, 'medium', FS_DIGEST_MODEL));
    // The queue takes up to 4MB a batch (the relay's limit). Parts that don't fit (big scans) are
    // written right away instead, at the full price, while the rest wait in the queue.
    const queued = [], direct = [];
    let room = FS_BATCH_MAX;
    reqs.forEach((r, j) => { const n = fsReqSize(r); if (n <= room) { queued.push(r); room -= n; } else direct.push(todo[j]); });
    if (!queued.length) { delete fsDigestRun[code]; toast('כל החלקים גדולים מדי לתור החסכוני (סריקות כבדות): מכין במצב ⚡ מהיר.'); return await fsMakeDigest(code, files, usePangea, useDrive); }
    fsBatchMem[key] = Object.fromEntries(queued.map(r => [r.custom_id, r])); // for one retry of failed parts (while the app stays open)
    await fsBatchSubmit(key, job, queued);
    if (direct.length) fsDigestDirect(key, job, direct.map(i => ({ i, ch: chunks[i], room: Math.max(1500, Math.round(15000 * chunks[i].weight / total)) })));
    const reused = chunks.length - todo.length;
    toast(`💰 התקציר של ${c?.name || code} נשלח לתור החסכוני (${queued.length} חלקים${reused ? `; ${reused} נלקחו מהניסיון הקודם` : ''})${direct.length ? `. ${direct.length} חלקים עם סריקות כבדות נכתבים עכשיו ישירות: השאר את האפליקציה פתוחה כמה דקות` : ''}${fsTwinsNote(src.twins)}. תקבל התראה כשמוכן.`);
  } catch (e) {
    console.error('economy digest failed at', stage, e);
    fsDigestErr[code] = { msg: aiError(e).text, stage, at: Date.now(), detail: fsErrDetail(e), rate: e?.status === 429, batch: true };
    fsDigestErrSave();
    toast(`הכנת התקציר נכשלה בשלב "${stage}": ${aiError(e).text}`);
  }
  finally { delete fsDigestRun[code]; fsDigestRefresh(code); }
}

// ---- watching ----
let fsBatchTimer = null, fsBatchBusy = false;
function fsBatchSchedule(ms = 60000) { clearTimeout(fsBatchTimer); if (Object.keys(fsJobs()).length) fsBatchTimer = setTimeout(fsBatchPoll, ms); }
async function fsBatchPoll() {
  if (fsBatchBusy || !claudeKey() || !navigator.onLine) return fsBatchSchedule();
  fsBatchBusy = true;
  try {
    for (const [key, job] of Object.entries(fsJobs())) {
      if (job.error || !job.batchId) continue;
      try {
        const client = await fsBatchClient();
        const b = await client.messages.batches.retrieve(job.batchId);
        if (b.processing_status !== 'ended') { fsJobPut(key, { ...job, counts: b.request_counts, checked: Date.now() }); fsBatchRedraw(key); continue; }
        const res = {};
        for await (const r of await client.messages.batches.results(job.batchId)) {
          if (r.result?.type === 'succeeded') {
            const m = r.result.message, text = m.content.filter(x => x.type === 'text').map(x => x.text).join('');
            fsAddUsage(job.used, m.usage, m.model);
            // A cut answer keeps what was written: a digest part is still useful (a JSON one won't parse and is resent).
            res[r.custom_id] = m.stop_reason === 'refusal' ? { error: 'הבקשה נדחתה' } : m.stop_reason === 'max_tokens' ? { text, cut: true, error: 'התשובה נחתכה' } : { text };
          } else res[r.custom_id] = { error: r.result?.type === 'expired' ? 'פג הזמן בתור' : r.result?.type === 'canceled' ? 'בוטל' : (r.result?.error?.error?.message || r.result?.error?.type || 'שגיאה') };
        }
        if (!job.fails && !job.waiting) fsStageDone(job.stage, Date.now() - job.at); // once a stage, so retries don't skew the estimate
        try { await fsBatchAdvance(key, job, res); }
        catch (e) {
          // Sending the next stage failed. Without this the job stayed "in the queue" for ever, retried
          // every minute in silence. A request the API turned away (4xx) stops at once, anything else after 3 tries.
          console.error('batch advance', key, e);
          const cur = fsJob(key), fails = (cur?.fails || 0) + 1;
          if (cur && ((e?.status >= 400 && e?.status < 500 && e?.status !== 429) || fails >= 3)) fsBatchFail(key, cur, `שליחת השלב הבא נכשלה: ${aiError(e).text}${fsErrDetail(e) ? ` (${fsErrDetail(e)})` : ''}`);
          else if (cur) fsJobPut(key, { ...cur, fails });
        }
      } catch (e) {
        console.error('batch', key, e);
        if (e?.status === 404 || e?.status === 401) fsJobPut(key, { ...job, error: aiError(e).text });
      }
      fsBatchRedraw(key);
    }
  } finally { fsBatchBusy = false; fsBatchSchedule(); }
}
const fsBatchFail = (key, job, msg) => { fsJobPut(key, { ...job, error: msg }); fsNotify('⚠️ היצירה החסכונית נעצרה', msg); };

// A stage has ended: read its answers and send the next stage (or finish).
async function fsBatchAdvance(key, job, res) {
  if (job.type === 'digest' && job.sigs) {
    // Every part that came back is saved at once (by its files), so nothing paid for is lost.
    for (const [cid, r] of Object.entries(res)) if (r.text?.trim()) fsPartsPut(job.code, job.sigs[+cid.slice(1)], r.text.trim() + (r.cut ? '\n\n<!-- החלק נחתך כאן (ארוך מדי) -->' : ''));
    if (fsDirectRun[key] != null) { // the big parts are still being written here: wait for them
      if (!fsJob(key)?.waiting) fsJobPut(key, { ...fsJob(key), waiting: true });
      return;
    }
    const saved = fsPartsAll()[job.code] || {}, c = courseByCode(job.code);
    const missing = job.names.map((n, i) => i).filter(i => !saved[job.sigs[i]]);
    const mem = fsBatchMem[key];
    if (missing.length && !job.retried && mem && missing.every(i => mem['p' + i])) // once more, only the failed ones
      return fsBatchSubmit(key, { ...job, retried: true }, missing.map(i => mem['p' + i]));
    if (missing.length) {
      // Like the fast mode: a digest with a part missing would miss that material in every sheet, so it
      // is not saved. The parts that were written stay, and "try again" with the same files sends only the rest.
      const why = missing.map(i => res['p' + i]?.error).find(Boolean) || 'שגיאה';
      fsJobPut(key, null); delete fsBatchMem[key];
      fsDigestErr[job.code] = { msg: `${missing.length} מתוך ${job.names.length} חלקים לא נכתבו (${why})`, stage: 'זיקוק בתור החסכוני', at: Date.now(), used: job.used, kept: job.names.length - missing.length, batch: true };
      fsDigestErrSave();
      fsNotify(`⚠️ התקציר של ${c?.name || job.code} לא הושלם`, `${missing.length} חלקים חסרים (${why}). החלקים שנכתבו נשמרו: נסה שוב עם אותם קבצים, ורק החסרים יישלחו.`);
      return;
    }
    fsDigestSave(job);
    fsJobPut(key, null); delete fsBatchMem[key];
    fsNotify(`📚 התקציר של ${c?.name || job.code} מוכן`, `${fsUsageText(job.used).split(' (')[0]}${job.left?.length ? ` · לא נקראו: ${job.left.join(', ')}` : ''}${fsTwinsNote(job.twins)}. עכשיו אפשר ליצור ממנו נוסחאון.`);
    return;
  }
  if (job.type === 'digest') { // a job sent by an older version (no saved parts)
    const parts = job.names.map((names, i) => (res['p' + i]?.text ? `<!-- חלק ${i + 1}: ${names.join(', ')} -->\n${res['p' + i].text.trim()}` : ''));
    const failed = job.names.filter((n, i) => !parts[i]);
    if (failed.length > job.names.length / 2) return fsBatchFail(key, job, `רוב חלקי התקציר נכשלו (${Object.values(res).find(r => r.error)?.error || ''}). נסה שוב.`);
    const text = parts.filter(Boolean).join('\n\n');
    Store.put('digest', job.code, { text, at: Date.now(), n: job.count, ai: job.used });
    fsJobPut(key, null);
    delete fsDigestErr[job.code]; fsDigestErrSave(); fsPartsClear(job.code);
    const c = courseByCode(job.code);
    fsNotify(`📚 התקציר של ${c?.name || job.code} מוכן`, `${fsUsageText(job.used).split(' (')[0]}${failed.length ? ` · ${failed.length} חלקים חסרים` : ''}. עכשיו אפשר ליצור ממנו נוסחאון.`);
    return;
  }
  const sheet = Store.get('sheet', job.id);
  if (!sheet) return fsJobPut(key, null); // the sheet was deleted meanwhile
  const shared = fsSheetShared(sheet);
  const step = text => [...shared, { type: 'text', text }];
  if (job.stage === 'plan') {
    let plan;
    try { plan = fsCleanOut(fsParseJson(res.plan?.text || '')); } catch {}
    plan && (plan.sections = (plan.sections || []).filter(s => s?.title));
    if (!plan?.sections?.length) return fsBatchFail(key, job, `שלב התכנון לא החזיר פרקים${res.plan?.error ? ` (${res.plan.error})` : ''}.`);
    const planText = fsPlanText(plan);
    return fsBatchSubmit(key, { ...job, stage: 'sections', outline: plan, sections: [], retried: false },
      plan.sections.map((s, i) => fsBatchReq('s' + i, step(fsSectionAsk(planText, i, s)), fsJsonTail(FS_BLOCKS_SCHEMA), 48000, 'medium')));
  }
  if (job.stage === 'sections') {
    const plan = job.outline, sections = [...(job.sections || [])];
    for (const [cid, r] of Object.entries(res)) {
      const i = +cid.slice(1);
      try { const out = fsCleanOut(fsParseJson(r.text || '')); if (out.blocks?.length) sections[i] = { title: plan.sections[i].title, kind: plan.sections[i].kind || 'method', blocks: fsShape(out.blocks, plan.sections[i].kind) }; } catch {}
    }
    const missing = plan.sections.map((s, i) => i).filter(i => !sections[i]);
    if (missing.length && !job.retried) { // once more, only the ones that failed
      const planText = fsPlanText(plan);
      return fsBatchSubmit(key, { ...job, sections, retried: true },
        missing.map(i => fsBatchReq('s' + i, step(fsSectionAsk(planText, i, plan.sections[i])), fsJsonTail(FS_BLOCKS_SCHEMA), 48000, 'medium')));
    }
    if (missing.length > plan.sections.length / 2) return fsBatchFail(key, job, 'רוב הפרקים לא נכתבו. נסה שוב.');
    const done = sections.filter(Boolean);
    return fsBatchSubmit(key, { ...job, stage: 'check', sections: done, lost: missing.map(i => plan.sections[i].title) },
      [fsBatchReq('check', step(fsCheckAsk(fsNumbered(done))), fsJsonTail(FS_FIXES_SCHEMA), 48000, 'high')]);
  }
  if (job.stage === 'check') {
    let sections = job.sections, fixed = 0, checked = true;
    try { ({ sections, fixed } = fsApplyFixes(sections, fsCleanOut(fsParseJson(res.check?.text || '')))); } catch { checked = false; }
    let hid = 0;
    try { ({ sections, hid } = await fsFitLocal(sheet, sections)); } catch (e) { console.warn('fit', e); }
    const plan = job.outline;
    Store.put('sheet', job.id, { title: plan.title || sheet.title, profile: plan.profile?.length ? plan.profile : sheet.profile, sections: sections.map(s => ({ id: fsId(), ...s })), coverage: plan.coverage || [], advice: plan.advice || '', ai: { ...job.used, at: Date.now() } });
    fsJobPut(key, null);
    fsNotify(`📐 ${plan.title || sheet.title} מוכן`, `${fsUsageText(job.used).split(' (')[0]} (חצי מחיר)${checked ? (fixed ? ` · ${fixed} תיקונים בבדיקה` : ' · נבדק מול המקורות') : ''}${hid ? ` · ${hid} בלוקים הוסתרו כדי להיכנס לעמודים` : ''}${job.lost?.length ? ` · חסרים: ${job.lost.join(', ')}` : ''}`);
  }
}
async function fsBatchCancel(key) {
  const job = fsJob(key);
  if (!job || !confirm('לבטל את היצירה החסכונית? מה שכבר חויב לא יוחזר.')) return;
  try { if (!job.error) await (await fsBatchClient()).messages.batches.cancel(job.batchId); } catch (e) { console.warn(e); }
  fsJobPut(key, null);
  fsBatchRedraw(key);
}
function fsBatchRedraw(key) {
  fsActivityRefresh();
  if (currentView !== 'formula') return;
  if (!fsOpenId || key === 'sheet:' + fsOpenId) { if (!$('#modal').open) render(); }
  if (key.startsWith('digest:')) fsDigestRefresh(key.slice(7));
}

// The waiting screen of a sheet in the economy queue.
function fsBatchCardHtml(job) {
  const [name, n] = FS_STAGES[job.stage] || ['', 1];
  const eta = fsJobEta(job);
  const counts = job.counts && job.stage === 'sections' ? ` · ${job.counts.succeeded + job.counts.errored}/${Object.values(job.counts).reduce((a, b) => a + b, 0)} פרקים עובדו` : '';
  const notif = window.Notification ? Notification.permission : 'unsupported';
  if (job.error) return `<div class="fs-blank"><div class="fs-blank-ic">⚠️</div><h3>היצירה החסכונית נעצרה</h3><p class="bad">${esc(job.error)}</p>
    <div class="fs-blank-acts"><button class="btn primary" type="button" data-batch-retry>🔁 התחל מחדש בתור</button><button class="btn" type="button" data-batch-cancel>הסר</button></div></div>`;
  return `<div class="fs-blank fs-batch">
    <div class="fs-blank-ic">⏳</div>
    <h3>הנוסחאון בתור החסכוני</h3>
    <p><b>שלב ${n}/3: ${name}</b>${counts} · התחיל ב-${fsHm(job.at)}</p>
    <p class="fs-eta">⏱️ הערכה: מוכן בערך ב-<b>${eta.at}</b> (בעוד כ-${eta.min} דק׳) <small class="muted">${eta.learned ? `לפי ${eta.learned} שלבים קודמים שלך` : 'הערכה כללית; תשתפר אחרי כמה ריצות'}. לרוב תוך שעה, ולכל היותר 24 שעות.</small></p>
    <div class="fs-batch-howto">
      <b>מה עכשיו?</b>
      <ul>
        <li>אפשר לעבור לכל מסך אחר ולהמשיך לעבוד. האפליקציה בודקת כל דקה, ו${notif === 'granted' ? 'תקפוץ התראה' : 'תופיע הודעה'} כשהנוסחאון מוכן.</li>
        <li>אפשר גם לסגור את האפליקציה: בפתיחה הבאה <b>באותו מכשיר</b> היא תמשיך מאיפה שעצרה.</li>
        <li>לא לערוך את הנוסחאון עד שהוא מוכן.</li>
        <li>כשהוא מוכן: עבור על "💡 המלצת מבנה" ו"✅ כיסוי החומר", החזר בלוקים מוסתרים אם נשאר מקום, ואז 🖨️ PDF.</li>
      </ul>
    </div>
    <div class="fs-blank-acts">
      <button class="btn" type="button" data-batch-poll>🔄 בדוק עכשיו</button>
      ${notif === 'default' ? '<button class="btn" type="button" data-batch-notify>🔔 אפשר התראות</button>' : ''}
      <button class="btn" type="button" data-batch-cancel>✖ בטל</button>
    </div>
    ${job.checked ? `<p class="muted small">נבדק לאחרונה ב-${fsHm(job.checked)}</p>` : ''}
  </div>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest?.('[data-batch-poll],[data-batch-cancel],[data-batch-notify],[data-batch-retry]');
  if (!t || !fsOpenId) return;
  const key = 'sheet:' + fsOpenId;
  if (t.matches('[data-batch-poll]')) { t.disabled = true; fsBatchPoll().finally(() => fsBatchRedraw(key)); }
  else if (t.matches('[data-batch-cancel]')) fsBatchCancel(key);
  else if (t.matches('[data-batch-notify]')) { try { Notification.requestPermission().then(() => fsBatchRedraw(key)); } catch {} }
  else if (t.matches('[data-batch-retry]')) { fsJobPut(key, null); fsBatchStartSheet(fsOpenId); }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Object.keys(fsJobs()).length) fsBatchSchedule(1000); });
setTimeout(() => fsBatchSchedule(3000), 0); // carry on with jobs from before the app was closed

// ---------- full generation: plan → every section at once → check → fit ----------
// One request for a whole sheet is slow and gets cut off at the answer-length limit. So: a short
// plan first, then every section in its own request, all running at the same time, then one check
// against the sources, then (if it doesn't fit the pages) one round of shortening.
// Effort: high for the plan and the check (where judgment matters), medium for writing the sections
// (most of the output). A change of effort drops the API's cache of the sources, so the first
// section request goes out alone and the others follow once it has started (and re-written the cache).
const FS_OUTLINE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'profile', 'sections', 'coverage'],
  properties: {
    title: { type: 'string' },
    profile: { type: 'array', items: { type: 'string', enum: Object.keys(FS_PROFILES) } },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'kind', 'brief', 'lines'], properties: { title: { type: 'string' }, kind: { type: 'string', enum: ['method', 'theory', 'reference'] }, brief: { type: 'string' }, lines: { type: 'integer' } } } },
    coverage: FS_SHEET_SCHEMA.properties.coverage,
    advice: { type: 'string' },
  },
};
const FS_FIXES_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['fixes'],
  properties: { fixes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['section', 'block', 'action', 'why'],
    properties: { section: { type: 'integer' }, block: { type: 'integer' }, action: { type: 'string', enum: ['replace', 'delete'] }, why: { type: 'string' }, data: FS_BLOCK_SCHEMA } } } },
};
const fsWait = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('היצירה בוטלה'), { cancelled: true })); }); });
const fsClock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
// The cancel button of a generation (the editor is redrawn often, so it is wired once here).
document.addEventListener('click', e => { if (e.target.closest?.('[data-fsgen-cancel]')) fsGen[fsOpenId]?.cancel?.(); });

// Reads everything you attached (and the Drive folder / Pangea if asked) into text and documents.
// opts.split: the materials will be split into parts (the course digest), so the limit on scans is
// per part (each scan up to 90 pages and 16MB) and not on all of them together.
async function fsReadMaterials(sheet, files, usePangea, useDrive, say, digest, opts = {}) {
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
  const items = []; // the same material file by file (the digest splits it into parts that run in parallel)
  const kinds = [...FS_SOURCES, ['inspire', 'existing formula sheet (style/inspiration only)']];
  // First every file is read once, so a scan can be compared with the typed files.
  const read = [];
  for (const [k] of kinds) for (const f of (files || {})[k] || []) {
    say(`📖 קורא ${esc(f.name)}…`);
    try {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        const { text: t, pages } = await fsPdfText(f);
        read.push({ k, f, t, pages, scan: t.replace(/\s/g, '').length < pages * 150 }); // mostly scans
      } else read.push({ k, f, t: /\.json$/i.test(f.name) ? await f.text() : await fileToText(f) });
    } catch (e) { console.warn('formula sheet: could not read', f.name, e); skipped.push(f.name); }
  }
  // A scan of something that is also here typed (same kind, same numbers in the name) is left out:
  // the typed file has the same content for a fraction of the tokens.
  const twins = read.filter(r => r.scan && read.some(o => !o.scan && o.k === r.k && fsTwinNames(r.f.name, o.f.name))).map(r => r.f.name);
  const capPages = opts.split ? 400 : 90, capBytes = opts.split ? 80e6 : 16e6;
  for (const [k, l] of kinds) {
    let text = '', room = budget[k];
    const item = (name, t, doc) => { const s = String(t || '').slice(0, Math.max(0, room)); room -= s.length; items.push({ kind: k, label: l, name, text: s, doc }); };
    for (const { f, t, pages, scan } of read.filter(r => r.k === k && !twins.includes(r.f.name))) {
      if (scan) {
        // A request may be at most 32MB, and a scan is sent in base64 (a third bigger). Split into
        // parts, each part is its own request, so the limit is per file (the parts keep to 16MB each).
        if (docPages + pages <= capPages && docBytes + f.size <= capBytes && pages <= 90 && f.size <= 16e6) {
          docPages += pages; docBytes += f.size;
          docs.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await fsBase64(f) }, title: f.name, context: `source kind: ${k} (${l})` });
          text += `\n--- ${f.name}: scanned, attached as a document ---\n`;
          item(f.name, '', { doc: docs[docs.length - 1], pages, bytes: f.size });
        } else skipped.push(f.name);
        continue;
      }
      text += `\n--- ${f.name} ---\n${t}`;
      item(f.name, t);
    }
    if (text.trim()) parts.push(`<source kind="${k}" label="${esc(l)}">\n${text.slice(0, budget[k])}\n</source>`);
  }
  if (usePangea) {
    const pg = Pangea.course(sheet.course);
    let text = '', n = 0, room = budget.pangea;
    // All pages at once, kept in their order.
    const pages = await Promise.all((pg?.pages || []).map(p => Pangea.pageText(p.url).then(t => { say(`💧 קורא את פנגייה ${++n}/${pg.pages.length}…`); return t; }, () => '')));
    pages.forEach((t, i) => {
      if (!t) return;
      text += `\n--- ${pg.pages[i].title} ---\n` + t;
      const s = t.slice(0, Math.max(0, room)); room -= s.length;
      if (s) items.push({ kind: 'summaries', label: 'Pangea student summaries', name: pg.pages[i].title, text: s });
    });
    if (text.trim()) parts.push(`<source kind="summaries" label="Pangea student summaries">\n${text.slice(0, budget.pangea)}\n</source>`);
  }
  const left = [...skipped, ...driveFailed];
  const count = parts.length ? Object.values(files || {}).reduce((s, a) => s + a.length, 0) - skipped.length - twins.length + (usePangea ? Pangea.course(sheet.course)?.pages.length || 0 : 0) : 0;
  if (digest) parts.unshift(`<course_digest note="prepared earlier from the full course materials; treat it as the main source">\n${digest}\n</course_digest>`);
  return { docs, items, text: parts.join('\n\n') || '(no files: use your knowledge of the standard Technion syllabus for this course)', left, count, twins };
}
// Two file names of the same material: the same numbers (lecture 3, 2024…) and a word in common,
// once words like "scan" / "סרוק" and copy marks like "(1)" are taken out.
function fsTwinNames(a, b) {
  const words = n => String(n).toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(/\(\d+\)/g, ' ')
    .replace(/\b(scan(ned)?|copy|final|typed|handwritten)\b|סרוק[הים]*|סריק[הות]*|כתב[\s_-]*יד|עותק|מוקלד[תים]*/g, ' ')
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const wa = words(a), wb = words(b);
  const num = w => w.filter(x => /^\d+$/.test(x)).map(Number).join(',');
  if (wa.join(' ') === wb.join(' ')) return wa.length > 0;
  return num(wa) !== '' && num(wa) === num(wb) && wa.some(x => !/^\d+$/.test(x) && wb.includes(x));
}
const fsTwinsNote = twins => (twins?.length ? ` · דולגו ${twins.length} סריקות שיש להן גרסה מוקלדת (${twins.join(', ')})` : '');

async function fsGenerate(id, files, usePangea, useDrive, useDigest) {
  const prev = fsGen[id];
  if (prev?.state === 'run') return toast('הנוסחאון הזה כבר בבנייה…');
  const given = files; // what you attached by hand
  // A retry with the same materials continues from where it stopped (sources read, plan, finished sections).
  const work = (prev?.state === 'error' && prev.files === given && prev.usePangea === usePangea && prev.useDrive === useDrive && prev.useDigest === useDigest && prev.work) || {};
  const ac = new AbortController();
  const t0 = Date.now();
  // The status lives in fsGen, so it survives every redraw of the editor (sync, edits, tab switches).
  const setStatus = (html, state = 'run') => {
    fsGen[id] = { state, html, files: given, usePangea, useDrive, useDigest, work, t0, cancel: () => ac.abort() };
    if (currentView === 'formula' && !fsOpenId) { if (state !== 'run') render(); else fsActivityRefresh(); } // the list shows the sheet's state
    if (fsOpenId !== id || currentView !== 'formula') return;
    const st = $('#fsStatus'); if (st) st.innerHTML = html;
    const msg = $('#fsGenMsg');
    if (msg && state === 'run') msg.innerHTML = html; else if ($('#fsSheet .fs-blank')) render();
  };
  let stage = 'הכנת החומרים'; // named in the error, so a failure says where it happened
  const say = (text, name) => { if (name) stage = name; setStatus(`<span class="muted">${text}</span>`); };
  const used = work.used = work.used || { in: 0, out: 0, read: 0, write: 0, calls: 0 }; // kept across "try again"
  const call = (content, schema, maxTokens, effort = 'high', onStart) => fsAiCall(content, schema, { maxTokens, effort, signal: ac.signal, onUsage: (u, m) => fsAddUsage(used, u, m), onStart });
  try {
    say('📖 מכין את החומרים…');
    const sheet = Store.get('sheet', id);
    if (!work.src) work.src = await fsReadMaterials(sheet, files, usePangea, useDrive, say, useDigest ? fsDigest(sheet.course)?.text : '');
    if (ac.signal.aborted) throw Object.assign(new Error('היצירה בוטלה'), { cancelled: true });
    // Everything up to here is the same in every request, so the API keeps it in its cache: the
    // plan request pays for the sources once, and the section requests read them at a fraction.
    const shared = [...work.src.docs, { type: 'text', text: `${fsBriefTask(sheet)}\n\nSOURCES:\n${work.src.text}`, cache_control: { type: 'ephemeral' } }];
    const step = text => [...shared, { type: 'text', text }];
    const budget = fsLineBudget(sheet);

    // 1. The plan.
    if (!work.outline) {
      say('🧭 שלב 1/4: מתכנן את הפרקים', 'תכנון הפרקים');
      const out = await call(step(fsPlanAsk(budget)), FS_OUTLINE_SCHEMA, 48000);
      out.sections = (out.sections || []).filter(s => s?.title);
      if (!out.sections.length) throw new Error('ה-AI לא החזיר תכנון פרקים. נסה שוב.');
      work.outline = out;
      work.sections = [];
    }
    const plan = work.outline, n = plan.sections.length;
    const planText = fsPlanText(plan);

    // 2. Every section, all at the same time. One that fails is tried again by itself.
    const done = () => work.sections.filter(Boolean).length;
    const progress = () => say(`✍️ שלב 2/4: כותב את כל ${n} הפרקים במקביל · ${done()}/${n} מוכנים`);
    stage = 'כתיבת הפרקים';
    progress();
    const errors = [];
    const writeSection = async (s, i, onStart) => {
      if (work.sections[i]) return;
      for (let attempt = 1; ; attempt++) {
        try {
          const out = await call(step(fsSectionAsk(planText, i, s)), FS_BLOCKS_SCHEMA, 48000, 'medium', onStart);
          if (!out.blocks?.length) throw new Error('פרק ריק');
          work.sections[i] = { title: s.title, kind: s.kind || 'method', blocks: fsShape(out.blocks, s.kind) };
          progress();
          return;
        } catch (e) {
          if (e?.cancelled || ac.signal.aborted) throw e;
          if (e?.status === 401 || e?.status === 403 || /credit balance/i.test(String(e?.message))) { errors.push(e); return; }
          if (attempt >= 3) { errors.push(e); return; }
          await fsWait(e?.status === 429 || e?.status === 529 ? 25000 * attempt : 2000, ac.signal); // busy: give it room
        }
      }
    };
    // The first one goes out alone; the moment it starts answering, all the others go out together.
    const todo = plan.sections.map((s, i) => i).filter(i => !work.sections[i]);
    if (todo.length) {
      let go1;
      const started = new Promise(res => { go1 = res; });
      const first = writeSection(plan.sections[todo[0]], todo[0], go1).finally(go1);
      await started;
      await Promise.all([first, ...todo.slice(1).map(i => writeSection(plan.sections[i], i))]);
    }
    if (ac.signal.aborted) throw Object.assign(new Error('היצירה בוטלה'), { cancelled: true });
    if (done() < n) throw Object.assign(errors[0] instanceof Error ? errors[0] : new Error('חלק מהפרקים לא נוצרו'), { fsPartial: `${done()} מתוך ${n} פרקים כבר מוכנים; "נסה שוב" ייצור רק את החסרים.` });
    let sections = work.sections.map(s => ({ ...s }));

    // 3. One check of everything against the sources. A failure here doesn't cost you the sheet.
    let fixed = 0, checked = true;
    try {
      say('🔎 שלב 3/4: בודק נוסחאות מול המקורות', 'בדיקה');
      const numbered = fsNumbered(sections);
      const out = await call(step(fsCheckAsk(numbered)), FS_FIXES_SCHEMA, 48000);
      ({ sections, fixed } = fsApplyFixes(sections, out));
    } catch (e) {
      if (e?.cancelled || ac.signal.aborted) throw e;
      console.warn('formula sheet: check step failed', e);
      checked = false;
    }

    // 4. Does it fit? Measured with the real layout. If not, the least important blocks are hidden
    // here, without another AI round (they stay in the sheet: 👁️ shows them again).
    let hid = 0;
    try {
      say('📏 שלב 4/4: מודד התאמה לעמודים', 'התאמה לעמודים');
      ({ sections, hid } = await fsFitLocal(sheet, sections));
    } catch (e) {
      if (e?.cancelled || ac.signal.aborted) throw e;
      console.warn('formula sheet: fit step failed', e);
    }

    if (!fsHasContent({ sections })) throw new Error('ה-AI החזיר נוסחאון ריק. נסה שוב; אם זה חוזר, צרף חומרי קורס או פרט יותר בדגשים.');
    const left = work.src.left;
    delete fsGen[id];
    if (currentView === 'formula' && !fsOpenId) setTimeout(render, 0);
    Store.put('sheet', id, { title: plan.title || sheet.title, profile: plan.profile?.length ? plan.profile : sheet.profile, sections: sections.map(s => ({ id: fsId(), ...s })), coverage: plan.coverage || [], advice: plan.advice || '', ai: { ...used, at: Date.now() } });
    toast(`✨ הנוסחאון מוכן (${fsClock(Date.now() - t0)}) · ${fsUsageText(used).split(' (')[0]}${hid ? ` · ${hid} בלוקים הוסתרו כדי להיכנס לעמודים` : ''}${checked ? (fixed ? ` · ${fixed} תיקונים בבדיקה` : ' · נבדק מול המקורות') : ' · שלב הבדיקה נכשל, כדאי לבקש "בדוק שהנוסחאות נכונות" בעזרה מ-AI'}${left.length ? ` · לא נקראו: ${left.join(', ')}` : ''}`);
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
