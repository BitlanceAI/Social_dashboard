import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { importPipelineItems } from '../lib/pipelinesApi';
import { useWorkspace } from '@/features/workspace';

const loadXLSXLib = () => {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error('Failed to load Excel library from CDN'));
    document.head.appendChild(script);
  });
};

export default function ImportContentModal({ isOpen, onClose, pipelineId, onImportSuccess }) {
  const { activeWorkspaceId } = useWorkspace();
  const [activeTab, setActiveTab] = useState('file'); // 'file' | 'paste'
  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  // Simple CSV parser fallback
  const parseCSV = (text) => {
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = values[idx] || '';
      });

      const titleHook = obj['Post Title / Hook'] || obj.titleHook || obj.hook || obj.Hook || obj.title || values[0] || '';
      if (titleHook) {
        rows.push({
          day: obj.Day || obj.day || `Day ${i}`,
          dateStr: obj.Date || obj.date || '',
          titleHook,
          contentPillar: obj['Content Pillar'] || obj.contentPillar || obj.pillar || '',
          captionOutline: obj['Caption Outline'] || obj.captionOutline || obj.outline || '',
          format: obj.Format || obj.format || '',
          cta: obj.CTA || obj.cta || '',
        });
      }
    }
    return rows;
  };

  const mapRawObjectToItem = (obj, idx) => {
    const titleHook = obj['Post Title / Hook'] || obj.titleHook || obj.hook || obj.Hook || obj['Title'] || obj.title || obj['Post Title'] || obj['Hook'] || Object.values(obj)[0] || '';
    if (!titleHook) return null;
    return {
      day: String(obj.Day || obj.day || obj['DAY'] || `Day ${idx + 1}`),
      dateStr: String(obj.Date || obj.date || obj['DATE'] || ''),
      titleHook: String(titleHook),
      contentPillar: String(obj['Content Pillar'] || obj.contentPillar || obj.pillar || obj.Pillar || obj['Pillar'] || ''),
      captionOutline: String(obj['Caption Outline'] || obj.captionOutline || obj.outline || obj.Outline || obj['Outline'] || ''),
      format: String(obj.Format || obj.format || obj.type || obj.Type || obj['FORMAT'] || ''),
      cta: String(obj.CTA || obj.cta || obj['Cta'] || ''),
    };
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const lowerName = file.name.toLowerCase();

    try {
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        toast.loading('Reading Excel spreadsheet...', { id: 'excel-toast' });
        const XLSX = await loadXLSXLib();
        const reader = new FileReader();

        reader.onload = (evt) => {
          try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonRows = XLSX.utils.sheet_to_json(worksheet);

            const mapped = jsonRows
              .map((row, idx) => mapRawObjectToItem(row, idx))
              .filter(Boolean);

            setParsedRows(mapped);
            toast.success(`Successfully parsed ${mapped.length} items from ${file.name}!`, { id: 'excel-toast' });
          } catch (err) {
            toast.error(`Excel parse error: ${err.message}`, { id: 'excel-toast' });
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (lowerName.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const json = JSON.parse(evt.target?.result || '[]');
            const array = Array.isArray(json) ? json : [json];
            const mapped = array
              .map((item, idx) => mapRawObjectToItem(item, idx))
              .filter(Boolean);
            setParsedRows(mapped);
            toast.success(`Parsed ${mapped.length} items from ${file.name}`);
          } catch (err) {
            toast.error(`JSON parse error: ${err.message}`);
          }
        };
        reader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const text = evt.target?.result || '';
            const rows = parseCSV(text);
            setParsedRows(rows);
            toast.success(`Parsed ${rows.length} items from ${file.name}`);
          } catch (err) {
            toast.error(`CSV parse error: ${err.message}`);
          }
        };
        reader.readAsText(file);
      }
    } catch (err) {
      toast.error(`Error loading file parser: ${err.message}`);
    }
  };

  const handlePasteParse = () => {
    if (!rawText.trim()) return;
    try {
      if (rawText.trim().startsWith('[')) {
        const json = JSON.parse(rawText);
        const mapped = json
          .map((item, idx) => mapRawObjectToItem(item, idx))
          .filter(Boolean);
        setParsedRows(mapped);
      } else {
        const rows = parseCSV(rawText);
        setParsedRows(rows);
      }
      toast.success('Pasted content parsed successfully');
    } catch (err) {
      toast.error('Failed to parse text. Please ensure valid CSV or JSON format.');
    }
  };

  const handleImportSubmit = async () => {
    if (!parsedRows.length) {
      toast.error('No valid content rows to import');
      return;
    }

    setLoading(true);
    try {
      const res = await importPipelineItems(pipelineId, parsedRows, activeWorkspaceId);
      toast.success(`Successfully imported ${res.count || parsedRows.length} content items!`);
      onImportSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-2xl overflow-hidden text-[var(--text)] flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-2)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/20">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-['Space_Grotesk'] text-lg font-extrabold tracking-tight text-[var(--text)]">Import Content Queue</h3>
              <p className="text-xs text-[var(--muted)]">Upload an Excel (.xlsx), CSV, or JSON file directly.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-[var(--muted)] hover:text-[var(--text)] rounded-xl hover:bg-[var(--surface-2)] transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Tabs */}
          <div className="flex gap-2 border-b border-[var(--border)] pb-3">
            <button
              onClick={() => setActiveTab('file')}
              className={`px-4 py-2 rounded-full text-xs font-semibold font-mono uppercase tracking-wider transition flex items-center gap-2 ${
                activeTab === 'file'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload File (XLSX / CSV / JSON)
            </button>
            <button
              onClick={() => setActiveTab('paste')}
              className={`px-4 py-2 rounded-full text-xs font-semibold font-mono uppercase tracking-wider transition flex items-center gap-2 ${
                activeTab === 'paste'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Paste Raw Text
            </button>
          </div>

          {activeTab === 'file' ? (
            <div className="border-2 border-dashed border-[var(--border)] rounded-2xl p-8 text-center bg-[var(--bg)] hover:border-[var(--accent)] transition">
              <input
                type="file"
                accept=".xlsx, .xls, .csv, .json, text/csv, application/json, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileUpload}
                id="file-upload-input"
                className="hidden"
              />
              <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center space-y-3">
                <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl text-[var(--accent)]">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text)]">
                    {fileName ? fileName : 'Click to upload or drag & drop Excel (.xlsx), CSV, or JSON file'}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-1">Supports columns: Post Title / Hook, Content Pillar, Caption Outline, Format, CTA</p>
                </div>
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                rows={6}
                placeholder={`Post Title / Hook, Content Pillar, Caption Outline, Format, CTA\n"How AI Streamlines Support", SaaS, Explain chatbot workflows, Story, Follow for tech tips`}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="w-full p-4 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-xs font-mono text-[var(--text)] placeholder-[var(--muted-2)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={handlePasteParse}
                className="px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)] font-mono text-xs uppercase tracking-wider rounded-full transition"
              >
                Parse Pasted Text
              </button>
            </div>
          )}

          {/* Parsed Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Preview ({parsedRows.length} items ready to import)
                </span>
                <button
                  onClick={() => setParsedRows([])}
                  className="text-xs text-[var(--muted)] hover:text-rose-400"
                >
                  Clear Preview
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto border border-[var(--border)] rounded-2xl bg-[var(--bg)] p-2 space-y-1">
                {parsedRows.map((row, idx) => (
                  <div key={idx} className="p-2.5 bg-[var(--surface)] rounded-xl text-xs flex items-center justify-between border border-[var(--border)]">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-bold text-[var(--text)] truncate">{row.titleHook}</p>
                      <p className="text-[11px] text-[var(--muted)] truncate">{row.contentPillar || 'No Pillar'} | {row.format || 'Standard'}</p>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-[var(--surface-2)] text-[var(--muted)] font-mono uppercase shrink-0">
                      {row.day || `Row ${idx + 1}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[var(--border)] flex justify-end gap-3 bg-[var(--surface-2)]">
          <button onClick={onClose} className="px-4 py-2 text-xs font-mono uppercase tracking-wider text-[var(--muted)] hover:text-[var(--text)] rounded-full">
            Cancel
          </button>
          <button
            onClick={handleImportSubmit}
            disabled={loading || parsedRows.length === 0}
            className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold font-mono text-xs uppercase tracking-wider rounded-full shadow-md transition flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Import {parsedRows.length ? `${parsedRows.length} Rows` : 'Items'} to Queue
          </button>
        </div>
      </div>
    </div>
  );
}
