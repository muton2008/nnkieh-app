"use client";
//by ai
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAdmin } from "@/components/admin-context";
import {
  createPeerAuth,
  checkAuthStatus,
  getWebAuthnRequestOptions,
  ApiError,
} from "@/lib/api-client";
import { startAuthentication } from "@simplewebauthn/browser";

// --- Types ---

type AuthStep = "requesting" | "waiting" | "approved" | "error";

interface AdminAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
}

// --- Component ---

export function AdminAuthModal({ open, onOpenChange, deviceId }: AdminAuthModalProps) {
  const { enableAdminMode } = useAdmin();
  const [step, setStep] = useState<AuthStep>("requesting");
  const [challengeCode, setChallengeCode] = useState<number | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pollToken, setPollToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef(false);

  // 清理輪詢
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // 發起授權請求
  useEffect(() => {
    if (!open) return;

    abortRef.current = false;
    setStep("requesting");
    setChallengeCode(null);
    setRequestId(null);
    setPollToken(null);
    setErrorMsg("");

    const initAuth = async () => {
      try {
        const optionsRes = await getWebAuthnRequestOptions(deviceId);
        if (!optionsRes.success || !optionsRes.options) {
          throw new Error(optionsRes.message || "無法取得發起授權的驗證挑戰");
        }

        const assertion = await startAuthentication({
          optionsJSON: optionsRes.options,
        });

        const data = await createPeerAuth(deviceId, assertion);

        if (abortRef.current) return;

        setChallengeCode(data.challengeCode);
        setRequestId(data.requestId);
        setPollToken(data.pollToken);
        setStep("waiting");
      } catch (err) {
        if (abortRef.current) return;

        const isUserCancelled =
          err instanceof Error &&
          (err.name === "NotAllowedError" || err.name === "AbortError");

        setStep("error");
        setErrorMsg(
          isUserCancelled
            ? "已取消裝置驗證，未發起授權請求"
            : err instanceof ApiError
              ? err.message
              : err instanceof Error && err.message
                ? err.message
                : "網路錯誤，請稍後再試"
        );
      }
    };

    initAuth();

    return () => {
      abortRef.current = true;
      stopPolling();
    };
  }, [open, deviceId, stopPolling]);

  // 輪詢授權狀態
  useEffect(() => {
    if (step !== "waiting" || !requestId || !pollToken) return;

    const poll = async () => {
      try {
        const data = await checkAuthStatus(requestId, deviceId, pollToken);

        if (abortRef.current) return;

        if (data.success && data.status === "approved" && data.session) {
          stopPolling();
          enableAdminMode(data.session);
          setStep("approved");
          // 自動關閉
          setTimeout(() => onOpenChange(false), 1500);
          return;
        }

        if (data.status === "expired" || data.status === "rejected") {
          stopPolling();
          setStep("error");
          setErrorMsg(data.message || "授權已過期或被拒絕");
        }
      } catch {
        // 網路暫時抖動，不中止輪詢
      }
    };

    pollingRef.current = setInterval(poll, 3000);
    poll(); // 立即先查一次

    return () => stopPolling();
  }, [step, requestId, deviceId, pollToken, stopPolling, enableAdminMode, onOpenChange]);

  const handleClose = () => {
    stopPolling();
    abortRef.current = true;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-[380px] rounded-sm p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-serif text-lg text-foreground">管理員授權</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground font-light">
            請將此畫面出示給另一位管理員進行雙人驗證
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-8 flex flex-col items-center justify-center min-h-[200px] border-t border-dashed border-border">
          <AnimatePresence mode="wait">
            {/* Step: Requesting */}
            {step === "requesting" && (
              <motion.div
                key="requesting"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center gap-3"
              >
                <Loader2 size={32} className="animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground font-light">正在發起授權請求...</p>
              </motion.div>
            )}

            {/* Step: Waiting — show challenge code */}
            {step === "waiting" && challengeCode && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck size={18} />
                  <span className="text-xs font-light">請告知核准端輸入此驗證碼</span>
                </div>
                <p className="text-5xl font-bold text-foreground tracking-[0.2em] tabular-nums font-serif">
                  {challengeCode}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 size={14} className="animate-spin text-muted-foreground/50" />
                  <span className="text-[11px] text-muted-foreground/50 font-light">等待核准中...</span>
                </div>
              </motion.div>
            )}

            {/* Step: Approved */}
            {step === "approved" && (
              <motion.div
                key="approved"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
                >
                  <ShieldCheck size={48} className="text-green-500" />
                </motion.div>
                <p className="text-sm font-medium text-green-600">授權成功！</p>
                <p className="text-xs text-muted-foreground font-light">即將進入管理模式</p>
              </motion.div>
            )}

            {/* Step: Error */}
            {step === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center gap-3"
              >
                <ShieldX size={40} className="text-red-400" />
                <p className="text-sm text-red-500 text-center">{errorMsg}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  className="rounded-sm mt-2"
                >
                  關閉
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer: cancel during waiting */}
        {step === "waiting" && (
          <div className="px-6 py-3 border-t border-border">
            <Button
              variant="outline"
              onClick={handleClose}
              className="w-full rounded-sm"
            >
              取消
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
