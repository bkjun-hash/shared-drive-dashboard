const API_URL = 'https://script.google.com/macros/s/AKfycbxiJ5NJ3d7eUUhs1rMZR7QxPQZKJMvI6buZD991jmpFxxQFQFn687mwY6SNMnlB3KJa/exec?action=data';
let dashboardData = null;

document.addEventListener('DOMContentLoaded', () => {
  byId('refreshBtn').addEventListener('click', loadData);
  byId('searchInput').addEventListener('input', renderSearchResults);
  byId('ownerInput').addEventListener('input', renderSearchResults);
  byId('typeFilter').addEventListener('change', renderSearchResults);
  byId('dateFilter').addEventListener('change', renderSearchResults);
  byId('folderFilter').addEventListener('input', renderSearchResults);
  byId('changeWindowFilter').addEventListener('change', renderRecentChanges);
  loadData();
});

async function loadData() {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || 'API error');
    dashboardData = data;
    renderSummary();
    renderHome();
    renderRecentChanges();
    renderTree();
    renderSearchResults();
    renderCleanup();
  } catch (err) {
    console.error(err);
    alert('데이터를 불러오지 못했습니다. Apps Script 웹앱 URL과 배포 상태를 확인하세요.');
  }
}

function renderSummary() {
  const s = dashboardData.summary;
  byId('filesCount').textContent = num(s.files);
  byId('new7dCount').textContent = num(s.new7d);
  byId('modified7dCount').textContent = num(s.modified7d);
  byId('foldersCount').textContent = num(s.folders);
  byId('changesCount').textContent = num(s.recentChanges);
  byId('pdfsCount').textContent = num(s.pdfs);
  byId('rootName').textContent = dashboardData.meta.rootFolderName || '-';
  byId('lastSync').textContent = dashboardData.meta.lastSync
    ? `마지막 동기화: ${new Date(dashboardData.meta.lastSync).toLocaleString()}`
    : '동기화 정보 없음';
}

function renderHome() {
  const s = dashboardData.summary;
  const typeRows = [
    { label: 'Doc', value: s.docs },
    { label: 'Sheet', value: s.sheets },
    { label: 'Slide', value: s.slides },
    { label: 'PDF', value: s.pdfs }
  ];
  const total = typeRows.reduce((a, b) => a + Number(b.value || 0), 0) || 1;
  byId('typeBars').innerHTML = typeRows.map(r => {
    const pct = Math.round((Number(r.value || 0) / total) * 100);
    return `<div class="type-bar-row"><div>${esc(r.label)}</div><div class="type-bar"><div class="type-bar-fill" style="width:${pct}%"></div></div><div>${pct}%</div></div>`;
  }).join('');

  byId('folderStats').innerHTML = dashboardData.folderStats.length
    ? dashboardData.folderStats.slice(0, 20).map(row => `
      <div class="item" onclick="showFolderStat('${encodeURIComponent(row.path)}')">
        <div class="folder-stat-row">
          <div class="item-meta">${esc(row.path)}</div>
          <div><strong>${num(row.count)}</strong></div>
        </div>
      </div>
    `).join('')
    : '<div class="empty">폴더 통계가 없습니다.</div>';

  const recent = dashboardData.changes.slice(0, 20);
  byId('recentChangesHome').innerHTML = recent.length
    ? recent.map(changeItemTemplate).join('')
    : '<div class="empty">최근 변경 내역이 없습니다.</div>';
  bindItemClicks('#recentChangesHome', recent);
}

function renderRecentChanges() {
  const windowFilter = byId('changeWindowFilter').value;
  const days = windowFilter === 'today' ? 1 : (windowFilter === '30d' ? 30 : 7);
  const items = dashboardData.changes.filter(c => withinDays(c.modifiedTime, days));
  byId('changesList').innerHTML = items.length
    ? items.slice(0, 100).map(changeItemTemplate).join('')
    : '<div class="empty">해당 기간 변경 내역이 없습니다.</div>';
  bindItemClicks('#changesList', items.slice(0, 100));
}

