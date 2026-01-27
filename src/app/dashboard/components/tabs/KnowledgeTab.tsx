"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Database,
  Plus,
  Edit3,
  Trash2,
  Save,
  Upload,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { useAgent, type CustomKnowledge } from "../AgentContext";
import { SectionCard, ProFeatureLock } from "../shared";

export function KnowledgeTab() {
  const {
    agent,
    company,
    isProOrHigher,
    customKnowledges,
    setCustomKnowledges,
    fetchCustomKnowledge,
  } = useAgent();

  const [showModal, setShowModal] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<CustomKnowledge | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Load knowledge on mount
  useEffect(() => {
    if (agent?.companyId && isProOrHigher) {
      fetchCustomKnowledge(agent.companyId);
    }
  }, [agent?.companyId, isProOrHigher, fetchCustomKnowledge]);

  const handleSave = async () => {
    if (!agent?.companyId || !title.trim() || !content.trim()) return;

    if (content.length > 3000) {
      alert("コンテンツは3000文字以内にしてください");
      return;
    }

    setSaving(true);
    try {
      const method = editingKnowledge ? "PUT" : "POST";
      const body = editingKnowledge
        ? {
            companyId: agent.companyId,
            knowledgeId: editingKnowledge.knowledgeId,
            title,
            content,
          }
        : { companyId: agent.companyId, title, content };

      const res = await fetch("/api/knowledge", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingKnowledge(null);
        setTitle("");
        setContent("");
        await fetchCustomKnowledge(agent.companyId);
      } else {
        const data = await res.json();
        alert(data.error || "保存に失敗しました");
      }
    } catch (error) {
      console.error("Failed to save knowledge:", error);
      alert("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (knowledgeId: string) => {
    if (!agent?.companyId || !confirm("このナレッジを削除しますか？")) return;

    try {
      const res = await fetch(
        `/api/knowledge?companyId=${agent.companyId}&knowledgeId=${knowledgeId}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        await fetchCustomKnowledge(agent.companyId);
      } else {
        alert("削除に失敗しました");
      }
    } catch (error) {
      console.error("Failed to delete knowledge:", error);
      alert("削除に失敗しました");
    }
  };

  const handleEdit = (knowledge: CustomKnowledge) => {
    setEditingKnowledge(knowledge);
    setTitle(knowledge.title);
    setContent(knowledge.content);
    setShowModal(true);
  };

  const handleFileUpload = async (file: File) => {
    if (!agent?.companyId) return;

    const allowedTypes = [".pdf", ".docx", ".txt", ".md"];
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
      alert("対応形式: PDF, DOCX, TXT, MD のみアップロード可能です");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      alert("ファイルサイズは20MB以下にしてください");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", agent.companyId);

      const res = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        alert(`${data.message}\n（${data.totalCharacters}文字を読み込みました）`);
        await fetchCustomKnowledge(agent.companyId);
        setShowModal(false);
        setTitle("");
        setContent("");
      } else {
        alert(data.error || "アップロードに失敗しました");
      }
    } catch (error) {
      console.error("Failed to upload file:", error);
      alert("アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    e.target.value = "";
  };

  if (!agent || !company) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <ProFeatureLock isLocked={!isProOrHigher}>
      <SectionCard
        title="カスタムナレッジ"
        description="AIが参照する独自の情報を追加できます"
        icon={<Database className="w-5 h-5" />}
        headerAction={
          <button
            onClick={() => {
              setEditingKnowledge(null);
              setTitle("");
              setContent("");
              setShowModal(true);
            }}
            className="flex items-center gap-1 text-sm text-rose-600 hover:text-rose-700"
          >
            <Plus className="w-4 h-4" />
            追加
          </button>
        }
      >
        {customKnowledges.length === 0 ? (
          <div className="text-center py-8">
            <Database className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500">カスタムナレッジがありません</p>
            <p className="text-sm text-slate-400 mt-1">
              AIが参照する独自の情報を追加しましょう
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {customKnowledges.map((knowledge) => (
              <div
                key={knowledge.knowledgeId}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-slate-700 truncate">{knowledge.title}</h4>
                  <p className="text-sm text-slate-500 truncate">{knowledge.content.slice(0, 100)}...</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(knowledge.updatedAt).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={() => handleEdit(knowledge)}
                    className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white rounded-lg transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(knowledge.knowledgeId)}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-white rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800">
                  {editingKnowledge ? "ナレッジを編集" : "ナレッジを追加"}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* File upload area */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
                className={`border-2 border-dashed rounded-xl p-6 mb-4 text-center transition-all ${
                  isDragging
                    ? "border-rose-500 bg-rose-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {uploading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto" />
                ) : (
                  <>
                    <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">
                      ファイルをドロップするか、
                      <label className="text-rose-600 cursor-pointer hover:text-rose-700">
                        クリックして選択
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt,.md"
                          onChange={handleInputChange}
                          className="hidden"
                        />
                      </label>
                    </p>
                    <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, MD (最大20MB)</p>
                  </>
                )}
              </div>

              <div className="text-center text-sm text-slate-400 mb-4">または手動で入力</div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    タイトル
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例: 料金プラン、返品ポリシー"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    内容
                    <span className="text-slate-400 font-normal ml-2">
                      {content.length}/3000文字
                    </span>
                  </label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={8}
                    placeholder="AIが参照する情報を入力..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !title.trim() || !content.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ProFeatureLock>
  );
}
