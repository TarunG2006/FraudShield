import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

// ── Icons ────────────────────────────────────────────────────
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ── Rule type badge colors ───────────────────────────────────
const TYPE_COLORS = {
  threshold: { bg: 'rgba(99,102,241,0.15)', text: '#818cf8', border: 'rgba(99,102,241,0.3)' },
  velocity:  { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
  geo:       { bg: 'rgba(16,185,129,0.15)', text: '#34d399', border: 'rgba(16,185,129,0.3)' },
  pattern:   { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  ml:        { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: 'rgba(168,85,247,0.3)' },
};

const RULE_TYPES = ['threshold', 'velocity', 'geo', 'pattern', 'ml'];

const EMPTY_FORM = {
  name: '',
  description: '',
  rule_type: 'threshold',
  score_weight: 20,
  is_active: true,
  conditions: '{}',
};

// ── Toggle Switch Component ──────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center',
        width: '44px', height: '24px', borderRadius: '12px', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
        background: checked ? '#3b82f6' : 'rgba(255,255,255,0.1)',
        opacity: disabled ? 0.5 : 1, flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', width: '18px', height: '18px', borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        left: checked ? '23px' : '3px', top: '3px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }}/>
    </button>
  );
}

// ── Modal ────────────────────────────────────────────────────
function RuleModal({ rule, onClose, onSave }) {
  const [form, setForm] = useState(rule ? {
    name: rule.name || '',
    description: rule.description || '',
    rule_type: rule.rule_type || 'threshold',
    score_weight: rule.score_weight || 20,
    is_active: rule.is_active ?? true,
    conditions: typeof rule.conditions === 'object'
      ? JSON.stringify(rule.conditions, null, 2)
      : rule.conditions || '{}',
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleConditionsChange = (v) => {
    set('conditions', v);
    try { JSON.parse(v); setJsonError(''); }
    catch { setJsonError('Invalid JSON'); }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Rule name is required');
    if (jsonError) return toast.error('Fix JSON in conditions field');
    try { JSON.parse(form.conditions); } catch { return toast.error('Conditions must be valid JSON'); }

    setSaving(true);
    try {
      const payload = {
        ...form,
        score_weight: parseInt(form.score_weight),
        conditions: JSON.parse(form.conditions),
      };
      await onSave(payload);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px',
    }}>
      <div style={{
        background: '#1e2433', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px', width: '100%', maxWidth: '520px',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: '16px', fontWeight: 600 }}>
            {rule ? 'Edit Rule' : 'New Fraud Rule'}
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#94a3b8',
            cursor: 'pointer', padding: '4px', borderRadius: '4px',
          }}><XIcon /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Name */}
          <div>
            <label style={labelStyle}>Rule Name *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. High Amount Threshold"
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What does this rule detect?"
              style={inputStyle}
            />
          </div>

          {/* Type + Weight row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Rule Type</label>
              <select value={form.rule_type} onChange={e => set('rule_type', e.target.value)} style={inputStyle}>
                {RULE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Score Weight (1–100)</label>
              <input
                type="number" min="1" max="100"
                value={form.score_weight}
                onChange={e => set('score_weight', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Conditions JSON */}
          <div>
            <label style={labelStyle}>
              Conditions (JSON)
              {jsonError && <span style={{ color: '#f87171', marginLeft: '8px', fontSize: '11px' }}>{jsonError}</span>}
            </label>
            <textarea
              value={form.conditions}
              onChange={e => handleConditionsChange(e.target.value)}
              rows={4}
              placeholder='{"min_amount": 5000}'
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
            />
          </div>

          {/* Active toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Toggle checked={form.is_active} onChange={() => set('is_active', !form.is_active)} />
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>
              Rule is {form.is_active ? 'active' : 'inactive'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'flex-end', gap: '10px',
        }}>
          <button onClick={onClose} style={ghostBtnStyle}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={primaryBtnStyle}>
            {saving ? 'Saving...' : rule ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ─────────────────────────────────────
function DeleteModal({ rule, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#1e2433', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px', padding: '28px', maxWidth: '400px', width: '90%',
      }}>
        <h3 style={{ margin: '0 0 8px', color: '#f1f5f9' }}>Delete Rule</h3>
        <p style={{ color: '#94a3b8', margin: '0 0 20px', fontSize: '14px', lineHeight: 1.5 }}>
          Are you sure you want to delete <strong style={{ color: '#f1f5f9' }}>{rule.name}</strong>?
          This cannot be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={ghostBtnStyle}>Cancel</button>
          <button
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              await onConfirm();
              setDeleting(false);
            }}
            style={{ ...primaryBtnStyle, background: '#ef4444' }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Rules Page ──────────────────────────────────────────
export default function Rules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState(null);
  const [deleteRule, setDeleteRule] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/rules');
      const data = res.data?.data || res.data || [];
      setRules(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // ── Toggle active/inactive ──
  const handleToggle = async (rule) => {
    setTogglingId(rule.id);
    try {
      const res = await api.patch(`/rules/${rule.id}/toggle`);
      const updated = res.data?.data || res.data;
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: updated?.is_active ?? !r.is_active } : r));
      toast.success(`Rule ${updated?.is_active ? 'activated' : 'deactivated'}`);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to toggle rule');
    } finally {
      setTogglingId(null);
    }
  };

  // ── Create new rule ──
  const handleCreate = async (payload) => {
    const res = await api.post('/rules', payload);
    const newRule = res.data?.data || res.data;
    setRules(prev => [...prev, newRule]);
    toast.success('Rule created');
    setShowNew(false);
  };

  // ── Edit rule ──
  const handleEdit = async (payload) => {
    const res = await api.put(`/rules/${editRule.id}`, payload);
    const updated = res.data?.data || res.data;
    setRules(prev => prev.map(r => r.id === editRule.id ? { ...r, ...updated } : r));
    toast.success('Rule updated');
    setEditRule(null);
  };

  // ── Delete rule ──
  const handleDelete = async () => {
    try {
      await api.delete(`/rules/${deleteRule.id}`);
      setRules(prev => prev.filter(r => r.id !== deleteRule.id));
      toast.success('Rule deleted');
      setDeleteRule(null);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to delete rule');
    }
  };

  const activeCount = rules.filter(r => r.is_active).length;

  return (
    <div style={{ padding: '28px', maxWidth: '1100px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', color: '#f1f5f9', fontSize: '24px', fontWeight: 700 }}>
            Fraud Rules
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Manage detection rules</p>
        </div>
        <button onClick={() => setShowNew(true)} style={{ ...primaryBtnStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <PlusIcon /> New Rule
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Rules', value: rules.length },
          { label: 'Active', value: activeCount, color: '#34d399' },
          { label: 'Inactive', value: rules.length - activeCount, color: '#f87171' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '14px 20px',
          }}>
            <div style={{ color: s.color || '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px', overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 3fr 1fr 90px 90px 100px',
          padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          <span>Rule Name</span><span>Description</span><span>Weight</span>
          <span>Type</span><span style={{ textAlign: 'center' }}>Status</span><span style={{ textAlign: 'right' }}>Actions</span>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>Loading rules...</div>
        ) : rules.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
            <ShieldIcon />
            <p style={{ marginTop: '12px' }}>No rules yet. Create your first rule.</p>
          </div>
        ) : (
          rules.map((rule, i) => {
            const typeStyle = TYPE_COLORS[rule.rule_type] || TYPE_COLORS.threshold;
            return (
              <div key={rule.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 3fr 1fr 90px 90px 100px',
                padding: '16px 20px', alignItems: 'center',
                borderBottom: i < rules.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Name */}
                <div style={{ color: '#f1f5f9', fontWeight: 500, fontSize: '14px', paddingRight: '12px' }}>
                  {rule.name || '—'}
                </div>

                {/* Description */}
                <div style={{ color: '#94a3b8', fontSize: '13px', paddingRight: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rule.description || '—'}
                </div>

                {/* Weight */}
                <div style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 600 }}>
                  +{rule.score_weight}
                </div>

                {/* Type badge */}
                <div>
                  <span style={{
                    background: typeStyle.bg, color: typeStyle.text,
                    border: `1px solid ${typeStyle.border}`,
                    borderRadius: '6px', padding: '3px 8px', fontSize: '11px',
                    textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600,
                  }}>
                    {rule.rule_type}
                  </span>
                </div>

                {/* Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <Toggle
                    checked={rule.is_active}
                    onChange={() => handleToggle(rule)}
                    disabled={togglingId === rule.id}
                  />
                  <span style={{ color: rule.is_active ? '#34d399' : '#64748b', fontSize: '11px', fontWeight: 600, minWidth: '24px' }}>
                    {togglingId === rule.id ? '...' : rule.is_active ? 'ON' : 'OFF'}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setEditRule(rule)}
                    style={{ ...iconBtnStyle, color: '#60a5fa' }}
                    title="Edit rule"
                  ><EditIcon /></button>
                  <button
                    onClick={() => setDeleteRule(rule)}
                    style={{ ...iconBtnStyle, color: '#f87171' }}
                    title="Delete rule"
                  ><TrashIcon /></button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      {showNew   && <RuleModal rule={null}    onClose={() => setShowNew(false)}   onSave={handleCreate} />}
      {editRule  && <RuleModal rule={editRule} onClose={() => setEditRule(null)}  onSave={handleEdit}   />}
      {deleteRule && <DeleteModal rule={deleteRule} onClose={() => setDeleteRule(null)} onConfirm={handleDelete} />}
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────
const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px',
  color: '#f1f5f9', padding: '10px 12px', fontSize: '14px',
  outline: 'none', boxSizing: 'border-box',
};
const labelStyle = {
  display: 'block', color: '#94a3b8', fontSize: '12px',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  marginBottom: '6px', fontWeight: 600,
};
const primaryBtnStyle = {
  background: '#3b82f6', color: '#fff', border: 'none',
  borderRadius: '8px', padding: '10px 18px', fontSize: '14px',
  fontWeight: 600, cursor: 'pointer',
};
const ghostBtnStyle = {
  background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
  padding: '10px 18px', fontSize: '14px', cursor: 'pointer',
};
const iconBtnStyle = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '6px', padding: '6px 8px', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};