function changeItemTemplate(change) {
  return `
    <div class="item" data-file-id="${esc(change.fileId)}">
      <div class="item-header">
        <div>
          <div class="item-title">${esc(change.name || '(이름 없음)')}</div>
          <div class="item-meta">위치: ${esc(change.path || '')}</div>
          <div class="item-meta">수정자: ${esc(change.lastModifyingUser || '-')}</div>
          <div class="item-meta">수정시각: ${fmtDate(change.modifiedTime)}</div>
        </div>
        <span class="badge ${badgeClass(change.changeType)}">${esc(change.changeType || '')}</span>
      </div>
    </div>
  `;
}

function renderTree() {
  byId('treeView').innerHTML = dashboardData.tree
    ? renderTreeNode(dashboardData.tree, true)
    : '<div class="empty">트리 데이터가 없습니다.</div>';
}

function renderTreeNode(node, isRoot = false) {
  const childFolders = (node.children || []).map(child => renderTreeNode(child)).join('');
  const childFiles = (node.files || []).slice(0, 30).map(file => `
    <div class="tree-file" onclick="selectFileById('${esc(file.id)}')">
      ${esc(file.name)} <span class="item-meta">(${esc(file.typeLabel || 'File')})</span>
    </div>
  `).join('');

  if (isRoot) {
    return `<div><div class="tree-label">${esc(node.name)}</div><div class="tree-files">${childFiles}</div>${childFolders}</div>`;
  }
  return `<div class="tree-node"><div class="tree-label">${esc(node.name)}</div><div class="tree-files">${childFiles}</div>${childFolders}</div>`;
}

function renderSearchResults() {
  const q = (byId('searchInput').value || '').trim().toLowerCase();
  const owner = (byId('ownerInput').value || '').trim().toLowerCase();
  const type = byId('typeFilter').value || '';
  const dateFilter = byId('dateFilter').value || '';
  const folderText = (byId('folderFilter').value || '').trim().toLowerCase();

  const results = dashboardData.files.filter(file => {
    const matchQ = !q || `${file.name} ${file.path}`.toLowerCase().includes(q);
    const matchOwner = !owner || `${file.owners || ''} ${file.lastModifyingUser || ''}`.toLowerCase().includes(owner);
    const matchType = !type || file.typeLabel === type;
    const matchDate = !dateFilter || withinDays(file.modifiedTime, Number(dateFilter.replace('d', '')));
    const matchFolder = !folderText || String(file.path || '').toLowerCase().includes(folderText);
    return matchQ && matchOwner && matchType && matchDate && matchFolder;
  }).slice(0, 100);

  byId('searchResults').innerHTML = results.length
    ? results.map(fileTemplate).join('')
    : '<div class="empty">검색 결과가 없습니다.</div>';
  bindItemClicks('#searchResults', results);
}

function renderCleanup() {
  const c = dashboardData.cleanup;
  renderFileList('rootLooseFiles', c.rootLooseFiles);
  renderFileList('noParentFiles', c.noParentFiles);
  renderFileList('invalidNames', c.invalidNames);
  renderFileList('staleFiles', c.staleFiles);

  byId('duplicateFiles').innerHTML = c.duplicateCandidates.length
    ? c.duplicateCandidates.slice(0, 30).map(group => `
      <div class="duplicate-group">
        <div class="duplicate-group-title">${esc(group.name)} (${group.items.length})</div>
        ${group.items.map(item => `
          <div class="item" data-file-id="${esc(item.id)}">
            <div class="item-title">${esc(item.name)}</div>
            <div class="item-meta">${esc(item.path)}</div>
          </div>
        `).join('')}
      </div>
    `).join('')
    : '<div class="empty">중복 의심 파일이 없습니다.</div>';

  bindItemClicks('#duplicateFiles', flattenDupes(c.duplicateCandidates));
}

