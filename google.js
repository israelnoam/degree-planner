// Google Calendar (read-only, shown in the timetable) and Google Tasks (two-way).
// Calendars added by link (Apple, Outlook…) come from ics.js and are merged in here.
// Nothing is shown until you connect: then the timetable mirrors the calendars you
// have switched on in Google Calendar itself, until you pick others in settings.

const TASKS_LIST_TITLE = 'התואר שלי';
const LS_CAL_CACHE = 'pp_cal_cache_v2';
const CAL_API = 'https://www.googleapis.com/calendar/v3';

// Loose text compare for Hebrew names: ignores quotes/geresh, dashes and spacing.
const norm = s => String(s || '').toLowerCase()
  .replace(/["'`״׳׳״]/g, '')
  .replace(/[\s־‐-―-]+/g, ' ').trim();

const STUDY_WORDS = /הרצא|תרגול|תרגיל|סדנ|מעבד|מבחן|בוחן|מועד|הגש|שיעור|קורס|lecture|tutorial|exam|quiz|lab|hw\b|homework/i;

function looksLikeStudy(title) {
  const t = norm(title);
  if (STUDY_WORDS.test(title)) return true;
  return courses().some(c => {
    const n = norm(c.name);
    return (n.length > 3 && t.includes(n)) || t.includes(c.code.replace(/^0+/, ''));
  });
}

// ---------- Calendar ----------
const LS_CAL_LIST = 'pp_cal_list';
const LS_CAL_PALETTE = 'pp_cal_palette';
// Only the event fields the timetable uses: smaller answers from Google.
const CAL_FIELDS = 'nextPageToken,items(id,status,summary,location,description,htmlLink,start,end,colorId)';
// All-day dates ("2026-11-24") are local days; timed ones carry their own offset.
const calMs = s => (s && s.length === 10 ? new Date(`${s}T00:00`).getTime() : Date.parse(s));

const GCal = {
  calendars: null,   // [{id, summary, color, primary}]
  calendarsFresh: false, // fetched from Google during this visit (not just the saved copy)
  palette: null,     // event colorId -> hex
  weeks: {},         // weekKey -> [events]
  categories: null,  // scan result: [{key, color, count, samples, study}]
  loading: {},
  fetchedAt: {},
  lastError: null,

  googleReady() { return Sync.connected && Sync.hasScope('calendar') && !!Sync.token(); },
  ready() { return this.googleReady() || (icsAvailable() && icsFeeds().length > 0); },

  loadCache() {
    try { this.weeks = JSON.parse(lsGet(LS_CAL_CACHE, '{}')) || {}; } catch { this.weeks = {}; }
    try { this.fetchedAt = JSON.parse(lsGet(LS_CAL_CACHE + '_at', '{}')) || {}; } catch { this.fetchedAt = {}; }
  },
  saveCache() {
    // Keep the 12 latest weeks for offline use.
    const keys = Object.keys(this.weeks).sort().slice(-12);
    lsSet(LS_CAL_CACHE, JSON.stringify(Object.fromEntries(keys.map(k => [k, this.weeks[k]]))));
    lsSet(LS_CAL_CACHE + '_at', JSON.stringify(Object.fromEntries(keys.map(k => [k, this.fetchedAt[k] || 0]))));
  },

  // The list of calendars. The saved copy answers at once (and is refreshed in the
  // background); `force` always asks Google.
  async listCalendars(force = false) {
    if (this.calendars && !force) return this.calendars;
    if (!force) {
      let saved = null;
      try { saved = JSON.parse(lsGet(LS_CAL_LIST, 'null')); } catch {}
      if (Array.isArray(saved) && saved.length) {
        this.calendars = saved;
        this.listCalendars(true).catch(() => {});
        return saved;
      }
    }
    const fields = encodeURIComponent('items(id,summary,summaryOverride,backgroundColor,primary,selected)');
    const res = await Sync.api(`${CAL_API}/users/me/calendarList?minAccessRole=reader&maxResults=250&fields=${fields}`);
    const { items = [] } = await res.json();
    this.calendars = items.map(c => ({
      id: c.id, summary: c.summaryOverride || c.summary, color: c.backgroundColor, primary: !!c.primary, selected: !!c.selected,
    }));
    this.calendarsFresh = true;
    lsSet(LS_CAL_LIST, JSON.stringify(this.calendars));
    return this.calendars;
  },

  // Google's fixed event colors: fetched once, then kept on this device.
  async loadPalette() {
    if (this.palette) return this.palette;
    try { this.palette = JSON.parse(lsGet(LS_CAL_PALETTE, 'null')); } catch {}
    if (this.palette) return this.palette;
    const res = await Sync.api(`${CAL_API}/colors`);
    const { event = {} } = await res.json();
    this.palette = Object.fromEntries(Object.entries(event).map(([id, c]) => [id, c.background]));
    lsSet(LS_CAL_PALETTE, JSON.stringify(this.palette));
    return this.palette;
  },

  // Calendars picked in settings. Until you pick: the ones switched on in Google Calendar
  // itself (or just the main one), so the timetable matches what you see there.
  async selectedIds() {
    const chosen = settings().calendarIds;
    if (Array.isArray(chosen) && chosen.length) return chosen;
    const cals = await this.listCalendars();
    const on = cals.filter(c => c.selected || c.primary).map(c => c.id);
    return on.length ? on : cals.filter(c => c.primary).map(c => c.id);
  },

  // Google Calendar events in [from, to).
  async fetchGoogle(from, to) {
    if (!this.googleReady()) return [];
    const [ids, cals, palette] = await Promise.all([this.selectedIds(), this.listCalendars(), this.loadPalette()]);
    const lists = await Promise.all(ids.map(async id => {
      const cal = cals.find(c => c.id === id);
      const out = [];
      let pageToken = '';
      do {
        const q = new URLSearchParams({
          timeMin: from.toISOString(), timeMax: to.toISOString(),
          singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', fields: CAL_FIELDS,
        });
        if (pageToken) q.set('pageToken', pageToken);
        const res = await Sync.api(`${CAL_API}/calendars/${encodeURIComponent(id)}/events?${q}`);
        const data = await res.json();
        out.push(...(data.items || []));
        pageToken = data.nextPageToken || '';
      } while (pageToken);
      return out.filter(e => e.status !== 'cancelled').map(e => ({
        id: e.id,
        title: e.summary || '(ללא כותרת)',
        location: e.location || '',
        description: e.description || '',
        link: e.htmlLink,
        allDay: !!e.start.date,
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        calendar: cal?.summary || '',
        // Category = calendar + event color (events without their own color use the calendar's).
        cat: `${id}|${e.colorId || ''}`,
        color: (e.colorId && palette[e.colorId]) || cal?.color || '#4ea1ff',
      }));
    }));
    return lists.flat();
  },

  async fetchRange(from, to, force = false) {
    const [g, ics] = await Promise.all([this.fetchGoogle(from, to), icsFetchRange(from, to, force)]);
    return [...g, ...ics];
  },

  // Looks at ~10 weeks of events and groups them by color, guessing which
  // groups are study ones. Runs once, then whenever you ask in settings.
  async scanCategories() {
    const from = new Date(); from.setDate(from.getDate() - 21);
    const to = new Date(); to.setDate(to.getDate() + 49);
    const events = await this.fetchRange(from, to);
    const groups = {};
    for (const ev of events) {
      const g = groups[ev.cat] ||= { key: ev.cat, color: ev.color, calendar: ev.calendar, count: 0, studyHits: 0, samples: [] };
      g.count++;
      if (looksLikeStudy(ev.title)) g.studyHits++;
      if (g.samples.length < 4 && !g.samples.includes(ev.title)) g.samples.push(ev.title);
    }
    this.categories = Object.values(groups)
      .map(g => ({ ...g, study: g.studyHits >= 3 || g.studyHits / g.count >= 0.4 }))
      .sort((a, b) => b.count - a.count);
    return this.categories;
  },

  // Which color categories to show. Picked in settings; until then, everything.
  shownCategories() {
    const chosen = settings().calCategories;
    return Array.isArray(chosen) ? chosen : null;
  },

  // Puts one source's events (Google, or the linked calendars) into each of the given
  // weeks, keeping the other source's events there as they are. True if anything changed.
  placeEvents(weekStarts, events, isIcs) {
    let changed = false;
    for (const w of weekStarts) {
      const key = ymd(w), a = w.getTime(), b = addDays(w, 7).getTime();
      const mine = events.filter(e => calMs(e.start) < b && calMs(e.end || e.start) > a);
      const other = (this.weeks[key] || []).filter(e => String(e.cat).startsWith('ics:') !== isIcs);
      const next = isIcs ? [...other, ...mine] : [...mine, ...other];
      if (JSON.stringify(next) === JSON.stringify(this.weeks[key])) continue;
      this.weeks[key] = next;
      changed = true;
    }
    if (changed) this.saveCache();
    return changed;
  },

  // A linked calendar finished downloading in the background: redo its part of the saved weeks.
  icsRefreshed() {
    const weeks = Object.keys(this.weeks).sort().filter(k => !this.loading[k]).map(k => new Date(`${k}T00:00`));
    if (!weeks.length) return;
    const changed = this.placeEvents(weeks, icsCachedRange(weeks[0], addDays(weeks.at(-1), 7)), true);
    if (changed && typeof currentView !== 'undefined' && currentView === 'timetable') render();
  },

  // Fetches the week (Sunday..Saturday) together with the weeks before and after it, so
  // moving between them is instant. Google's events are shown as soon as they arrive,
  // without waiting for the linked calendars. Calls onUpdate whenever something new shows.
  async fetchWeek(weekStart, onUpdate, force = false) {
    const key = ymd(weekStart);
    if (!this.ready() || this.loading[key]) return;
    // Each week is fetched once a day (or when you press refresh); otherwise the saved copy is shown.
    if (!force && this.fetchedAt[key] && ymd(new Date(this.fetchedAt[key])) === ymd(new Date())) return;
    const weeks = [addDays(weekStart, -7), weekStart, addDays(weekStart, 7)];
    const keys = weeks.map(ymd);
    for (const k of keys) this.loading[k] = true;
    const from = weeks[0], to = addDays(weekStart, 14);
    const hadError = !!this.lastError;
    const place = isIcs => events => { if (this.placeEvents(weeks, events, isIcs)) onUpdate?.(); };
    const results = await Promise.allSettled([
      this.fetchGoogle(from, to).then(place(false)),
      icsFetchRange(from, to, force).then(place(true)),
    ]);
    // Pause until the next launch even after an error; errors aren't saved, so it retries then.
    for (const k of keys) { this.fetchedAt[k] = Date.now(); this.loading[k] = false; }
    this.saveCache();
    const e = results.find(r => r.status === 'rejected')?.reason;
    if (!e) {
      this.lastError = null;
      if (hadError) onUpdate?.();
      return;
    }
    const isNew = this.lastError?.message !== e.message;
    this.lastError = e;
    if (e.auth) Sync.setState('needs-auth', 'פג תוקף החיבור');
    else if (isNew) onUpdate?.();
  },

  eventsFor(weekStart) {
    const shown = settings().calCategories;
    const all = this.weeks[ymd(weekStart)] || [];
    // Linked calendars (ics:) are switched on and off as a whole, not by color.
    return Array.isArray(shown) ? all.filter(e => e.cat.startsWith('ics:') || shown.includes(e.cat)) : all;
  },
  allEventsFor(weekStart) { return this.weeks[ymd(weekStart)] || []; },
};

// ---------- Tasks ----------
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
const COURSE_PREFIX = '📚 ';

// Guessed defaults (calendars, categories, active courses) are saved only once this
// device has synced, so a device that hasn't heard from the others yet can't
// overwrite the choices you made on them.
function saveGuess(patch) {
  if (Sync.connected && !Sync.lastSync) return;
  Store.put('meta', 'settings', patch);
}

function toGoogleTask(t, inCourseList) {
  const icon = (TASK_TYPES[t.type] || TASK_TYPES.other).icon;
  // In a course's own list the course is obvious; elsewhere note it on top.
  const courseLine = t.course && !inCourseList ? COURSE_PREFIX + courseLabel(t.course) : '';
  const notes = [courseLine, t.notes || ''].filter(Boolean).join('\n');
  const g = { title: `${icon} ${t.title}`, notes, status: t.done ? 'completed' : 'needsAction' };
  // Google Tasks keeps only the date part of a due date.
  g.due = t.due ? `${t.due.slice(0, 10)}T00:00:00.000Z` : null;
  return g;
}

function guessTaskType(title) {
  return /מבחן|מועד/.test(title) ? 'exam' : /בוחן/.test(title) ? 'quiz'
    : /הגש|גיליון|תרגיל|ש"ב|שיעורי|מטל/.test(title) ? 'hw'
    : /פרויקט|מעבדה|דוח/.test(title) ? 'project' : 'other';
}

function fromGoogleTask(g, existing = {}, listCourse = '') {
  let title = g.title || '';
  let type = existing.type || '';
  for (const [k, v] of Object.entries(TASK_TYPES)) {
    if (title.startsWith(v.icon)) { type = k; title = title.slice(v.icon.length).trim(); break; }
  }
  // Guess from the title when there's no type yet, or it was filed as "other" (an older guess may have missed it).
  if (!type || type === 'other') type = guessTaskType(title);
  let notes = g.notes || '';
  let course = listCourse || existing.course || '';
  if (notes.startsWith(COURSE_PREFIX)) {
    const [first, ...rest] = notes.split('\n');
    const name = first.slice(COURSE_PREFIX.length).trim();
    const match = courses().find(c => c.name === name);
    if (match && !listCourse) course = match.code;
    notes = rest.join('\n');
  }
  const date = g.due ? g.due.slice(0, 10) : '';
  // Keep the time we had locally if the date didn't change in Google.
  const due = !date ? '' : (existing.due && existing.due.startsWith(date) ? existing.due : date);
  return { title, type, course, notes, due, done: g.status === 'completed' };
}

// Guess which course a task list belongs to from its title (lists are often named after courses).
function courseForListTitle(title) {
  const t = norm(title);
  if (!t) return '';
  const all = courses();
  const byCode = all.find(c => t.includes(c.code.replace(/^0+/, '')));
  if (byCode) return byCode.code;
  // Prefer courses you're taking now, then the longest name that fits.
  const fits = all.filter(c => {
    const n = norm(c.name);
    return n.length > 2 && (t.includes(n) || n.includes(t));
  }).sort((a, b) => (b.status === 'active') - (a.status === 'active') || norm(b.name).length - norm(a.name).length);
  return fits[0]?.code || '';
}

const GTasks = {
  lists: null, // last fetched [{id, title}]

  ready() { return Sync.connected && Sync.hasScope('tasks') && settings().tasksSync !== false; },

  async fetchLists() {
    const res = await Sync.api(`${TASKS_API}/users/@me/lists?maxResults=100`);
    this.lists = ((await res.json()).items || []).map(l => ({ id: l.id, title: l.title }));
    return this.lists;
  },

  async ensureDefaultList(lists) {
    const st = settings();
    let list = lists.find(l => l.id === st.tasksListId) || lists.find(l => l.title === TASKS_LIST_TITLE);
    if (!list) {
      const created = await Sync.api(`${TASKS_API}/users/@me/lists`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: TASKS_LIST_TITLE }),
      });
      list = await created.json();
      lists.push({ id: list.id, title: list.title });
    }
    if (list.id !== st.tasksListId) Store.putRaw('meta', 'settings', { tasksListId: list.id, u: Store.now() });
    return list.id;
  },

  // listId -> course code for every list that syncs. Settings can override the
  // guess per list ('' = don't sync that list).
  courseMap(lists) {
    const overrides = settings().taskListMap || {};
    const map = {};
    for (const l of lists) {
      const code = l.id in overrides ? overrides[l.id] : courseForListTitle(l.title);
      if (code) map[l.id] = code;
    }
    return map;
  },

  // A course with its own task list and no grade yet is one you're studying now.
  // Done once per course, so unmarking it by hand sticks.
  markCurrentCourses(map) {
    const st = settings();
    const done = new Set(st.autoActive || []);
    const fresh = Object.values(map).filter(code => !done.has(code));
    if (!fresh.length) return;
    for (const code of fresh) {
      const c = courseByCode(code);
      if (c && c.status === 'none') Store.put('course', code, { status: 'active' });
    }
    saveGuess({ autoActive: [...done, ...fresh] });
  },

  async listAll(listId) {
    const all = [];
    let pageToken = '';
    do {
      const q = new URLSearchParams({ showCompleted: 'true', showHidden: 'true', showDeleted: 'true', maxResults: '100' });
      if (pageToken) q.set('pageToken', pageToken);
      const res = await Sync.api(`${TASKS_API}/lists/${listId}/tasks?${q}`);
      const data = await res.json();
      all.push(...(data.items || []));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return all;
  },

  async send(listId, method, gid, body) {
    const url = `${TASKS_API}/lists/${listId}/tasks${gid ? '/' + gid : ''}`;
    try {
      const res = await Sync.api(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
      });
      return method === 'DELETE' ? null : res.json();
    } catch (e) {
      if (method === 'DELETE' && (e.status === 404 || e.status === 410)) return null;
      throw e;
    }
  },

  // Each app task remembers its Google id (gid), list (glist), the app timestamp
  // at last sync (gU) and Google's `updated` at last sync (gUpd). Whichever side
  // moved since then wins; if both did, the newer edit wins.
  async sync() {
    if (!this.ready()) return false;
    const lists = await this.fetchLists();
    const defaultList = await this.ensureDefaultList(lists);
    const map = this.courseMap(lists);
    this.markCurrentCourses(map);
    const listForCourse = Object.fromEntries(Object.entries(map).map(([id, code]) => [code, id]));
    const synced = [...new Set([defaultList, ...Object.keys(map)])];
    const targetFor = r => listForCourse[r.course] || defaultList;

    // Two devices that both imported the same Google task end up with two copies.
    // Keep one (the one named after the Google id, else the lowest id) and delete the
    // rest here only: they must not carry the Google id, or the delete would reach Google.
    let changed = false;
    const copies = {};
    for (const r of Object.values(Store.recs)) if (r.kind === 'task' && !r.del && r.gid) (copies[r.gid] ||= []).push(r);
    for (const [gid, group] of Object.entries(copies)) {
      if (group.length < 2) continue;
      group.sort((a, b) => (b.id === 'g' + gid) - (a.id === 'g' + gid) || String(a.id).localeCompare(String(b.id)));
      for (const dup of group.slice(1)) Store.recs[`task:${dup.id}`] = { kind: 'task', id: dup.id, u: Store.now(), del: true };
      changed = true;
    }
    if (changed) Store.persist();

    // Tasks filed as "other" whose title now reads as a known type (e.g. "הגשה" → homework):
    // fix them here, and the push below updates their icon in Google too.
    for (const r of Object.values(Store.recs)) {
      if (r.kind !== 'task' || r.del || r.type !== 'other') continue;
      const type = guessTaskType(r.title || '');
      if (type !== 'other') { Store.put('task', r.id, { type }); changed = true; }
    }

    const byId = {};
    for (const listId of synced) {
      for (const g of await this.listAll(listId)) byId[g.id] = { g, listId };
    }
    const known = new Set();
    const stamp = (id, data) => { const now = Store.now(); Store.putRaw('task', id, { ...data, u: now, gU: now }); changed = true; };
    const create = async r => {
      const listId = targetFor(r);
      const created = await this.send(listId, 'POST', null, toGoogleTask(r, listId in map));
      known.add(created.id);
      stamp(r.id, { gid: created.id, glist: listId, gUpd: created.updated });
    };

    for (const r of Object.values(Store.recs).filter(r => r.kind === 'task')) {
      if (r.gid) known.add(r.gid);
      const glist = r.glist || defaultList; // tasks synced before lists existed lived in the default list
      const found = r.gid ? byId[r.gid] : null;

      if (r.del) {
        if (found && !found.g.deleted) { await this.send(found.listId, 'DELETE', r.gid); changed = true; }
        continue;
      }
      if (!r.gid) { await create(r); continue; }
      if (!synced.includes(glist)) {
        // Its list stopped syncing (changed in settings): give it a home in a synced list.
        await create(r);
        continue;
      }
      const appChanged = r.u > (r.gU || 0);
      if (!found || found.g.deleted) {
        // Deleted in Google. Keep it only if you edited it here since the last sync.
        if (appChanged) await create(r);
        else {
          Store.recs[`task:${r.id}`] = { kind: 'task', id: r.id, u: Store.now(), del: true, gid: r.gid };
          Store.persist(); changed = true;
        }
        continue;
      }
      const { g, listId } = found;
      const googleChanged = g.updated !== r.gUpd;
      if (appChanged && (!googleChanged || r.u >= Date.parse(g.updated))) {
        if (targetFor(r) !== listId) {
          // Course changed here: move it to the new course's list.
          await this.send(listId, 'DELETE', r.gid);
          await create(r);
        } else {
          const updated = await this.send(listId, 'PATCH', r.gid, toGoogleTask(r, listId in map));
          stamp(r.id, { glist: listId, gUpd: updated.updated });
        }
      } else if (googleChanged || r.glist !== listId) {
        stamp(r.id, { ...fromGoogleTask(g, r, map[listId] || ''), glist: listId, gUpd: g.updated });
      }
    }

    // Tasks added directly in Google Tasks (by you or by another assistant).
    for (const { g, listId } of Object.values(byId)) {
      if (known.has(g.id) || g.deleted || !(g.title || '').trim()) continue;
      stamp('g' + g.id, { ...fromGoogleTask(g, {}, map[listId] || ''), gid: g.id, glist: listId, gUpd: g.updated });
    }
    if (changed) Store.emit(true);
    return changed;
  },
};

GCal.loadCache();
// Coming back to the app after a calendar error (e.g. after enabling an API in Google Cloud): retry.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !GCal.lastError) return;
  GCal.fetchedAt = {};
  GCal.lastError = null;
  if (currentView === 'timetable' || currentView === 'settings') render();
});
Sync.hooks.push(() => GTasks.sync());
