import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Upload, FileText, Trash2, Plus } from 'lucide-react';
import { PageHeader, StatusBadge, EmptyState, SkeletonCard, useToast, ProjectSelector } from '../components/shared';
import { formatFileSize, STATUS_COLORS } from '../constants';

const DOC_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  processing: 'bg-sky-100 text-sky-700',
  indexed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export function KnowledgeBasePage() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState(searchParams.get('projectId') || '');
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getProjects().then((p: any) => {
      setProjects(p);
      if (!selectedProject && p.length > 0) setSelectedProject(p[0].id);
    });
  }, []);

  useEffect(() => {
    if (selectedProject) fetchDocuments();
  }, [selectedProject]);

  const fetchDocuments = () => {
    setLoading(true);
    api.getDocuments(selectedProject).then((data: any) => setDocuments(data || []))
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false));
  };

  const uploadFile = async (file: File) => {
    if (!file || !selectedProject) return;
    setUploading(true);
    try {
      await api.uploadDocument(selectedProject, file);
      toast('Document uploaded successfully');
      fetchDocuments();
    } catch { toast('Failed to upload document', 'error'); }
    finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    try {
      await api.deleteDocument(id);
      setDocuments((docs) => docs.filter((d) => d.id !== id));
      toast('Document deleted');
    } catch { toast('Failed to delete document', 'error'); }
  };

  return (
    <div className="animate-page-in">
      <PageHeader title="Knowledge Base" subtitle="Upload documents for the Functional Agent to reference" />
      <div className="flex justify-end mb-4">
        <ProjectSelector projects={projects} value={selectedProject} onChange={setSelectedProject} placeholder="Select a project..." />
      </div>

      {/* Drag-and-drop upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-6 ${
          dragging ? 'border-sky-500 bg-sky-50' : 'border-gray-300 hover:border-sky-400 hover:bg-sky-50/50'}`}
      >
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={handleUpload} className="hidden" />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
            <p className="text-sm text-gray-600">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">
              {dragging ? 'Drop file here' : 'Drag & drop or click to upload'}
            </p>
            <p className="text-xs text-gray-400">Supports PDF, DOCX, TXT, and Markdown files</p>
          </div>
        )}
      </div>

      {/* Document list */}
      {loading ? (
        <div className="stagger-children space-y-3">
          {[0,1,2].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet"
          subtitle="Upload PDF, DOCX, TXT, or Markdown files to build your knowledge base."
          action={{ label: 'Upload Document', onClick: () => fileInputRef.current?.click() }} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden stagger-children">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between px-5 py-4 animate-stagger-in">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">{doc.fileName}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {doc.fileType && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded-full font-medium bg-gray-100 text-gray-600 uppercase">{doc.fileType}</span>
                    )}
                    <StatusBadge status={doc.status} colorMap={DOC_STATUS_COLORS} />
                    {doc.chunkCount !== undefined && <span className="text-xs text-gray-400">{doc.chunkCount} chunks</span>}
                    <span className="text-xs text-gray-400">{formatFileSize(doc.fileSize)}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => handleDelete(doc.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