function renderFileList(targetId, files) {
  byId(targetId).innerHTML = files.length
    ? files.slice(0, 30).map(fileTemplate).join('')
    : '<div class="empty">해당 파일이 없습니다.</div>';
  bindItemClicks(`#${targetId}`, files.slice(0, 30));
}

function fileTemplate(file) {
  return `
    <div class="item" data-file-id="${esc(file.id)}">
      <div class="item-header">
        <div>
          <div class="item-title">${esc(file.name || '(이름 없음)')}</div>
          <div class="item-meta">${esc(file.path || '')}</div>
          <div class="item-meta">수정자: ${esc(file.lastModifyingUser || '-')}</div>
          <div class="item-meta">수정일: ${fmtDate(file.modifiedTime)}</div>
        </div>
        <span class="badge">${esc(file.typeLabel || '')}</span>
      </div>
    </div>
  `;
}

function bindItemClicks(selector, files) {
  document.querySelectorAll(`${selector} [data-file-id]`).forEach(el => {
    el.addEventListener('click', () => selectFileById(el.getAttribute('data-file-id')));
  });
}

function selectFileById(id) {
  const file = dashboardData.files.find(f => String(f.id) === String(id));
  if (!file) return;
  byId('detailPanel').innerHTML = `
    <div class="detail-grid">
      <div class="detail-key">파일명</div><div class="detail-value">${esc(file.name || '')}</div>
      <div class="detail-key">링크</div><div class="detail-value">${file.webViewLink ? `<a href="${file.webViewLink}" target="_blank" rel="noopener">${esc(file.webViewLink)}</a>` : '-'}</div>
      <div class="detail-key">소유자</div><div class="detail-value">${esc(file.owners || '-')}</div>
      <div class="detail-key">수정자</div><div class="detail-value">${esc(file.lastModifyingUser || '-')}</div>
      <div class="detail-key">부모 폴더 경로</div><div class="detail-value">${esc(parentPath(file.path) || '-')}</div>
      <div class="detail-key">최근 수정일</div><div class="detail-value">${fmtDate(file.modifiedTime)}</div>
      <div class="detail-key">MIME 타입</div><div class="detail-value">${esc(file.mimeType || '-')}</div>
      <div class="detail-key">버전</div><div class="detail-value">${esc(file.version || '-')}</div>
      <div class="detail-key">설명</div><div class="detail-value">${esc(file.description || '-')}</div>
      <div class="detail-key">태그/별표</div><div class="detail-value">${file.starred === true || String(file.starred) === 'true' ? 'starred' : '-'}</div>
      <div class="detail-key">생성일</div><div class="detail-value">${fmtDate(file.createdTime)}</div>
      <div class="detail-key">파일 크기</div><div class="detail-value">${esc(file.size || '-')}</div>
      <div class="detail-key">전체 경로</div><div class="detail-value">${esc(file.path || '-')}</div>
    </div>
  `;
}

function showFolderStat(encodedPath) {
  byId('folderFilter').value = decodeURIComponent(encodedPath);
  renderSearchResults();
}

function flattenDupes(groups) {
  const out = [];
  groups.forEach(g => (g.items || []).forEach(i => out.push(i)));
  return out;
}

function parentPath(path) {
  if (!path) return '';
  return String(path).split(' / ').slice(0, -1).join(' / ');
}

function withinDays(dateValue, days) {
  if (!dateValue) return false;
  const dt = new Date(dateValue);
  return (new Date().getTime() - dt.getTime()) <= days * 24 * 60 * 60 * 1000;
}

function badgeClass(changeType) {
  if (changeType === 'REMOVED') return 'danger';
  if (changeType === 'UPDATED') return 'warn';
  return '';
}

function byId(id) { return document.getElementById(id); }
function fmtDate(v) { return v ? new Date(v).toLocaleString() : '-'; }
function num(v) { return Number(v || 0).toLocaleString(); }
function esc(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
