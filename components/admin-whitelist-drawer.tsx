"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAdmin } from "@/components/admin-context";
import {
  fetchAdminWhitelist,
  manageAdminWhitelist,
  handoverSuperAdmin,
} from "@/lib/api-client";
import type { AdminUser, AdminRole } from "@/lib/types/calendar";
import {
  UserPlus,
  Trash2,
  Shield,
  ShieldCheck,
  Crown,
  ArrowRightLeft,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  X,
} from "lucide-react";

// --- 角色標籤 ---
const ROLE_META: Record<AdminRole, { label: string; color: string; icon: typeof Shield }> = {
  super_admin: { label: "會長", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Crown },
  admin: { label: "副會長/部長", color: "bg-blue-100 text-blue-700 border-blue-300", icon: ShieldCheck },
  editor: { label: "組員", color: "bg-gray-100 text-gray-600 border-gray-300", icon: Shield },
};

// --- Props ---
interface AdminWhitelistDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// --- Component ---
export function AdminWhitelistDrawer({ open, onOpenChange }: AdminWhitelistDrawerProps) {
  const isMobile = useIsMobile();
  const { session, disableAdminMode } = useAdmin();

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [currentRole, setCurrentRole] = useState<AdminRole>("editor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 新增 / 編輯表單
  const [showAddForm, setShowAddForm] = useState(false);
  const [formDeviceId, setFormDeviceId] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<AdminRole>("editor");
  const [saving, setSaving] = useState(false);

  // 移交確認
  const [handoverTarget, setHandoverTarget] = useState<AdminUser | null>(null);
  const [handoverConfirm, setHandoverConfirm] = useState(false);
  const [handoverLoading, setHandoverLoading] = useState(false);

  // 刪除確認
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // --- 載入白名單 ---
  const loadWhitelist = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminWhitelist(session);
      if (res.success) {
        setAdmins(res.admins);
        setCurrentRole(res.currentRole);
      } else {
        setError("載入失敗");
      }
    } catch (e: any) {
      setError(e.message || "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (open) loadWhitelist();
  }, [open, loadWhitelist]);

  // --- 新增成員 ---
  const handleAdd = async () => {
    if (!session || !formDeviceId.trim() || !formName.trim()) return;
    setSaving(true);
    try {
      const res = await manageAdminWhitelist(session, {
        action: "add",
        target_device_id: formDeviceId.trim(),
        target_name: formName.trim(),
        target_role: formRole,
      });
      if (res.success) {
        setShowAddForm(false);
        setFormDeviceId("");
        setFormName("");
        setFormRole("editor");
        await loadWhitelist();
      } else {
        setError(res.message || "新增失敗");
      }
    } catch (e: any) {
      setError(e.message || "新增失敗");
    } finally {
      setSaving(false);
    }
  };

  // --- 移除成員（即時撤銷）---
  const handleRemove = async () => {
    if (!session || !deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await manageAdminWhitelist(session, {
        action: "remove",
        target_device_id: deleteTarget.device_id,
      });
      if (res.success) {
        setDeleteTarget(null);
        await loadWhitelist();
      } else {
        setError(res.message || "移除失敗");
      }
    } catch (e: any) {
      setError(e.message || "移除失敗");
    } finally {
      setDeleteLoading(false);
    }
  };

  // --- 職位移交 ---
  const handleHandover = async () => {
    if (!session || !handoverTarget) return;
    setHandoverLoading(true);
    try {
      const res = await handoverSuperAdmin(session, handoverTarget.device_id);
      if (res.success) {
        setHandoverTarget(null);
        setHandoverConfirm(false);
        // 移交後，舊會長的 session 已無效，強制登出管理模式
        disableAdminMode();
        onOpenChange(false);
        alert(`職位已成功移交給 ${handoverTarget.name}。你的管理模式已結束，需重新授權。`);
      } else {
        setError(res.message || "移交失敗");
      }
    } catch (e: any) {
      setError(e.message || "移交失敗");
    } finally {
      setHandoverLoading(false);
    }
  };

  const isSuperAdmin = currentRole === "super_admin";

  // --- 內容 ---
  const content = (
    <div className="flex flex-col gap-4">
      {/* 錯誤訊息 */}
      {error && (
        <div className="mx-5 px-3 py-2.5 bg-red-50 border border-red-200/60 rounded-lg flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-600">{error}</p>
          <button onClick={() => setError("")} className="ml-auto text-red-400">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 成員列表 */}
      <div className="px-5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : admins.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">白名單為空</p>
        ) : (
          <div className="space-y-2">
            {admins.map((admin) => {
              const meta = ROLE_META[admin.role];
              const RoleIcon = meta.icon;
              const isMe = admin.device_id === session?.deviceId;

              return (
                <div
                  key={admin.device_id}
                  className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 bg-card"
                >
                  <div className="flex-shrink-0">
                    <RoleIcon size={18} className={admin.role === "super_admin" ? "text-amber-500" : "text-muted-foreground"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {admin.name}
                      </span>
                      {isMe && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">你</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.color}`}>
                        {meta.label}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground/50 font-mono truncate">
                        {admin.device_id.slice(0, 8)}...
                      </span>
                    </div>
                  </div>

                  {/* 操作按鈕：僅 super_admin 可操作非自己的成員 */}
                  {isSuperAdmin && !isMe && (
                    <div className="flex items-center gap-1">
                      {/* 移交按鈕 */}
                      <button
                        onClick={() => {
                          setHandoverTarget(admin);
                          setHandoverConfirm(false);
                        }}
                        className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-amber-600 hover:bg-amber-50 active:bg-amber-100 transition-colors"
                        title="移交會長職位"
                      >
                        <ArrowRightLeft size={14} />
                      </button>
                      {/* 刪除按鈕 */}
                      <button
                        onClick={() => setDeleteTarget(admin)}
                        className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors"
                        title="移除成員"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 新增成員按鈕 */}
      {isSuperAdmin && !showAddForm && (
        <div className="px-5">
          <Button
            variant="outline"
            className="w-full rounded-xl h-12 text-sm font-medium"
            onClick={() => setShowAddForm(true)}
          >
            <UserPlus size={16} className="mr-2" />
            新增管理員
          </Button>
        </div>
      )}

      {/* 新增表單 */}
      {showAddForm && (
        <div className="px-5 space-y-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground font-light">新增管理員</p>
          <div>
            <label className="text-xs text-muted-foreground font-light block mb-1">裝置 UUID *</label>
            <input
              type="text"
              value={formDeviceId}
              onChange={(e) => setFormDeviceId(e.target.value)}
              placeholder="貼上對方的裝置 UUID"
              className="w-full border border-border rounded-lg px-3 py-3 text-xs text-foreground bg-background placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-light block mb-1">顯示名稱 *</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="例如：公關組長"
              className="w-full border border-border rounded-lg px-3 py-3 text-base text-foreground bg-background placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-light block mb-1.5">角色</label>
            <div className="flex gap-2">
              {(["admin", "editor"] as AdminRole[]).map((role) => {
                const meta = ROLE_META[role];
                return (
                  <button
                    key={role}
                    onClick={() => setFormRole(role)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs min-h-[44px] transition-all ${
                      formRole === role
                        ? meta.color + " font-medium border-current"
                        : "border-border text-muted-foreground font-light hover:border-foreground/20 active:bg-foreground/5"
                    }`}
                  >
                    <meta.icon size={13} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-12 text-sm"
              onClick={() => {
                setShowAddForm(false);
                setFormDeviceId("");
                setFormName("");
                setFormRole("editor");
              }}
            >
              取消
            </Button>
            <Button
              className="flex-1 rounded-xl h-12 text-sm"
              onClick={handleAdd}
              disabled={saving || !formDeviceId.trim() || !formName.trim()}
            >
              {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <UserPlus size={14} className="mr-1.5" />}
              {saving ? "新增中..." : "確認新增"}
            </Button>
          </div>
        </div>
      )}

      {/* 底部留白 */}
      <div className="h-[calc(1rem+env(safe-area-inset-bottom,0px))]" />
    </div>
  );

  // --- 移除確認 Dialog ---
  const deleteConfirmDialog = deleteTarget && (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
      <DialogContent className="max-w-[340px] rounded-xl p-6">
        <DialogHeader>
          <DialogTitle className="font-serif text-base flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" />
            確認移除
          </DialogTitle>
          <DialogDescription className="text-xs font-light">
            確定要移除 <strong>{deleteTarget.name}</strong> 嗎？
          </DialogDescription>
        </DialogHeader>
        <div className="bg-red-50 border border-red-200/60 rounded-lg px-3 py-3 mt-2">
          <p className="text-xs text-red-700 leading-relaxed">
            移除後將立即撤銷該成員的所有管理權限與進行中的授權，此操作無法復原。
          </p>
        </div>
        <div className="flex gap-3 mt-4">
          <Button
            variant="outline"
            className="flex-1 rounded-xl h-12"
            onClick={() => setDeleteTarget(null)}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            className="flex-1 rounded-xl h-12"
            onClick={handleRemove}
            disabled={deleteLoading}
          >
            {deleteLoading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Trash2 size={14} className="mr-1.5" />}
            {deleteLoading ? "移除中..." : "確認移除"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // --- 移交確認 Dialog ---
  const handoverDialog = handoverTarget && (
    <Dialog open={!!handoverTarget} onOpenChange={(o) => { if (!o) { setHandoverTarget(null); setHandoverConfirm(false); } }}>
      <DialogContent className="max-w-[340px] rounded-xl p-6">
        <DialogHeader>
          <DialogTitle className="font-serif text-base flex items-center gap-2">
            <Crown size={18} className="text-amber-500" />
            職位移交
          </DialogTitle>
          <DialogDescription className="text-xs font-light">
            將會長職位移交給 <strong>{handoverTarget.name}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="bg-amber-50 border border-amber-200/60 rounded-lg px-3 py-3 mt-2 space-y-2">
          <p className="text-xs text-amber-800 leading-relaxed">
            ⚠️ 移交後你將降級為普通管理員，此操作不可自行撤回。
          </p>
          <p className="text-xs text-amber-700 leading-relaxed">
            移交完成後你的管理模式將自動結束，需要重新取得授權才能繼續編輯。
          </p>
        </div>
        {!handoverConfirm ? (
          <Button
            className="w-full rounded-xl h-12 mt-3 bg-amber-500 hover:bg-amber-600 text-white"
            onClick={() => setHandoverConfirm(true)}
          >
            我了解風險，繼續移交
          </Button>
        ) : (
          <div className="flex gap-3 mt-3">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-12"
              onClick={() => { setHandoverTarget(null); setHandoverConfirm(false); }}
            >
              取消
            </Button>
            <Button
              className="flex-1 rounded-xl h-12 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleHandover}
              disabled={handoverLoading}
            >
              {handoverLoading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <ArrowRightLeft size={14} className="mr-1.5" />}
              {handoverLoading ? "移交中..." : "確認移交"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  // --- 渲染 ---
  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="rounded-t-xl max-h-[85vh]">
            <DrawerHeader className="px-5 pt-2 pb-3 text-left">
              <DrawerTitle className="font-serif text-lg">管理員白名單</DrawerTitle>
              <DrawerDescription className="text-xs font-light">
                {isSuperAdmin ? "管理成員權限、移除成員或移交會長職位" : "查看目前管理員名單"}
              </DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto overscroll-contain flex-1 pb-2">
              {content}
            </div>
          </DrawerContent>
        </Drawer>
        {deleteConfirmDialog}
        {handoverDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[440px] rounded-xl p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle className="font-serif text-lg">管理員白名單</DialogTitle>
            <DialogDescription className="text-xs font-light">
              {isSuperAdmin ? "管理成員權限、移除成員或移交會長職位" : "查看目前管理員名單"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pb-6">
            {content}
          </div>
        </DialogContent>
      </Dialog>
      {deleteConfirmDialog}
      {handoverDialog}
    </>
  );
}
