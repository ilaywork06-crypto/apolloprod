import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import './App.css';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';


// ─── Constants ────────────────────────────────────────────────────────────────

const LOADING_STEPS = [
  'קורא את קבצי ה-XML...',
  'מחשב תשואות נטו בניכוי דמי ניהול...',
  'משווה מול קופות באותה רמת סיכון...',
  'מכין את הדוח...',
];

const ALT_COLORS = ['#10B981', '#3B82F6', '#8B5CF6'];
const ALT_GRADIENTS = [
  'linear-gradient(90deg,#10B981,#34D399)',
  'linear-gradient(90deg,#3B82F6,#60A5FA)',
  'linear-gradient(90deg,#8B5CF6,#A78BFA)',
];

const RISK_LABELS = { low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' };
const RISK_COLORS = { low: '#10B981', medium: '#3B82F6', high: '#F59E0B' };

const COMMUNITY_RISK_COLORS = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' };
const ANIMAL_EMOJIS = {
  'נשר': '🦅', 'דולפין': '🐬', 'אריה': '🦁', 'פנתר': '🐆',
  'זאב': '🐺', 'נמר': '🐯', 'עיט': '🦅', 'ינשוף': '🦉',
  'שועל': '🦊', 'דרקון': '🐉', 'נץ': '🦅', 'פלמינגו': '🦩',
  'דוב': '🐻', 'טיגריס': '🐅', 'חתול': '🐱',
};
const FUND_PALETTE = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];
const getCommunityAvatar = name => ANIMAL_EMOJIS[name?.split(' ')[0]] || '🦁';
const MEDALS = ['🥇', '🥈', '🥉'];
const getRiskExposure = (thresholds) => ({
  low:    `0–${thresholds.low}% חשיפה למניות`,
  medium: `${thresholds.low}–${thresholds.medium}% חשיפה למניות`,
  high:   `${thresholds.medium}–100% חשיפה למניות`,
});

const DEFAULT_WEIGHTS = { w1: 10, w3: 20, w5: 25, wSharp: 45 };

const ALL_HEVROT = [
  'מיטב גמל ופנסיה בע"מ',
  'אלטשולר שחם גמל ופנסיה בע"מ',
  'הראל פנסיה וגמל בע"מ',
  'גלובלנט ניהול קופות גמל בע"מ',
  'אינפיניטי השתלמות, גמל ופנסיה בע"מ',
  'מנורה מבטחים פנסיה וגמל בע"מ',
  'מגדל מקפת קרנות פנסיה וקופות גמל בע"מ',
  'סלייס גמל בע"מ',
  'אקטיון בע"מ',
  'ילין לפידות ניהול קופות גמל בע"מ',
  'מור גמל ופנסיה בע"מ',
  'כלל פנסיה וגמל בע"מ',
  'קרן מקפת מרכז לפנסיה ותגמולים אגודה שיתופית בע"מ',
  'מבטחים מוסד לביטוח סוציאלי של העובדים בע"מ',
  'אנליסט קופות גמל בע"מ',
  'הפניקס פנסיה וגמל בע"מ',
];

const DEFAULT_BAD_HEVROT = new Set([
  'אינפיניטי השתלמות, גמל ופנסיה בע"מ',
  'גלובלנט ניהול קופות גמל בע"מ',
  'סלייס גמל בע"מ',
  'אקטיון בע"מ',
  'קרן מקפת מרכז לפנסיה ותגמולים אגודה שיתופית בע"מ',
  'מבטחים מוסד לביטוח סוציאלי של העובדים בע"מ',
]);

const WEIGHT_FIELDS = [
  { field: 'w1',     label: 'תשואה שנה' },
  { field: 'w3',     label: 'תשואה 3 שנים' },
  { field: 'w5',     label: 'תשואה 5 שנים' },
  { field: 'wSharp', label: 'Sharp Ratio' },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

const fmt = n => Math.round(n).toLocaleString('he-IL');

// ─── Kupa Aggregation ─────────────────────────────────────────────────────────

function aggregateResults(results) {
  const groups = new Map();
  for (const item of results) {
    const id = item.client?.id;
    if (!groups.has(id)) {
      groups.set(id, { ...item, client: { ...item.client } });
    } else {
      groups.get(id).client.amount = (groups.get(id).client.amount ?? 0) + (item.client.amount ?? 0);
    }
  }
  return Array.from(groups.values()).map(item => {
    const newAmount = item.client.amount ?? 0;
    const recalcAlts = (item.alternatives ?? []).map(alt => ({
      ...alt,
      potential_amount: newAmount * (1 + (alt.diff_percent ?? 0) / 100),
      diff: newAmount * (alt.diff_percent ?? 0) / 100,
    }));
    const golden = item.golden ? {
      ...item.golden,
      potential_amount: newAmount * (1 + (item.golden.diff_percent ?? 0) / 100),
      diff: newAmount * (item.golden.diff_percent ?? 0) / 100,
    } : item.golden;
    return { ...item, alternatives: recalcAlts, golden };
  });
}

const fmtDec = (n, d = 1) => n != null ? (+n).toFixed(d) : '—';
const shortName = name => name?.split(' ').slice(0, 3).join(' ') || name;

const formatDate = (dateStr) => {
  if (!dateStr || dateStr.length < 8) return dateStr;
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${day}/${month}/${year}`;
};

// ─── Stars Background ─────────────────────────────────────────────────────────

function Stars() {
  const stars = useMemo(() => Array.from({ length: 180 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 1.8 + 0.4,
    opacity: Math.random() * 0.6 + 0.2,
    duration: Math.random() * 4 + 2,
    delay: Math.random() * 4,
  })), []);

  return (
    <div className="stars-bg" aria-hidden="true">
      {stars.map(s => (
        <div
          key={s.id}
          className="star"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            opacity: s.opacity,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Gauge SVG ────────────────────────────────────────────────────────────────

function GaugeChart({ percentile, rank, total }) {
  const pct = percentile ?? 0;
  const percentage = pct / 100;
  const angle = percentage * Math.PI;
  const radius = 52;
  const cx = 65;
  const cy = 65;

  const startX = cx - radius;
  const startY = cy;
  const endX = cx + radius * Math.cos(Math.PI - angle);
  const endY = cy - radius * Math.sin(Math.PI - angle);
  const largeArc = angle > Math.PI ? 1 : 0;

  const color = pct >= 60 ? '#10B981' : pct >= 30 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{ textAlign: 'center', width: '140px' }}>
      <svg width="130" height="75" viewBox="0 0 130 75">
        {/* Gray track */}
        <path
          d="M 13 65 A 52 52 0 0 1 117 65"
          fill="none"
          stroke="#1E293B"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Colored fill */}
        {pct > 0 && (
          <path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
          />
        )}
        {/* Percentile number */}
        <text x="65" y="50" textAnchor="middle" fill="#F8FAFC" fontSize="26" fontWeight="700" fontFamily="Rubik, sans-serif">
          {pct}
        </text>
        <text x="65" y="67" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="Rubik, sans-serif">
          {`אחוזון ${pct}`}
        </text>
      </svg>
      {rank != null && total != null && (
        <div style={{ fontSize: '12px', fontWeight: '600', color: color, marginTop: '2px' }}>
          {`מקום ${rank} מתוך ${total}`}
        </div>
      )}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({ onReset }) {
  return (
    <header className="app-header">
      <div className="header-inner">
        {onReset ? (
          <button className="btn-back" onClick={onReset}>← ניתוח חדש</button>
        ) : (
          <div />
        )}
        <div className="header-brand">
          <div className="header-logo">
            <svg width="34" height="42" viewBox="-3 -3 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="hg" x1="15" y1="0" x2="15" y2="38" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#A78BFA"/>
                  <stop offset="100%" stopColor="#3B82F6"/>
                </linearGradient>
              </defs>
              {/* Left leg */}
              <line x1="15" y1="2" x2="1" y2="34" stroke="url(#hg)" strokeWidth="4" strokeLinecap="round"/>
              {/* Right leg */}
              <line x1="15" y1="2" x2="29" y2="34" stroke="url(#hg)" strokeWidth="4" strokeLinecap="round"/>
              {/* Crossbar */}
              <line x1="7" y1="21" x2="23" y2="21" stroke="url(#hg)" strokeWidth="3.5" strokeLinecap="round"/>
              {/* Peak accent dot */}
              <circle cx="15" cy="2" r="4" fill="#A78BFA"/>
            </svg>
          </div>
          <div className="header-text">
            <span className="header-title">
              <span className="header-title-amo">Amo</span><span className="header-title-sight">Sight</span>
            </span>
            <span className="header-subtitle">ניתוח והשוואת קופות גמל</span>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Weights Form ─────────────────────────────────────────────────────────────

function WeightsForm({ weights, onChange }) {
  const fields = WEIGHT_FIELDS.map(f => f.field);
  const sum = fields.reduce((s, f) => s + weights[f], 0);
  const isValid = sum === 100;

  const handleStep = (idx, delta) => {
    const next = { ...weights };
    const target = fields[idx];
    const newVal = next[target] + delta;
    if (newVal < 0 || newVal > 100) return;

    let remaining = delta;
    let cursor = (idx + 1) % fields.length;
    const visited = new Set([idx]);

    while (remaining !== 0 && !visited.has(cursor)) {
      visited.add(cursor);
      const cur = next[fields[cursor]];
      if (remaining > 0) {
        const take = Math.min(remaining, cur);
        next[fields[cursor]] -= take;
        remaining -= take;
      } else {
        const give = Math.min(-remaining, 100 - cur);
        next[fields[cursor]] += give;
        remaining += give;
      }
      if (remaining !== 0) cursor = (cursor + 1) % fields.length;
    }

    if (remaining === 0) {
      next[target] = newVal;
      onChange(next);
    }
  };

  return (
    <div className="weights-form">
      <div className="weights-form-title">הגדרת משקלות לחישוב AmoScore</div>
      <div className="weights-grid">
        {WEIGHT_FIELDS.map(({ field, label }, idx) => (
          <div key={field} className="weight-field">
            <label className="weight-label">{label}</label>
            <div className="weight-stepper">
              <button className="weight-btn" onClick={() => handleStep(idx, -5)}>−</button>
              <span className="weight-val">{weights[field]}%</span>
              <button className="weight-btn" onClick={() => handleStep(idx, +5)}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div className={`weights-sum${isValid ? ' weights-sum--valid' : ' weights-sum--invalid'}`}>
        סכום: <strong>{sum}</strong>/100
        {isValid ? ' ✓' : ` — נדרש בדיוק 100 (${sum < 100 ? `חסרים ${100 - sum}` : `עודף ${sum - 100}`})`}
      </div>
    </div>
  );
}

// ─── Multi Upload Zone ────────────────────────────────────────────────────────

// ─── XML Tree Viewer ──────────────────────────────────────────────────────────

function TreeNode({ node, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);

  const childElements = Array.from(node.children || []);
  const hasChildren = childElements.length > 0;
  const textValue = (!hasChildren && node.textContent) ? node.textContent.trim() : null;
  const childCount = hasChildren ? childElements.length : 0;

  return (
    <div>
      <div
        className="tree-row"
        style={{ paddingRight: `${depth * 20 + 12}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          <span className="tree-arrow">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="tree-dot">●</span>
        )}
        <span className="tree-tag">{node.tagName}</span>
        {hasChildren && <span className="tree-count">({childCount})</span>}
        {textValue && <span className="tree-value">{textValue}</span>}
      </div>
      {expanded && hasChildren && (
        <div>
          {childElements.map((child, i) => (
            <TreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Upload Zone ───────────────────────────────────────────────────────────────

function MultiUploadZone({ files, onFiles, onRemoveFile, onViewFile }) {
  const inputRef = useRef();

  const handleChange = (e) => {
    const newFiles = Array.from(e.target.files);
    const valid = newFiles.filter(f => /\.(xml|dat)$/i.test(f.name));
    const invalid = newFiles.filter(f => !/\.(xml|dat)$/i.test(f.name));
    if (invalid.length > 0) {
      alert(
        `הקבצים הבאים אינם נתמכים:\n${invalid.map(f => f.name).join('\n')}\n\nניתן להעלות קבצי XML ו-DAT בלבד.`
      );
    }
    if (valid.length > 0) {
      onFiles([...files, ...valid]);
    }
    e.target.value = '';
  };

  const hasFiles = files.length > 0;

  return (
    <div className="multi-upload-wrap">
      <div
        className={`upload-zone${hasFiles ? ' upload-zone--done' : ''}`}
        onClick={() => inputRef.current.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xml,.dat"
          multiple
          style={{ display: 'none' }}
          onChange={handleChange}
        />
        <div className={`upload-file-icon${hasFiles ? ' done' : ''}`}>
          {hasFiles ? '✓' : '📄'}
        </div>
        <div className="upload-label">קבצי מסלקה פנסיונית</div>
        <div className="upload-sub">
          {hasFiles
            ? files.length === 1 ? '1 קובץ נטען' : `${files.length} קבצים נטענו`
            : 'לחץ לבחירת קבצי XML או DAT (ניתן לבחור מספר קבצים)'}
        </div>
      </div>
      {hasFiles && (
        <div className="file-list">
          {files.map((f, i) => (
            <div key={i} className="file-list-item">
              <span className="file-list-name">📄 {f.name}</span>
              <div className="file-list-actions">
                {/\.(xml|dat)$/i.test(f.name) && (
                  <button
                    className="view-file-btn"
                    onClick={(e) => { e.stopPropagation(); onViewFile(f); }}
                  >
                    👁 הצג קובץ
                  </button>
                )}
                <button
                  className="file-list-remove"
                  onClick={(e) => { e.stopPropagation(); onRemoveFile(i); }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Risk Band Editor ─────────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS = { low: 25, medium: 75 };

function RiskBandEditor({ low, medium, onChange }) {
  const isDefault = low === DEFAULT_THRESHOLDS.low && medium === DEFAULT_THRESHOLDS.medium;

  const setLow = (val) => {
    const v = Math.max(0, Math.min(val, medium - 5));
    onChange({ low: v, medium });
  };

  const setMedium = (val) => {
    const v = Math.max(low + 5, Math.min(val, 100));
    onChange({ low, medium: v });
  };

  const lowW  = low;
  const medW  = medium - low;
  const highW = 100 - medium;

  return (
    <div className="risk-band-editor">

      {/* ── Visual bar ── */}
      <div className="risk-band-bar-wrap" dir="ltr">
        <div className="risk-band-bar">
          <div className="risk-band-seg risk-band-seg--low"    style={{ width: `${lowW}%`  }}>
            {lowW  >= 12 && <span className="risk-band-seg-label">נמוך</span>}
          </div>
          <div className="risk-band-seg risk-band-seg--medium" style={{ width: `${medW}%`  }}>
            {medW  >= 12 && <span className="risk-band-seg-label">בינוני</span>}
          </div>
          <div className="risk-band-seg risk-band-seg--high"   style={{ width: `${highW}%` }}>
            {highW >= 12 && <span className="risk-band-seg-label">גבוה</span>}
          </div>
        </div>

        {/* Threshold markers */}
        <div className="risk-band-marker" style={{ left: `${low}%` }}>
          <div className="risk-band-marker-line" />
          <div className="risk-band-marker-label">{low}%</div>
        </div>
        <div className="risk-band-marker" style={{ left: `${medium}%` }}>
          <div className="risk-band-marker-line" />
          <div className="risk-band-marker-label">{medium}%</div>
        </div>
      </div>

      {/* ── Zone legend ── */}
      <div className="risk-band-legend">
        <div className="risk-band-legend-item">
          <span className="risk-band-dot risk-band-dot--low" />
          <span className="risk-band-legend-text">
            <strong>נמוך</strong> — 0%–{low}% חשיפה
          </span>
        </div>
        <div className="risk-band-legend-item">
          <span className="risk-band-dot risk-band-dot--medium" />
          <span className="risk-band-legend-text">
            <strong>בינוני</strong> — {low}%–{medium}% חשיפה
          </span>
        </div>
        <div className="risk-band-legend-item">
          <span className="risk-band-dot risk-band-dot--high" />
          <span className="risk-band-legend-text">
            <strong>גבוה</strong> — {medium}%–100% חשיפה
          </span>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="risk-band-controls">
        <div className="risk-band-control">
          <div className="risk-band-control-title">
            <span className="risk-band-dot risk-band-dot--low" />
            גבול נמוך ↔ בינוני
          </div>
          <div className="weight-stepper">
            <button className="weight-btn" onClick={() => setLow(low - 5)} disabled={low <= 0}>−</button>
            <span className="weight-val">{low}%</span>
            <button className="weight-btn" onClick={() => setLow(low + 5)} disabled={low >= medium - 5}>+</button>
          </div>
          <div className="risk-band-control-hint">חשיפה מנייתית מתחת ל-{low}% = סיכון נמוך</div>
        </div>

        <div className="risk-band-divider" />

        <div className="risk-band-control">
          <div className="risk-band-control-title">
            <span className="risk-band-dot risk-band-dot--high" />
            גבול בינוני ↔ גבוה
          </div>
          <div className="weight-stepper">
            <button className="weight-btn" onClick={() => setMedium(medium - 5)} disabled={medium <= low + 5}>−</button>
            <span className="weight-val">{medium}%</span>
            <button className="weight-btn" onClick={() => setMedium(medium + 5)} disabled={medium >= 100}>+</button>
          </div>
          <div className="risk-band-control-hint">חשיפה מנייתית מעל {medium}% = סיכון גבוה</div>
        </div>
      </div>

      {!isDefault && (
        <button
          className="quick-action-btn quick-action-btn--reset"
          style={{ marginTop: '14px' }}
          onClick={() => onChange(DEFAULT_THRESHOLDS)}
        >
          ↺ איפוס לברירת מחדל (25% / 75%)
        </button>
      )}
    </div>
  );
}

// ─── Hevrot Checklist ─────────────────────────────────────────────────────────

function HevrotChecklist({ badHevrot, onChange }) {
  const allChecked = ALL_HEVROT.every(h => !badHevrot.has(h));
  const noneChecked = ALL_HEVROT.every(h => badHevrot.has(h));

  const toggle = (h) => {
    const next = new Set(badHevrot);
    if (next.has(h)) next.delete(h);
    else next.add(h);
    onChange(next);
  };

  const toggleAll = () => {
    if (allChecked) onChange(new Set(ALL_HEVROT));
    else onChange(new Set());
  };

  return (
    <div className="hevrot-checklist">
      <div className="hevrot-toggle-all">
        <label className="hevrot-item">
          <input
            type="checkbox"
            checked={allChecked}
            ref={el => { if (el) el.indeterminate = !allChecked && !noneChecked; }}
            onChange={toggleAll}
          />
          <span className="hevrot-name hevrot-name--all">בחר / בטל הכל</span>
        </label>
      </div>
      <div className="hevrot-grid">
        {ALL_HEVROT.map(h => (
          <label key={h} className="hevrot-item">
            <input
              type="checkbox"
              checked={!badHevrot.has(h)}
              onChange={() => toggle(h)}
            />
            <span className="hevrot-name">{h}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Upload Screen ────────────────────────────────────────────────────────────

function UploadScreen({ mislakaFiles, onMislakaFiles, onRemoveMislakaFile, onViewFile, weights, onWeightsChange, thresholds, onThresholdsChange, sumSameKupa, onSumSameKupaChange, badHevrot, onBadHevrotChange, onAnalyze }) {
  const sum = weights.w1 + weights.w3 + weights.w5 + weights.wSharp;
  const ready = mislakaFiles.length > 0 && sum === 100;
  const hasFiles = mislakaFiles.length > 0;
  const isDefaultWeights = weights.w1 === DEFAULT_WEIGHTS.w1 && weights.w3 === DEFAULT_WEIGHTS.w3 && weights.w5 === DEFAULT_WEIGHTS.w5 && weights.wSharp === DEFAULT_WEIGHTS.wSharp;
  const [hevrotOpen, setHevrotOpen] = useState(false);

  return (
    <div className="screen screen--upload">
      <Stars />
      <Header />
      <div className="upload-content">

        {/* ── Hero ── */}
        <div className="hero">
          <div className="hero-badge">✦ AmoSight · ניתוח קופות גמל חכם</div>
          <h1 className="hero-title">בדוק את הביצועים<br/>של הקופה שלך</h1>
          <p className="hero-sub">
            העלה קבצי XML מהמסלקה הפנסיונית וגלה תוך שניות<br/>היכן הקופות שלך עומדת מול שוק הגמל
          </p>
        </div>

        {/* ── Feature strip ── */}
        <div className="feature-strip">
          <div className="feature-item">
            <div className="feature-icon" style={{background:'rgba(59,130,246,0.15)',border:'1px solid rgba(59,130,246,0.3)'}}>📊</div>
            <div className="feature-text">
              <div className="feature-title">השוואה מול השוק</div>
              <div className="feature-desc">דירוג מול כל הקופות ברמת הסיכון שלך</div>
            </div>
          </div>
          <div className="feature-divider" />
          <div className="feature-item">
            <div className="feature-icon" style={{background:'rgba(16,185,129,0.15)',border:'1px solid rgba(16,185,129,0.3)'}}>🏆</div>
            <div className="feature-text">
              <div className="feature-title">3 החלופות הטובות</div>
              <div className="feature-desc">קופות עם AmoScore גבוה יותר</div>
            </div>
          </div>
          <div className="feature-divider" />
          <div className="feature-item">
            <div className="feature-icon" style={{background:'rgba(251,191,36,0.15)',border:'1px solid rgba(251,191,36,0.3)'}}>💎</div>
            <div className="feature-text">
              <div className="feature-title">מה החמצת?</div>
              <div className="feature-desc">הפוטנציאל שאבדת ואיך לשחזר אותו</div>
            </div>
          </div>
        </div>

        {/* ── Step 1: Upload ── */}
        <div className="upload-step-card">
          <div className="step-card-header">
            <div className="step-card-num">01</div>
            <div className="step-card-label">העלאת קבצי מסלקה</div>
            {hasFiles && (
              <button className="quick-action-btn quick-action-btn--clear" onClick={() => onMislakaFiles([])}>
                🗑 נקה הכל
              </button>
            )}
          </div>
          <div className="upload-row">
            <MultiUploadZone
              files={mislakaFiles}
              onFiles={onMislakaFiles}
              onRemoveFile={onRemoveMislakaFile}
              onViewFile={onViewFile}
            />
          </div>
        </div>

        {/* ── Step 2: Weights ── */}
        <div className="upload-step-card">
          <div className="step-card-header">
            <div className="step-card-num">02</div>
            <div className="step-card-label">כיוון משקלות AmoScore</div>
            {!isDefaultWeights && (
              <button className="quick-action-btn quick-action-btn--reset" onClick={() => onWeightsChange(DEFAULT_WEIGHTS)}>
                ↺ איפוס
              </button>
            )}
          </div>
          <WeightsForm weights={weights} onChange={onWeightsChange} />
        </div>

        {/* ── Step 3: Risk Thresholds ── */}
        <div className="upload-step-card">
          <div className="step-card-header">
            <div className="step-card-num">03</div>
            <div className="step-card-label">הגדרת סף רמות סיכון</div>
          </div>
          <RiskBandEditor
            low={thresholds.low}
            medium={thresholds.medium}
            onChange={onThresholdsChange}
          />
        </div>

        {/* ── Step 4: Aggregate ── */}
        <div className="upload-step-card">
          <div className="step-card-header">
            <div className="step-card-num">04</div>
            <div className="step-card-label">איחוד קופות זהות</div>
          </div>
          <div className="aggregate-toggle-row">
            <div className="aggregate-toggle-info">
              <div className="aggregate-toggle-title">סכום מופעים של אותה קופה</div>
              <div className="aggregate-toggle-desc">
                {sumSameKupa
                  ? 'מופעים מרובים של אותה קופה (לפי מספר קופה) יאוחדו וסכום הצבירות יסוכם'
                  : 'כל מופע של קופה יוצג בנפרד, גם אם מספר הקופה זהה'}
              </div>
            </div>
            <label className="kupa-toggle">
              <input
                type="checkbox"
                checked={sumSameKupa}
                onChange={e => onSumSameKupaChange(e.target.checked)}
              />
              <span className="kupa-toggle-slider" />
            </label>
          </div>
        </div>

        {/* ── Step 5: Hevrot ── */}
        <div className="upload-step-card">
          <div className="step-card-header" style={{ cursor: 'pointer' }} onClick={() => setHevrotOpen(o => !o)}>
            <div className="step-card-num">05</div>
            <div className="step-card-label">בחירת חברות מנהלות</div>
            <span style={{ marginRight: 'auto', marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted, #888)' }}>
              {hevrotOpen ? '▲ סגור' : '▼ פתח'}
            </span>
            {hevrotOpen && (
              <button className="quick-action-btn quick-action-btn--reset" onClick={e => { e.stopPropagation(); onBadHevrotChange(new Set(DEFAULT_BAD_HEVROT)); }}>
                ↺ איפוס
              </button>
            )}
          </div>
          {hevrotOpen && <HevrotChecklist badHevrot={badHevrot} onChange={onBadHevrotChange} />}
        </div>

        {/* ── Analyze ── */}
        <div className="analyze-wrap">
          <button
            className={`btn-analyze${ready ? ' btn-analyze--active' : ''}`}
            disabled={!ready}
            onClick={onAnalyze}
          >
            🔍 הפעל ניתוח
          </button>
          <div className="analyze-status">
            {!hasFiles && <span className="analyze-status-item">· העלה לפחות קובץ אחד</span>}
            {hasFiles && sum !== 100 && <span className="analyze-status-item">· המשקלות צריכים להסתכם ל-100% (כרגע {sum}%)</span>}
            {ready && <span className="analyze-status-item analyze-status-ready">· מוכן לניתוח</span>}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────

function LoadingScreen({ step, progress }) {
  return (
    <div className="screen screen--loading">
      <Stars />
      <Header />
      <div className="loading-content">
        <div className="loading-emoji">📊</div>
        <h2 className="loading-title">מנתח את הנתונים...</h2>
        <p className="loading-sub">{LOADING_STEPS[Math.min(step, LOADING_STEPS.length - 1)]}</p>
        <div className="progress-wrap">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-pct">{progress}%</div>
      </div>
    </div>
  );
}

// ─── Fund Results Section ─────────────────────────────────────────────────────

function FundResults({ data, weights, thresholds }) {
  const { client, alternatives, golden: gold } = data;
  const isNew = client.grade === 0;

  const pct = client.percentile ?? 0;
  const isBelow = !isNew && pct < 50;

  // Bar chart: proportional to actual tsua_1 values
  const clientTsua1 = client.tsua_1 ?? 0;
  const allTsua = [client.tsua_1, ...alternatives.map(a => a.tsua_1)].filter(v => v > 0);
  const maxTsua = Math.max(...allTsua, 0.1);

  // Best alternative for high-risk section
  const bestAlt = alternatives[0];
  const diffPct = bestAlt?.diff_percent ?? 0;

  // Risk display
  const riskLabel = RISK_LABELS[client.risk_level] ?? client.risk_level ?? '—';
  const riskColor = RISK_COLORS[client.risk_level] ?? '#94A3B8';
  const riskExposure = getRiskExposure(thresholds ?? DEFAULT_THRESHOLDS);

  // Merge client + alternatives, sort by AmoScore descending
  const clientEntry = {
    ...client,
    isClient: true,
    potential_amount: client.amount,
    diff: null,
    diff_percent: null,
  };
  const sortedFunds = [
    ...alternatives.map(a => ({ ...a, isClient: false })),
    clientEntry,
  ].sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0));

  // Assign colors: client green if rank 1-3, otherwise red; alts get ALT_COLORS in order
  const clientIsTop = client.rank != null && client.rank <= 3;
  let altColorIdx = 0;
  const fundColors = sortedFunds.map(f => {
    if (f.isClient) return clientIsTop ? '#10B981' : '#EF4444';
    const color = ALT_COLORS[altColorIdx % ALT_COLORS.length];
    altColorIdx++;
    return color;
  });

  const topRankColors = ['#F59E0B', '#94A3B8', '#C084FC'];
  const topRankBg = ['rgba(245,158,11,0.15)', 'rgba(148,163,184,0.15)', 'rgba(192,132,252,0.15)'];

  return (
    <div className="fund-results fade-in fund-section">

      {/* 1 ─ Client Header Card */}
      <div className="client-card">
        <div className="client-card-accent" style={{ background: riskColor }} />
        <div className="client-card-info">
          <div className="client-card-pills">
            <span
              className="risk-pill"
              style={{ background: `${riskColor}22`, color: riskColor, borderColor: `${riskColor}55` }}
              title={riskExposure[client.risk_level]}
            >
              ● רמת סיכון {riskLabel}
              {client.risk_level && (
                <span style={{ fontSize: '10px', opacity: 0.8, marginRight: '6px', fontWeight: 400 }}>
                  ({riskExposure[client.risk_level]})
                </span>
              )}
            </span>
            {!isNew && client.rank != null && (
              <span className={`rank-pill ${clientIsTop ? 'rank-pill--good' : 'rank-pill--bad'}`}>
                מקום {client.rank} מתוך {client.total_in_risk}
              </span>
            )}
          </div>
          <div className="client-fund-name">{client.name}</div>
          <div className="client-fund-meta">
            קופה #{client.id}
            {client.hevra && <> · {client.hevra}</>}
            {client.seniority_date && <> · ותק מ-{formatDate(client.seniority_date)}</>}
          </div>
          <div className="client-stats-inline">
            <div className="client-stat-item">
              <div className="client-stat-label">צבירה</div>
              <div className="client-stat-val">₪{fmt(client.amount)}</div>
            </div>
            <div className="client-stat-sep" />
            <div className="client-stat-item">
              <div className="client-stat-label">תשואה שנה</div>
              <div className="client-stat-val client-stat-val--amber">
                {client.tsua_1 ? `${fmtDec(client.tsua_1)}%` : 'N/A'}
              </div>
            </div>
            <div className="client-stat-sep" />
            <div className="client-stat-item">
              <div className="client-stat-label">תשואה 3 שנים</div>
              <div className="client-stat-val">
                {isNew || !client.tsua_3 ? 'N/A' : `${fmtDec(client.tsua_3)}%`}
              </div>
            </div>
            <div className="client-stat-sep" />
            <div className="client-stat-item">
              <div className="client-stat-label">דמי ניהול</div>
              <div className="client-stat-val">
                {client.dmei_nihul != null ? `${fmtDec(client.dmei_nihul, 2)}%` : '—'}
              </div>
            </div>
          </div>
        </div>
        <div className="client-score-wrap">
          <div className="gauge-amoscore-label">AmoScore</div>
          <div className="gauge-amoscore-value" style={{ color: isNew ? '#64748B' : '#F8FAFC' }}>
            {isNew || !client.grade ? '–' : fmtDec(client.grade)}
          </div>
          <GaugeChart percentile={pct} rank={client.rank} total={client.total_in_risk} />
          <div className={`client-verdict ${isNew ? 'verdict--new' : isBelow ? 'verdict--bad' : 'verdict--good'}`}>
            {isNew ? 'קופה חדשה — מעט נתונים' : isBelow ? '⚠ מתחת לממוצע' : '✓ מעל הממוצע'}
          </div>
        </div>
      </div>

      {/* 2 ─ Bar Chart */}
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <div className="chart-title">תשואה שנתית — השוואה לשוק</div>
            <div className="chart-sub">{client.total_in_risk ?? '–'} קופות ברמת סיכון {riskLabel}</div>
          </div>
        </div>
        <div className="chart-bars">
          <div className="bar-row bar-row--client">
            <div className="bar-label bar-label--client">
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'rtl' }}>
                {client.rank != null && (
                  <span style={{ fontWeight: 700, fontSize: '12px', color: clientIsTop ? '#F59E0B' : '#6B7280' }}>#{client.rank}</span>
                )}
                <span>{shortName(client.name)}</span>
              </div>
              <span className="bar-client-tag">הקופה שלך</span>
            </div>
            <div className="bar-track bar-track--client">
              <div
                className={`bar-fill ${clientIsTop ? 'bar-fill--client' : 'bar-fill--red'}`}
                style={{ width: clientTsua1 > 0 ? `${(clientTsua1 / maxTsua) * 100}%` : '5%' }}
              >
                <span className="bar-pct">{clientTsua1 > 0 ? `${fmtDec(clientTsua1)}%` : '—'}</span>
              </div>
            </div>
          </div>
          {alternatives.map((alt, i) => {
            const tsua = alt.tsua_1 ?? 0;
            const altRank = sortedFunds.findIndex(f => f.id === alt.id) + 1;
            const rankColorIdx = altRank - 1;
            return (
              <div key={alt.id} className="bar-row">
                <div className="bar-label">
                  <span style={{ marginLeft: '4px', display: 'inline-block', minWidth: '22px', textAlign: 'center', fontWeight: 700, fontSize: '12px', color: topRankColors[rankColorIdx] ?? '#6B7280' }}>#{altRank}</span>
                  {shortName(alt.name)}
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${Math.max((tsua / maxTsua) * 100, 2)}%`, background: ALT_GRADIENTS[i] || ALT_COLORS[i] }}
                  >
                    <span className="bar-pct">{fmtDec(tsua)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3 ─ Leaderboard Table */}
      <div className="table-card">
        <div className="table-header-row">
          <div>
            <div className="table-title">טבלת דירוג — AmoScore</div>
            <div className="table-title-sub">ממוינות לפי ציון מנורמל, כולל ניכוי דמי ניהול</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="alts-table">
            <thead>
              <tr>
                <th>#</th>
                <th>שם הקופה</th>
                <th>תשואה שנתית</th>
                <th>AmoScore</th>
                <th>פוטנציאל *</th>
                <th>הפרש</th>
              </tr>
            </thead>
            <tbody>
              {sortedFunds.map((fund, idx) => {
                const color = fundColors[idx];
                const diffNeg = fund.diff != null && fund.diff < 0;
                const isTopThree = !fund.isClient && idx < 3;
                return (
                  <tr key={fund.id} className={fund.isClient ? (clientIsTop ? 'row-client' : 'row-client row-client--bad') : 'row-alt'}>
                    <td>
                      <span className="rank-badge" style={{
                        background: isTopThree ? topRankBg[idx] : `${color}33`,
                        color: isTopThree ? topRankColors[idx] : color,
                        fontWeight: isTopThree ? 700 : 600,
                      }}>
                        {fund.isClient ? (fund.rank ?? '–') : idx + 1}
                      </span>
                    </td>
                    <td className="td-name">
                      <div>{fund.name}</div>
                      {fund.hevra && <div className="td-name-sub">{fund.hevra}</div>}
                      <div className="td-name-sub">קופה #{fund.id}</div>
                      {fund.isClient && (
                        <div className={`td-name-tag ${clientIsTop ? 'td-name-tag--client' : 'td-name-tag--client-bad'}`}>הקופה שלך</div>
                      )}
                    </td>
                    <td className="td-return" style={{ color }}>{fund.tsua_1 != null ? `${fmtDec(fund.tsua_1)}%` : 'N/A'}</td>
                    <td className="td-score">{fund.grade ? fmtDec(fund.grade) : '–'}</td>
                    <td className="td-potential">{fund.potential_amount != null ? `₪${fmt(fund.potential_amount)}` : '—'}</td>
                    <td className="td-diff">
                      {fund.diff != null ? (
                        <div>
                          <span className="diff-badge" style={{ background: diffNeg ? 'rgba(239,68,68,0.15)' : undefined, color: diffNeg ? '#EF4444' : undefined }}>
                            {diffNeg ? '' : '+'}₪{fmt(Math.abs(fund.diff))}
                          </span>
                          {fund.diff_percent != null && (
                            <div className="diff-pct" style={{ color: diffNeg ? '#EF4444' : '#10B981' }}>
                              {diffNeg ? '' : '+'}{fmtDec(fund.diff_percent)}%
                            </div>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-footnote">* לא נוכו דמי ניהול חיצוניים מהחישוב · רמת הסיכון נקבעת לפי חשיפה למניות בחודש האחרון</div>
      </div>

      {/* 6 ─ High-risk option box + Gold card */}
      <div className="bottom-cards-row">
        {bestAlt && client.rank !== 1 && (bestAlt.potential_amount > client.amount) && (
          <div className="highrisk-card">
            <div className="highrisk-icon">⚡</div>
            <div className="highrisk-body">
              <div className="highrisk-title">מה החמצת?</div>
              <div className="highrisk-desc">
                עם המעבר לקופה המובילה לפני שנה, יכולת הצבירה שלך הייתה גדלה ב-
                <strong className="highrisk-pct"> {fmtDec(diffPct)}%</strong>
              </div>
              <div className="highrisk-amounts">
                <div className="highrisk-amount-item">
                  <div className="highrisk-amount-label">היום</div>
                  <div className="highrisk-amount-val">₪{fmt(client.amount)}</div>
                  {client.tsua_1 ? (
                    <div className="highrisk-amount-sub">{fmtDec(client.tsua_1)}% תשואה</div>
                  ) : null}
                </div>
                <div className="highrisk-arrow">←</div>
                <div className="highrisk-amount-item">
                  <div className="highrisk-amount-label">פוטנציאל</div>
                  <div className="highrisk-amount-val highrisk-amount-val--green">
                    {bestAlt.potential_amount != null ? `₪${fmt(bestAlt.potential_amount)}` : '—'}
                  </div>
                  {bestAlt.tsua_1 ? (
                    <div className="highrisk-amount-sub">{fmtDec(bestAlt.tsua_1)}% תשואה</div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        {gold && gold.potential_amount != null && gold.potential_amount > client.amount && (
          <div className="gold-card">
            <div className="gold-icon">🏆</div>
            <div className="gold-body">
              <div className="gold-title">תפוח הזהב</div>
              <div className="gold-subtitle">מקום #1 ברמת סיכון גבוה</div>
              <div className="gold-desc">
                אם היית עובר לקופה המובילה בסיכון הגבוה ביותר, הצבירה שלך הייתה גדלה ב-
                <strong> {fmtDec(gold.diff_percent)}%</strong>
              </div>
              <div className="gold-amounts">
                <div className="gold-amount-item">
                  <div className="gold-amount-label">היום</div>
                  <div className="gold-amount-val">₪{fmt(client.amount)}</div>
                </div>
                <div className="gold-arrow">←</div>
                <div className="gold-amount-item">
                  <div className="gold-amount-label">פוטנציאל</div>
                  <div className="gold-amount-val gold-amount-val--gold">₪{fmt(gold.potential_amount)}</div>
                  {gold.tsua_1 && <div className="gold-amount-sub">{fmtDec(gold.tsua_1)}% תשואה</div>}
                </div>
              </div>
              {gold.name && <div className="gold-fund-name">קופה: {gold.name}{gold.id && <span className="gold-fund-id"> · #{gold.id}</span>}</div>}
            </div>
          </div>
        )}
      </div>

      {/* 7 ─ Disclaimer */}
      <div className="disclaimer">
        הנתונים מבוססים על מידע מהמסלקה הפנסיונית ומגמל נט של רשות שוק ההון · אין לראות בכך ייעוץ השקעות
      </div>
    </div>
  );
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

// Colors matching the app
const PDF_BLUE   = '#3B82F6';
const PDF_PURPLE = '#8B5CF6';
const PDF_DARK   = '#0F172A';
const PDF_TEXT   = '#1E293B';
const PDF_MUTED  = '#64748B';


function pdfHeader(today) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;
      margin-bottom:24px;padding-bottom:16px;
      border-bottom:2px solid ${PDF_BLUE};">
      <div style="display:flex;align-items:center;gap:12px;">
        <svg width="30" height="38" viewBox="-3 -3 36 44" fill="none">
          <defs>
            <linearGradient id="pdfLg" x1="15" y1="0" x2="15" y2="38" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#A78BFA"/>
              <stop offset="100%" stop-color="${PDF_BLUE}"/>
            </linearGradient>
          </defs>
          <line x1="15" y1="2" x2="1" y2="34" stroke="url(#pdfLg)" stroke-width="4" stroke-linecap="round"/>
          <line x1="15" y1="2" x2="29" y2="34" stroke="url(#pdfLg)" stroke-width="4" stroke-linecap="round"/>
          <line x1="7" y1="21" x2="23" y2="21" stroke="url(#pdfLg)" stroke-width="3.5" stroke-linecap="round"/>
          <circle cx="15" cy="2" r="4" fill="#A78BFA"/>
        </svg>
        <div>
          <div style="font-size:22px;font-weight:800;letter-spacing:-0.01em;line-height:1.15;">
            <span style="color:${PDF_DARK};">Amo</span><span style="color:${PDF_BLUE};">Sight</span>
          </div>
          <div style="font-size:11px;color:${PDF_MUTED};">ניתוח והשוואת קופות גמל</div>
        </div>
      </div>
      <div style="text-align:left;color:${PDF_MUTED};font-size:11px;line-height:1.6;">
        <div>דוח הופק: ${today}</div>
        <div>AmoSight Report</div>
      </div>
    </div>`;
}

function pdfFooter(pageNum, total) {
  return `
    <div style="margin-top:24px;padding-top:12px;border-top:1px solid #E2E8F0;
      display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:10px;color:${PDF_MUTED};">
        הנתונים מבוססים על מידע מהמסלקה הפנסיונית ומגמל נט · אין לראות בכך ייעוץ השקעות
      </div>
      <div style="font-size:10px;color:${PDF_MUTED};">עמוד ${pageNum} מתוך ${total}</div>
    </div>`;
}

async function generatePDF(funds, weights) {
  const today = new Date().toLocaleDateString('he-IL');
  const totalPages = 1 + funds.length;

  // ── Summary totals (same logic as SummaryHero) ───────────────────────────────
  const totalCurrent   = funds.reduce((s, f) => s + (f.client.amount ?? 0), 0);
  const totalPotential = funds.reduce((s, f) => s + getPotentialAmount(f), 0);
  const totalDiff      = totalPotential - totalCurrent;
  const totalDiffPct   = totalCurrent > 0 ? (totalDiff / totalCurrent) * 100 : 0;
  const hasUpside      = totalDiff > 0;

  // ── Page 1: Cover ────────────────────────────────────────────────────────────
  const coverHTML = `
    ${pdfHeader(today)}
    <div style="margin-bottom:18px;">
      <div style="font-size:18px;font-weight:800;color:${PDF_DARK};margin-bottom:4px;">דוח השוואת קופות גמל</div>
      <div style="font-size:13px;color:${PDF_MUTED};">${funds.length} קופ${funds.length === 1 ? 'ה' : 'ות'} נותחו בדוח זה</div>
    </div>

    ${hasUpside ? `
    <div style="background:#ffffff;border:1.5px solid rgba(234,179,8,0.5);
      border-radius:16px;padding:24px 28px;margin-bottom:18px;text-align:center;direction:rtl;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#B45309;margin-bottom:18px;">💎 סיכום כלל הקופות</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:28px;flex-wrap:wrap;">
        <div style="text-align:center;">
          <div style="font-size:10px;color:#78716C;margin-bottom:5px;letter-spacing:0.04em;">צבירה נוכחית</div>
          <div style="font-size:32px;font-weight:900;color:#F87171;">₪${fmt(totalCurrent)}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:22px;color:#D97706;">←</div>
          <div style="background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.45);
            color:#B45309;font-size:12px;font-weight:800;padding:4px 12px;border-radius:999px;margin-top:4px;">
            +₪${fmt(totalDiff)} (${fmtDec(totalDiffPct)}%)
          </div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:#78716C;margin-bottom:5px;letter-spacing:0.04em;">פוטנציאל אם תעבור עכשיו</div>
          <div style="font-size:32px;font-weight:900;color:#D97706;">₪${fmt(totalPotential)}</div>
        </div>
      </div>
      <div style="margin-top:14px;font-size:11px;color:#92400E;border-top:1px solid rgba(234,179,8,0.2);padding-top:10px;">
        השנה החמצת <strong style="color:#B45309;">₪${fmt(totalDiff)}</strong> — עדיין לא מאוחר לעבור
      </div>
    </div>` : ''}

    <div style="background:#F8FAFF;border:1px solid #DBEAFE;border-radius:12px;padding:18px 22px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:${PDF_BLUE};margin-bottom:12px;">פרמטרי החישוב — AmoScore</div>
      <div style="display:flex;gap:14px;">
        ${[['תשואה שנה',weights.w1],['תשואה 3 שנים',weights.w3],['תשואה 5 שנים',weights.w5],['Sharp Ratio',weights.wSharp]]
          .map(([label, val]) => `
          <div style="flex:1;text-align:center;background:#fff;border:1px solid #DBEAFE;border-radius:10px;padding:12px 8px;">
            <div style="font-size:10px;color:${PDF_MUTED};margin-bottom:5px;">${label}</div>
            <div style="font-size:20px;font-weight:800;color:${PDF_BLUE};">${val}%</div>
          </div>`).join('')}
      </div>
    </div>
    <div style="background:#F8FAFF;border:1px solid #DBEAFE;border-radius:12px;padding:16px 22px;">
      <div style="font-size:11px;font-weight:700;color:${PDF_MUTED};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;">כיצד מחושב AmoScore?</div>
      <div style="font-size:11px;color:${PDF_MUTED};line-height:1.7;">
        AmoScore מחושב על בסיס 4 פרמטרים: תשואה שנה, תשואה 3 שנים, תשואה 5 שנים, ו-Sharp Ratio.
        כל פרמטר עובר נורמליזציה לסקאלה של 0–100 ביחס לכלל הקופות בהשוואה, ולאחר מכן מוכפל במשקל שנבחר.
      </div>
    </div>
    ${pdfFooter(1, totalPages)}`;

  // ── Per-fund pages ──────────────────────────────────────────────────────────
  const fundPages = funds.map(({ client, alternatives, golden }, fi) => {
    const clientIsTop3 = client.rank != null && client.rank <= 3;
    const allRows = [
      { ...client, isClient: true, potential_amount: client.amount, diff: null },
      ...alternatives.map(a => ({ ...a, isClient: false })),
    ].sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0));

    const rowsHTML = allRows.map((f, idx) => {
      let bg = idx % 2 === 0 ? '#ffffff' : '#F8FAFC';
      if (f.isClient) bg = clientIsTop3 ? '#EFF6FF' : '#FEF2F2';
      const clientColor = clientIsTop3 ? PDF_BLUE : '#EF4444';

      return `
        <tr style="background:${bg};">
          <td style="padding:13px 16px;font-weight:600;color:${PDF_TEXT};font-size:14px;">
            ${f.isClient ? `<span style="color:${clientColor};font-weight:800;">${f.rank ?? idx+1}</span>`
                         : idx + 1}
            ${idx < 3 && !f.isClient
              ? `<span style="background:#EFF6FF;color:${PDF_BLUE};font-size:10px;
                  font-weight:700;padding:3px 7px;border-radius:8px;margin-right:4px;">מומלץ</span>`
              : ''}
          </td>
          <td style="padding:13px 16px;color:${PDF_TEXT};font-weight:${f.isClient ? '700' : '400'};font-size:14px;">
            ${f.name}
            ${f.hevra ? `<div style="font-size:11px;color:${PDF_MUTED};margin-top:2px;">${f.hevra}</div>` : ''}
            ${f.id ? `<div style="font-size:11px;color:${PDF_MUTED};">קופה #${f.id}</div>` : ''}
            ${f.isClient
              ? `<span style="background:${clientIsTop3 ? '#EFF6FF' : '#FEF2F2'};
                  color:${clientColor};font-size:10px;font-weight:700;
                  padding:3px 7px;border-radius:8px;margin-right:6px;">הקופה שלך</span>`
              : ''}
          </td>
          <td style="padding:13px 16px;text-align:center;color:${PDF_TEXT};font-weight:700;font-size:15px;">
            ${f.grade ? fmtDec(f.grade) : '–'}
          </td>
          <td style="padding:13px 16px;text-align:center;color:${PDF_TEXT};font-size:14px;">
            ${f.tsua_1 != null ? fmtDec(f.tsua_1) + '%' : '—'}
          </td>
          <td style="padding:13px 16px;text-align:center;color:${PDF_TEXT};font-size:14px;">
            ${RISK_LABELS[client.risk_level] ?? '—'}
          </td>
          <td style="padding:13px 16px;text-align:center;color:${PDF_TEXT};font-weight:700;font-size:15px;">
            ${f.potential_amount != null ? '₪' + fmt(f.potential_amount) : '—'}
          </td>
          <td style="padding:13px 16px;text-align:center;font-weight:700;font-size:14px;
            color:${f.diff == null ? PDF_MUTED : f.diff >= 0 ? '#16A34A' : '#EF4444'};">
            ${f.diff == null ? '—' : (f.diff >= 0 ? '+' : '') + '₪' + fmt(Math.abs(f.diff))
              + (f.diff_percent != null ? `<div style="font-size:11px;font-weight:600;">${f.diff >= 0 ? '+' : ''}${fmtDec(f.diff_percent)}%</div>` : '')}
          </td>
        </tr>`;
    }).join('');

    return `
      ${pdfHeader(today)}

      <div style="background:#F8FAFF;border:1px solid #DBEAFE;border-radius:12px;
        padding:18px 22px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:600;color:${PDF_BLUE};
          text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">פרטי הקופה</div>
        <div style="font-size:20px;font-weight:800;color:${PDF_DARK};margin-bottom:8px;">
          ${client.name}
        </div>
        <div style="font-size:12px;color:${PDF_MUTED};margin-bottom:14px;">
          קופה #${client.id}
          ${client.hevra ? ' · ' + client.hevra : ''}
          ${client.risk_level ? ' · רמת סיכון: ' + (RISK_LABELS[client.risk_level] ?? client.risk_level) : ''}
          ${client.rank != null ? ' · מקום ' + client.rank + ' מתוך ' + client.total_in_risk + ' קופות' : ''}
        </div>
        <div style="display:flex;gap:20px;">
          ${[
            ['סכום צבירה',     '₪' + fmt(client.amount)],
            ['תשואה שנתית',    client.tsua_1 ? fmtDec(client.tsua_1) + '%' : 'N/A'],
            ['AmoScore',       client.grade ? fmtDec(client.grade) : '–'],
            ['דמי ניהול',      client.dmei_nihul != null ? fmtDec(client.dmei_nihul, 2) + '%' : '—'],
          ].map(([label, val]) => `
            <div style="flex:1;background:#fff;border:1px solid #DBEAFE;
              border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:10px;color:${PDF_MUTED};margin-bottom:4px;">${label}</div>
              <div style="font-size:16px;font-weight:800;color:${PDF_DARK};">${val}</div>
            </div>`).join('')}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
        <thead>
          <tr style="background:linear-gradient(135deg,${PDF_BLUE},${PDF_PURPLE});">
            <th style="padding:13px 16px;text-align:right;color:#fff;font-weight:700;font-size:13px;">דירוג</th>
            <th style="padding:13px 16px;text-align:right;color:#fff;font-weight:700;font-size:13px;">שם הקופה</th>
            <th style="padding:13px 16px;text-align:center;color:#fff;font-weight:700;font-size:13px;">AmoScore</th>
            <th style="padding:13px 16px;text-align:center;color:#fff;font-weight:700;font-size:13px;">תשואה שנתית</th>
            <th style="padding:13px 16px;text-align:center;color:#fff;font-weight:700;font-size:13px;">רמת סיכון</th>
            <th style="padding:13px 16px;text-align:center;color:#fff;font-weight:700;font-size:13px;">סכום פוטנציאלי</th>
            <th style="padding:13px 16px;text-align:center;color:#fff;font-weight:700;font-size:13px;">הפרש</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
      <div style="font-size:11px;color:${PDF_MUTED};margin-bottom:20px;">
        * לא נוכו דמי ניהול חיצוניים מהחישוב
      </div>

      ${(() => {
        const showMissed = alternatives[0] && client.rank !== 1 && alternatives[0].potential_amount > client.amount;
        const showGold   = golden && golden.potential_amount != null && golden.potential_amount > client.amount;
        if (!showMissed && !showGold) return '';
        const best = alternatives[0];
        const missedHTML = showMissed ? `
          <div style="flex:1;min-width:220px;display:flex;align-items:flex-start;gap:10px;
            background:linear-gradient(135deg,rgba(30,27,75,0.08),rgba(49,46,129,0.04));
            border:1.5px solid rgba(67,56,202,0.3);border-radius:12px;padding:16px 18px;">
            <div style="font-size:22px;flex-shrink:0;">⚡</div>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:800;color:#4F46E5;margin-bottom:5px;">מה החמצת?</div>
              <div style="font-size:11px;color:${PDF_MUTED};margin-bottom:10px;line-height:1.5;">
                מעבר לקופה המובילה היה מגדיל ב-<strong style="color:#4F46E5;">${fmtDec(best.diff_percent)}%</strong>
              </div>
              <div style="display:flex;align-items:flex-start;gap:14px;">
                <div>
                  <div style="font-size:9px;color:${PDF_MUTED};margin-bottom:2px;">היום</div>
                  <div style="font-size:16px;font-weight:800;color:${PDF_TEXT};">₪${fmt(client.amount)}</div>
                  ${client.tsua_1 ? `<div style="font-size:9px;color:${PDF_MUTED};">${fmtDec(client.tsua_1)}%</div>` : ''}
                </div>
                <div style="font-size:16px;color:#4F46E5;margin-top:12px;">←</div>
                <div>
                  <div style="font-size:9px;color:${PDF_MUTED};margin-bottom:2px;">פוטנציאל</div>
                  <div style="font-size:16px;font-weight:800;color:#16A34A;">₪${fmt(best.potential_amount)}</div>
                  ${best.tsua_1 ? `<div style="font-size:9px;color:${PDF_MUTED};">${fmtDec(best.tsua_1)}%</div>` : ''}
                </div>
              </div>
            </div>
          </div>` : '';
        const goldHTML = showGold ? `
          <div style="flex:1;min-width:220px;display:flex;align-items:flex-start;gap:10px;
            background:linear-gradient(135deg,rgba(120,83,15,0.08),rgba(161,110,20,0.04));
            border:1.5px solid rgba(234,179,8,0.5);border-radius:12px;padding:16px 18px;">
            <div style="font-size:22px;flex-shrink:0;">🏆</div>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:800;color:#B45309;margin-bottom:2px;">תפוח הזהב</div>
              <div style="font-size:9px;color:#D97706;font-weight:600;margin-bottom:8px;">מקום #1 סיכון גבוה${golden.name ? ' · ' + golden.name : ''}${golden.id ? ' · #' + golden.id : ''}</div>
              <div style="font-size:11px;color:${PDF_MUTED};margin-bottom:10px;line-height:1.5;">
                מעבר לסיכון גבוה הייתה מגדילה ב-<strong style="color:#B45309;">${fmtDec(golden.diff_percent)}%</strong>
              </div>
              <div style="display:flex;align-items:flex-start;gap:14px;">
                <div>
                  <div style="font-size:9px;color:${PDF_MUTED};margin-bottom:2px;">היום</div>
                  <div style="font-size:16px;font-weight:800;color:${PDF_TEXT};">₪${fmt(client.amount)}</div>
                </div>
                <div style="font-size:16px;color:#D97706;margin-top:12px;">←</div>
                <div>
                  <div style="font-size:9px;color:${PDF_MUTED};margin-bottom:2px;">פוטנציאל</div>
                  <div style="font-size:16px;font-weight:800;color:#B45309;">₪${fmt(golden.potential_amount)}</div>
                  ${golden.tsua_1 ? `<div style="font-size:9px;color:#D97706;">${fmtDec(golden.tsua_1)}%</div>` : ''}
                </div>
              </div>
            </div>
          </div>` : '';
        return `<div style="display:flex;gap:12px;flex-wrap:wrap;">${missedHTML}${goldHTML}</div>`;
      })()}

      ${pdfFooter(fi + 2, totalPages)}`;
  });

  // ── Per-page render: one small html2canvas per page (much faster for many funds) ──
  const pdf   = new jsPDF('p', 'mm', 'a4');
  const pageW = 210, pageH = 297;
  const allPages = [coverHTML, ...fundPages];
  const pageStyle = `padding:40px 48px;box-sizing:border-box;background:#ffffff;`;
  const wrapStyle = `position:absolute;top:0;left:-9999px;width:794px;background:#ffffff;direction:rtl;font-family:'Rubik',Arial,sans-serif;color:${PDF_TEXT};`;

  await document.fonts.ready;

  let firstPage = true;
  for (const html of allPages) {
    const wrap = document.createElement('div');
    wrap.style.cssText = wrapStyle;
    const page = document.createElement('div');
    page.style.cssText = pageStyle;
    page.innerHTML = html;
    wrap.appendChild(page);
    document.body.appendChild(wrap);

    // One RAF to let the browser paint before capture
    await new Promise(r => requestAnimationFrame(r));

    try {
      const canvas = await html2canvas(wrap, {
        scale: 1.5, backgroundColor: '#ffffff',
        useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: 794,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.88);
      const imgH    = (canvas.height * pageW) / canvas.width;

      if (!firstPage) pdf.addPage();
      firstPage = false;

      let y = 0;
      while (y < imgH) {
        if (y > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -y, pageW, imgH);
        y += pageH;
      }
    } finally {
      document.body.removeChild(wrap);
    }
  }

  const dateStr = today.replace(/\//g, '-');
  const now     = new Date();
  const timeStr = `${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
  pdf.save(`AmoSight-${dateStr}_${timeStr}.pdf`);
}

// ─── Summary Hero helpers ─────────────────────────────────────────────────────

// Takes the best of (same-risk alt, golden) vs current — for the summary total
function getPotentialAmount(fund) {
  const { client, alternatives, golden } = fund;
  const bestAlt = alternatives?.[0];
  const sameRiskPotential = (bestAlt && client.rank !== 1) ? (bestAlt.potential_amount ?? 0) : 0;
  const goldenPotential   = golden?.potential_amount ?? 0;
  const best = Math.max(sameRiskPotential, goldenPotential);
  return best > client.amount ? best : client.amount;
}

function SummaryHero({ results }) {
  const totalCurrent   = results.reduce((s, f) => s + (f.client.amount ?? 0), 0);
  const totalPotential = results.reduce((s, f) => s + getPotentialAmount(f), 0);
  const diff           = totalPotential - totalCurrent;
  const diffPct        = totalCurrent > 0 ? (diff / totalCurrent) * 100 : 0;
  const hasUpside      = diff > 0;

  return (
    <div className="summary-hero">
      <div className="summary-hero-label">סיכום כלל הקופות 💎</div>

      <div className="summary-hero-row">
        {/* Current */}
        <div className="summary-hero-block">
          <div className="summary-hero-block-label">צבירה נוכחית</div>
          <div className="summary-hero-amount summary-hero-amount--current">
            ₪{fmt(totalCurrent)}
          </div>
        </div>

        {/* Arrow */}
        <div className="summary-hero-vs">
          {hasUpside ? (
            <div className="summary-hero-arrow-wrap">
              <span className="summary-hero-arrow">←</span>
              <span className="summary-hero-diff-badge">
                +₪{fmt(diff)}<span className="summary-hero-diff-pct"> ({fmtDec(diffPct)}%)</span>
              </span>
            </div>
          ) : (
            <span className="summary-hero-checkmark">✓</span>
          )}
        </div>

        {/* Potential */}
        <div className="summary-hero-block">
          <div className="summary-hero-block-label">פוטנציאל</div>
          <div className={`summary-hero-amount ${hasUpside ? 'summary-hero-amount--potential' : 'summary-hero-amount--current'}`}>
            ₪{fmt(totalPotential)}
          </div>
        </div>
      </div>

      {hasUpside && (
        <div className="summary-hero-cta">
          השנה החמצת <strong>₪{fmt(diff)}</strong> — עדיין לא מאוחר לעבור
        </div>
      )}
    </div>
  );
}

// ─── Community: Invite Screen ─────────────────────────────────────────────────

function InviteScreen({ results, onJoined, onBack }) {
  const [joining, setJoining] = useState(false);

  // Always merge identical funds for community display/submission (fair representation)
  const mergedResults = aggregateResults(results || []);

  const totalAmount = mergedResults.reduce((s, f) => s + (f.client?.amount ?? 0), 0);
  const weightedTsua = totalAmount > 0
    ? mergedResults.reduce((s, f) => s + (f.client?.tsua_1 ?? 0) * (f.client?.amount ?? 0) / totalAmount, 0)
    : 0;
  const weightedScore = totalAmount > 0
    ? mergedResults.filter(f => (f.client?.default_grade ?? 0) > 0)
        .reduce((s, f) => s + (f.client?.default_grade ?? 0) * (f.client?.amount ?? 0) / totalAmount, 0)
    : 0;
  const fundsWithExposure = mergedResults.filter(f => f.client?.equity_exposure != null);
  const exposureWeightTotal = fundsWithExposure.reduce((s, f) => s + (f.client?.amount ?? 0), 0);
  const weightedExposure = exposureWeightTotal > 0
    ? fundsWithExposure.reduce((s, f) => s + (f.client.equity_exposure * (f.client?.amount ?? 0)), 0) / exposureWeightTotal
    : null;

  const handleJoin = async () => {
    setJoining(true);
    try {
      const clientId = mergedResults?.[0]?.client?.client_id || 'unknown';
      const joinData = {
        client_id: clientId,
        funds: mergedResults.map(f => ({
          name: f.client?.name || '',
          id: f.client?.id || '',
          risk_level: f.client?.risk_level || 'high',
          tsua_1: f.client?.tsua_1 ?? 0,
          grade: f.client?.default_grade ?? 0,
          amount: f.client?.amount ?? 0,
          equity_exposure: f.client?.equity_exposure ?? null,
          pct_of_total: totalAmount > 0
            ? Math.round((f.client?.amount ?? 0) / totalAmount * 1000) / 10
            : 0,
        })),
      };
      const res = await fetch('http://localhost:8000/community/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(joinData),
      });
      const data = await res.json();
      onJoined(data.profile);
    } catch (err) {
      console.error(err);
      alert('שגיאה בהצטרפות לקהילה. אנא בדוק שהשרת פועל ונסה שוב.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="screen community-screen">
      <Stars />
      <Header onReset={onBack} />
      <div className="community-content">
        <button className="back-btn community-back" onClick={onBack}>→ חזרה לתוצאות</button>

        <div className="community-invite-hero">
          <div className="community-trophy">🏆</div>
          <h1 className="community-title">הצטרף לקהילת המשקיעים</h1>
          <p className="community-subtitle">
            גלה איך הפורטפוליו שלך ביחס למשקיעים אחרים — בצורה אנונימית לחלוטין.<br />
            הפרופיל שלך יוצג עם שם בדוי בלבד. אף אחד לא יידע מי אתה.
          </p>
        </div>

        <div className="community-invite-grid">
          <div className="community-card community-preview-card">
            <div className="community-card-label">כך ייראה הפרופיל שלך</div>
            <div className="community-preview-header">
              <div className="community-avatar-sm">🦁</div>
              <div>
                <div className="community-preview-name">משקיע מסתורי</div>
                <div className="community-preview-date">
                  הצטרף {new Date().toLocaleDateString('he-IL', { month: '2-digit', year: 'numeric' })}
                </div>
              </div>
            </div>
            <div className="community-preview-stats">
              <div className="community-stat-mini">
                <div className="community-stat-mini-val" style={{ color: '#3B82F6' }}>{fmtDec(weightedScore)}</div>
                <div className="community-stat-mini-label">AmoScore*</div>
              </div>
              <div className="community-stat-mini">
                <div className="community-stat-mini-val" style={{ color: '#10B981' }}>{fmtDec(weightedTsua)}%</div>
                <div className="community-stat-mini-label">תשואה שנתית</div>
              </div>
              <div className="community-stat-mini">
                <div className="community-stat-mini-val" style={{ color: '#F59E0B' }}>
                  {weightedExposure != null ? `${fmtDec(weightedExposure)}%` : '—'}
                </div>
                <div className="community-stat-mini-label">חשיפה למניות</div>
              </div>
            </div>
          </div>

          <div className="community-card community-privacy-card">
            <div className="community-card-label">מה מוצג בפרופיל?</div>
            <ul className="community-privacy-list">
              <li className="privacy-item privacy-yes">✓ אחוז מהתיק לכל קופה</li>
              <li className="privacy-item privacy-yes">✓ תשואה שנתית משוקללת</li>
              <li className="privacy-item privacy-yes">✓ ציון AmoScore</li>
              <li className="privacy-item privacy-yes">✓ רמת סיכון דומיננטית</li>
              <li className="privacy-item privacy-no">✗ שם אמיתי — לעולם לא</li>
              <li className="privacy-item privacy-no">✗ סכומים בשקלים — לעולם לא</li>
            </ul>
          </div>
        </div>

        <button className="community-join-btn" onClick={handleJoin} disabled={joining}>
          {joining ? '⏳ מצטרף...' : '🚀 הצטרף לקהילה'}
        </button>
        <p className="community-disclaimer-small">
          ניתן לעזוב בכל עת · המידע שלך מאוחסן באופן מקומי בלבד
        </p>
        <p className="community-weights-note">
          * AmoScore בקהילה מחושב לפי משקלים קבועים וסטנדרטיים (תשואה שנה 10% · תשואה 3 שנים 20% · תשואה 5 שנים 25% · Sharp Ratio 45%) — כדי להבטיח השוואה הוגנת בין כל המשקיעים, ללא תלות בהגדרות האישיות שלך.
        </p>
      </div>
    </div>
  );
}

// ─── Community: Leaderboard Screen ────────────────────────────────────────────

function LeaderboardScreen({ leaderboard, myProfile, onViewProfile, onBack }) {
  const [sortBy, setSortBy] = useState('score');
  const [riskFilter, setRiskFilter] = useState('all');

  const exposureToRisk = (exposure) => {
    if (exposure == null) return null;
    if (exposure <= 25) return 'low';
    if (exposure <= 75) return 'medium';
    return 'high';
  };

  const filtered = (leaderboard || [])
    .filter(p => {
      if (riskFilter === 'all') return true;
      const risk = exposureToRisk(p.weighted_equity_exposure) ?? p.dominant_risk;
      return risk === riskFilter;
    })
    .slice()
    .sort((a, b) =>
      sortBy === 'score'
        ? b.weighted_score - a.weighted_score
        : b.weighted_tsua - a.weighted_tsua
    );

  return (
    <div className="screen community-screen">
      <Stars />
      <Header onReset={onBack} />
      <div className="community-content">
        <button className="back-btn community-back" onClick={onBack}>→ חזרה לתוצאות</button>

        <div className="leaderboard-hero">
          <h1 className="community-title">🏆 טבלת המשקיעים</h1>
          <div className="leaderboard-count">{(leaderboard || []).length} משקיעים בקהילה</div>
          <div className="leaderboard-weights-note">
            * AmoScore מחושב לפי משקלים קבועים: תשואה שנה 10% · תשואה 3 שנים 20% · תשואה 5 שנים 25% · Sharp Ratio 45%
          </div>
        </div>

        <div className="leaderboard-controls">
          <div className="leaderboard-sort-group">
            <span className="leaderboard-control-label">מיין לפי:</span>
            <button
              className={`leaderboard-filter-btn${sortBy === 'score' ? ' active' : ''}`}
              onClick={() => setSortBy('score')}
            >AmoScore</button>
            <button
              className={`leaderboard-filter-btn${sortBy === 'tsua' ? ' active' : ''}`}
              onClick={() => setSortBy('tsua')}
            >תשואה שנתית</button>
          </div>
          <div className="leaderboard-risk-group">
            <span className="leaderboard-control-label">סיכון:</span>
            {['all', 'high', 'medium', 'low'].map(risk => (
              <button
                key={risk}
                className={`leaderboard-filter-btn${riskFilter === risk ? ' active' : ''}`}
                onClick={() => setRiskFilter(risk)}
                style={riskFilter === risk && risk !== 'all'
                  ? { borderColor: COMMUNITY_RISK_COLORS[risk], color: COMMUNITY_RISK_COLORS[risk] }
                  : {}}
              >
                {risk === 'all' ? 'הכל' : RISK_LABELS[risk]}
              </button>
            ))}
          </div>
        </div>

        <div className="leaderboard-table-wrap">
          <div className="leaderboard-table">
            <div className="leaderboard-header-row">
              <div className="lb-col lb-col-rank">#</div>
              <div className="lb-col lb-col-investor">משקיע</div>
              <div className="lb-col lb-col-score">AmoScore</div>
              <div className="lb-col lb-col-tsua">תשואה</div>
              <div className="lb-col lb-col-risk">חשיפה</div>
            </div>
            {filtered.map((profile, idx) => {
              const isMe = myProfile && profile.fake_name === myProfile.fake_name;
              return (
                <div
                  key={profile.fake_name}
                  className={`leaderboard-row${isMe ? ' leaderboard-row--me' : ''}${idx < 3 ? ` leaderboard-row--top${idx + 1}` : ''}`}
                  onClick={() => onViewProfile(profile.fake_name)}
                >
                  <div className="lb-col lb-col-rank">
                    {idx < 3 ? MEDALS[idx] : <span className="lb-rank-num">{idx + 1}</span>}
                  </div>
                  <div className="lb-col lb-col-investor">
                    <div className="lb-avatar">{getCommunityAvatar(profile.fake_name)}</div>
                    <div className="lb-investor-info">
                      <div className="lb-name">
                        {profile.fake_name}
                        {isMe && <span className="lb-me-badge">אתה</span>}
                      </div>
                      <div className="lb-meta">{profile.num_funds} קופות · {profile.joined}</div>
                    </div>
                  </div>
                  <div className="lb-col lb-col-score">
                    <span style={{ color: '#3B82F6', fontWeight: 700 }}>{fmtDec(profile.weighted_score)}</span>
                  </div>
                  <div className="lb-col lb-col-tsua">
                    <span style={{ color: '#10B981', fontWeight: 700 }}>{fmtDec(profile.weighted_tsua)}%</span>
                  </div>
                  <div className="lb-col lb-col-risk">
                    {profile.weighted_equity_exposure != null ? (
                      <span className="lb-exposure-badge">
                        {fmtDec(profile.weighted_equity_exposure)}%
                      </span>
                    ) : (
                      <span className="lb-risk-badge" style={{
                        background: COMMUNITY_RISK_COLORS[profile.dominant_risk] + '22',
                        color: COMMUNITY_RISK_COLORS[profile.dominant_risk],
                      }}>
                        {RISK_LABELS[profile.dominant_risk]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="leaderboard-empty">אין משקיעים תואמים לפילטר הנוכחי</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Community: Profile Screen ────────────────────────────────────────────────

function ProfileScreen({ fakeName, myProfile, leaderboard, onBack }) {
  const isMe = myProfile && fakeName === myProfile.fake_name;
  const [profile, setProfile] = useState(isMe ? myProfile : null);
  const [loading, setLoading] = useState(!isMe);

  useEffect(() => {
    if (isMe && myProfile) { setProfile(myProfile); setLoading(false); return; }
    setLoading(true);
    fetch(`http://localhost:8000/community/profile/${encodeURIComponent(fakeName)}`)
      .then(r => r.json())
      .then(data => { setProfile(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [fakeName, isMe, myProfile]);

  const rank = (leaderboard || []).findIndex(p => p.fake_name === fakeName) + 1;
  const totalInCommunity = (leaderboard || []).length;

  return (
    <div className="screen community-screen">
      <Stars />
      <Header onReset={onBack} />
      <div className="community-content">
        <button className="back-btn community-back" onClick={onBack}>→ חזרה לטבלה</button>

        {loading && <div className="community-loading">טוען פרופיל...</div>}

        {!loading && profile && (
          <>
            <div className="community-card profile-header-card">
              <div className="profile-header-inner">
                <div className="profile-avatar-big">{getCommunityAvatar(profile.fake_name)}</div>
                <div className="profile-header-text">
                  <div className="profile-name-big">{profile.fake_name}</div>
                  <div className="profile-joined-date">הצטרף {profile.joined}</div>
                  {isMe && <span className="profile-me-badge">הפרופיל שלך ✨</span>}
                </div>
              </div>
            </div>

            <div className="profile-stats-grid">
              <div className="community-card profile-stat-card">
                <div className="profile-stat-icon">📊</div>
                <div className="profile-stat-val" style={{ color: '#3B82F6' }}>{fmtDec(profile.weighted_score)}</div>
                <div className="profile-stat-label">AmoScore</div>
              </div>
              <div className="community-card profile-stat-card">
                <div className="profile-stat-icon">📈</div>
                <div className="profile-stat-val" style={{ color: '#10B981' }}>{fmtDec(profile.weighted_tsua)}%</div>
                <div className="profile-stat-label">תשואה שנתית</div>
              </div>
              <div className="community-card profile-stat-card">
                <div className="profile-stat-icon">📉</div>
                <div className="profile-stat-val" style={{ color: '#F59E0B' }}>
                  {profile.weighted_equity_exposure != null
                    ? `${fmtDec(profile.weighted_equity_exposure)}%`
                    : RISK_LABELS[profile.dominant_risk]}
                </div>
                <div className="profile-stat-label">חשיפה למניות</div>
              </div>
              <div className="community-card profile-stat-card">
                <div className="profile-stat-icon">🏆</div>
                <div className="profile-stat-val" style={{ color: '#F59E0B' }}>
                  {rank > 0 ? `#${rank}` : '—'}
                </div>
                <div className="profile-stat-label">
                  דירוג{totalInCommunity > 0 ? ` מתוך ${totalInCommunity}` : ''}
                </div>
              </div>
            </div>

            {profile.funds && profile.funds.length > 0 && (
              <div className="community-card profile-funds-card">
                <div className="community-card-label">הקצאת קופות</div>
                <div className="fund-allocation-bar">
                  {profile.funds.map((fund, i) => (
                    <div
                      key={fund.id}
                      className="fund-allocation-segment"
                      style={{ width: `${fund.pct}%`, background: FUND_PALETTE[i % FUND_PALETTE.length] }}
                      title={`${fund.name}: ${fund.pct}%`}
                    />
                  ))}
                </div>
                <div className="fund-allocation-list">
                  {profile.funds.map((fund, i) => (
                    <div key={fund.id} className="fund-allocation-item">
                      <div className="fund-dot" style={{ background: FUND_PALETTE[i % FUND_PALETTE.length] }} />
                      <div className="fund-alloc-name">{fund.name}</div>
                      <div className="fund-alloc-id">#{fund.id}</div>
                      <div className="fund-alloc-pct" style={{ color: FUND_PALETTE[i % FUND_PALETTE.length] }}>
                        {fmtDec(fund.pct)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="community-disclaimer">
              * הנתונים מוצגים באחוזים בלבד לשמירה על פרטיות המשתמש. אין חשיפה של סכומים כספיים.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function ResultsScreen({ results, weights, thresholds, onReset, onGoToInvite }) {
  const [selectedId, setSelectedId] = useState('all');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 150;
      setAtBottom(nearBottom);
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleScrollToggle = () => {
    if (atBottom) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      await generatePDF(results || [], weights);
    } catch (e) {
      console.error('PDF Error:', e);
      alert('שגיאה: ' + (e?.message ?? e));
    } finally {
      setPdfLoading(false);
    }
  };

  const filtered = selectedId === 'all'
    ? (results || [])
    : (results || []).filter(d => d.client?.id === selectedId);

  return (
    <div className="screen screen--results">
      <Stars />
      <Header onReset={onReset} />
      <div id="results-content" className="results-content">

        {results && results.length > 0 && (
          <SummaryHero results={results} />
        )}

        {results && results.length > 1 && (() => {
          const grouped = [];
          const seen = new Map();
          for (const d of results) {
            const id = d.client?.id;
            if (seen.has(id)) { seen.get(id).count++; } else { const entry = { id, name: d.client?.name, count: 1 }; seen.set(id, entry); grouped.push(entry); }
          }
          return (
            <div className="results-filter">
              <label className="results-filter-label">הצג קופה:</label>
              <select
                className="results-filter-select"
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
              >
                <option value="all">כל הקופות ({results.length})</option>
                {grouped.map(({ id, name, count }) => (
                  <option key={id} value={id}>
                    #{id} — {name}{count > 1 ? ` (×${count})` : ''}
                  </option>
                ))}
              </select>
            </div>
          );
        })()}

        {filtered.map((data, i) => (
          <div key={(data.client?.id ?? i) + '-' + i}>
            <FundResults data={data} weights={weights} thresholds={thresholds} />
          </div>
        ))}

        <div className="amoscore-explanation">
          <div className="amoscore-explanation-header">
            <span className="amoscore-explanation-icon">📐</span>
            <div className="amoscore-explanation-title">כיצד מחושב AmoScore?</div>
          </div>
          <div className="amoscore-explanation-body">
            <p>
              AmoScore הוא ציון מורכב המשקלל ארבעה פרמטרים של ביצועי קופת הגמל: תשואה לשנה, תשואה ל-3 שנים, תשואה ל-5 שנים, ו-Sharp Ratio — מדד לתשואה מתואמת סיכון.
            </p>
            <p>
              כל פרמטר עובר נורמליזציה לסקאלה של 0–100 ביחס לכלל הקופות בהשוואה, כך שהקופה הטובה ביותר בכל פרמטר מקבלת 100 והחלשה ביותר מקבלת 0. לאחר מכן כל פרמטר מוכפל במשקל שבחרת, והציון הסופי הוא הסכום המשוקלל — מספר בין 0 ל-100 שמאפשר השוואה ישירה בין קופות.
            </p>
            {weights && (
              <div className="amoscore-weights-chips">
                {[['תשואה שנה', weights.w1], ['תשואה 3 שנים', weights.w3], ['תשואה 5 שנים', weights.w5], ['Sharp Ratio', weights.wSharp]].map(([label, val]) => (
                  <div key={label} className="weight-chip">
                    <div className="weight-chip-label">{label}</div>
                    <div className="weight-chip-val">{val}%</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pdf-button-container">
          <button
            className="download-pdf-btn"
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
          >
            {pdfLoading ? '⏳ מפיק PDF...' : '📥 הורד דוח PDF'}
          </button>
        </div>

        {onGoToInvite && (
          <div className="community-invite-banner">
            <div className="invite-banner-icon">🏆</div>
            <div className="invite-banner-text">
              <div className="invite-banner-title">רוצה לראות איך אתה ביחס למשקיעים אחרים?</div>
              <div className="invite-banner-subtitle">הצטרף לקהילה האנונימית שלנו וגלה את הדירוג שלך</div>
            </div>
            <button className="invite-banner-btn" onClick={onGoToInvite}>הצטרף</button>
          </div>
        )}

        <div className="portfolio-footer">
          נבנה ב ❤️ על ידי{' '}
          <a href="https://techiloli.vercel.app/" target="_blank" rel="noopener noreferrer">
            Ilay Atia
          </a>
        </div>

      </div>

      <button className={`scroll-nav-btn${atBottom ? ' scroll-nav-btn--up' : ''}`} onClick={handleScrollToggle}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points={atBottom ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
        </svg>
        <span>{atBottom ? 'חזור לראש' : 'לסוף הדף'}</span>
      </button>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

function App() {
  const [screen, setScreen] = useState('upload');
  const [mislakaFiles, setMislakaFiles] = useState([]);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [rawResults, setRawResults] = useState(null);
  const [sumSameKupa, setSumSameKupa] = useState(true);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [badHevrot, setBadHevrot] = useState(DEFAULT_BAD_HEVROT);
  const [loadingStep, setLoadingStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [viewingFile, setViewingFile] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [selectedProfileName, setSelectedProfileName] = useState(null);

  const results = useMemo(() => {
    if (!rawResults) return null;
    return sumSameKupa ? aggregateResults(rawResults) : rawResults;
  }, [rawResults, sumSameKupa]);

  const handleRemoveMislakaFile = (idx) => {
    setMislakaFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleViewFile = useCallback(async (file) => {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');
    setViewingFile({ doc: xmlDoc, name: file.name });
    setScreen('viewer');
  }, []);

  const handleExportWord = useCallback(() => {
    if (!viewingFile) return;

    function nodeToHtml(node, depth) {
      const children = Array.from(node.children || []);
      const hasChildren = children.length > 0;
      const textValue = !hasChildren && node.textContent ? node.textContent.trim() : null;
      const indent = depth * 20;
      const tag = `<span style="color:#1E40AF;font-family:Consolas,monospace;font-weight:600">${node.tagName}</span>`;
      const count = hasChildren ? ` <span style="color:#6B7280;font-size:11px">(${children.length})</span>` : '';
      const val = textValue ? ` <span style="color:#065F46;background:#D1FAE5;padding:1px 6px;border-radius:3px;font-family:Consolas,monospace">${textValue}</span>` : '';
      const bullet = hasChildren ? '▶ ' : '● ';
      let html = `<div style="padding-right:${indent}px;margin:2px 0;direction:rtl">${bullet}${tag}${count}${val}</div>`;
      if (hasChildren) {
        for (const child of children) html += nodeToHtml(child, depth + 1);
      }
      return html;
    }

    const treeHtml = nodeToHtml(viewingFile.doc.documentElement, 0);
    const docHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8">
      <title>${viewingFile.name}</title>
      <style>
        body { font-family: Arial, sans-serif; direction: rtl; background: #fff; color: #111; padding: 24px; }
        h1 { font-size: 18px; color: #1E3A5F; margin-bottom: 16px; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px; }
      </style>
      </head>
      <body>
        <h1>תצוגת קובץ XML — ${viewingFile.name}</h1>
        ${treeHtml}
      </body></html>`;

    const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = viewingFile.name.replace(/\.[^.]+$/, '') + '.doc';
    a.click();
    URL.revokeObjectURL(url);
  }, [viewingFile]);

  const handleAnalyze = async () => {
    setScreen('loading');
    setLoadingStep(0);
    setProgress(0);

    let prog = 0;
    let stepIdx = 0;
    const interval = setInterval(() => {
      prog = Math.min(prog + 1.2, 92);
      setProgress(Math.round(prog));
      const newStep = Math.min(Math.floor(prog / 24), LOADING_STEPS.length - 1);
      if (newStep !== stepIdx) {
        stepIdx = newStep;
        setLoadingStep(newStep);
      }
    }, 80);

    try {
      const formData = new FormData();
      formData.append('weight_1', weights.w1);
      formData.append('weight_3', weights.w3);
      formData.append('weight_5', weights.w5);
      formData.append('weight_sharp', weights.wSharp);
      formData.append('low_exposure_threshold', thresholds.low);
      formData.append('medium_exposure_threshold', thresholds.medium);
      formData.append('client_id', 'amo_sight_user');
      mislakaFiles.forEach(f => formData.append('mislaka_file', f));
      badHevrot.forEach(h => formData.append('bad_hevrot', h));

      const res = await fetch('http://localhost:8000/compare', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => {
        const funds = data.funds ?? data;
        setRawResults(Array.isArray(funds) ? funds : [funds]);
        setScreen('results');
      }, 500);
    } catch (err) {
      clearInterval(interval);
      console.error(err);
      alert('שגיאה בניתוח הנתונים. אנא בדוק שהשרת פועל ונסה שוב.');
      setScreen('upload');
    }
  };

  if (screen === 'loading') {
    return <LoadingScreen step={loadingStep} progress={progress} />;
  }
  if (screen === 'results') {
    return (
      <ResultsScreen
        results={results}
        weights={weights}
        thresholds={thresholds}
        onReset={() => setScreen('upload')}
        onGoToInvite={() => setScreen('invite')}
      />
    );
  }
  if (screen === 'invite') {
    return (
      <InviteScreen
        results={results}
        onBack={() => setScreen('results')}
        onJoined={async (profile) => {
          setMyProfile(profile);
          try {
            const res = await fetch('http://localhost:8000/community/leaderboard');
            const data = await res.json();
            setLeaderboardData(data.profiles || []);
          } catch (err) {
            console.error(err);
          }
          setScreen('leaderboard');
        }}
      />
    );
  }
  if (screen === 'leaderboard') {
    return (
      <LeaderboardScreen
        leaderboard={leaderboardData}
        myProfile={myProfile}
        onBack={() => setScreen('results')}
        onViewProfile={(fakeName) => {
          setSelectedProfileName(fakeName);
          setScreen('profile');
        }}
      />
    );
  }
  if (screen === 'profile') {
    return (
      <ProfileScreen
        fakeName={selectedProfileName}
        myProfile={myProfile}
        leaderboard={leaderboardData}
        onBack={() => setScreen('leaderboard')}
      />
    );
  }
  if (screen === 'viewer' && viewingFile) {
    return (
      <div className="screen screen--viewer">
        <Stars />
        <div className="viewer-header">
          <button className="back-btn" onClick={() => setScreen('upload')}>→ חזרה</button>
          <h2>תצוגת קובץ XML</h2>
          <button className="export-word-btn" onClick={handleExportWord}>⬇ ייצא ל-Word</button>
        </div>
        <div className="viewer-card">
          <TreeNode node={viewingFile.doc.documentElement} depth={0} />
        </div>
      </div>
    );
  }
  return (
    <UploadScreen
      mislakaFiles={mislakaFiles}
      onMislakaFiles={setMislakaFiles}
      onRemoveMislakaFile={handleRemoveMislakaFile}
      onViewFile={handleViewFile}
      weights={weights}
      onWeightsChange={setWeights}
      thresholds={thresholds}
      onThresholdsChange={setThresholds}
      sumSameKupa={sumSameKupa}
      onSumSameKupaChange={setSumSameKupa}
      badHevrot={badHevrot}
      onBadHevrotChange={setBadHevrot}
      onAnalyze={handleAnalyze}
    />
  );
}

export default App;
