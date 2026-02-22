"use client";
//by ai
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ShieldCheck, ShieldAlert, AlertCircle, User, Clock } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";

// --- Types ---

type ApproveStep =
  | "fetch-pending"
  | "no-pending"
  | "select-pending"
  | "input"
  | "submitting"
  | "success"
  | "conflict"
  | "error";

interface PendingRequest {
  id: string;
  requester_name: string;
  created_at: string;
  expires_at: string;
}

interface ApproveDrawerProps {
  /** 來自 URL 參數或 FCM 的 auth request ID */
  authRequestId: string | null;
  /** 當前裝置的 device_id */
  deviceId: string;
  /** 由長按等手動觸發開啟（無預設 requestId，需自動撈取） */
  forceOpen?: boolean;
  /** 關閉時清除 URL 參數等 */
  onClose: () => void;
}

// --- Component ---

export function ApproveDrawer({
  authRequestId,
  deviceId,
  forceOpen = false,
  onClose,
}: ApproveDrawerProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ApproveStep>("input");
  const [otpValue, setOtpValue] = useState("");
  const [message, setMessage] = useState("");
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // 實際用於提交的 requestId
  const effectiveRequestId = authRequestId || selectedRequestId;

  // 當 authRequestId 變化時自動開啟（來自 URL / FCM）
  useEffect(() => {
    if (authRequestId) {
      setOpen(true);
      setStep("input");
      setOtpValue("");
      setMessage("");
      setSelectedRequestId(null);
    }
  }, [authRequestId]);

  // 當 forceOpen 變化時開啟 → 自動撈取 pending 請求
  useEffect(() => {
    if (forceOpen && !authRequestId) {
      fetchedRef.current = false;
      setOpen(true);
      setStep("fetch-pending");
      setOtpValue("");
      setMessage("");
      setSelectedRequestId(null);
      setPendingRequests([]);
      fetchPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen]);

  const fetchPending = async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    try {
      const res = await fetch(`/api/auth/pending?device_id=${deviceId}`);
      const data = await res.json();

      if (data.success && data.requests && data.requests.length > 0) {
        setPendingRequests(data.requests);
        if (data.requests.length === 1) {
          // 僅一筆：自動選取，直接進入 OTP 輸入
          setSelectedRequestId(data.requests[0].id);
          setStep("input");
        } else {
          // 多筆：讓使用者選擇
          setStep("select-pending");
        }
      } else {
        setStep("no-pending");
      }
    } catch {
      setStep("no-pending");
    }
  };

  const handleSelectRequest = (req: PendingRequest) => {
    setSelectedRequestId(req.id);
    setOtpValue("");
    setStep("input");
  };

  const handleClose = useCallback(() => {
    setOpen(false);
    setOtpValue("");
    setStep("input");
    setMessage("");
    setSelectedRequestId(null);
    setPendingRequests([]);
    fetchedRef.current = false;
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!effectiveRequestId || otpValue.length !== 4) return;

    setStep("submitting");

    try {
      const res = await fetch("/api/auth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: effectiveRequestId,
          inputCode: otpValue,
          admin_device_id: deviceId,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setStep("conflict");
        setMessage(data.message || "此請求已由其他管理員處理");
        return;
      }

      if (!res.ok || !data.success) {
        setStep("error");
        setMessage(data.message || "核准失敗");
        return;
      }

      setStep("success");
      setMessage("核准成功！");
      setTimeout(handleClose, 2000);
    } catch {
      setStep("error");
      setMessage("網路錯誤，請稍後再試");
    }
  }, [effectiveRequestId, otpValue, deviceId, handleClose]);

  // OTP 填滿後自動提交
  useEffect(() => {
    if (otpValue.length === 4 && step === "input") {
      handleSubmit();
    }
  }, [otpValue, step, handleSubmit]);

  // 時間格式化
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DrawerContent className="max-w-[450px] mx-auto">
        <DrawerHeader className="text-center">
          <DrawerTitle className="font-serif text-lg">
            <ShieldAlert size={20} className="inline mr-2 text-amber-500" />
            授權核准
          </DrawerTitle>
          <DrawerDescription className="text-xs font-light">
            {step === "fetch-pending" || step === "select-pending" || step === "no-pending"
              ? "正在查詢待核准的授權請求"
              : "請輸入對方螢幕上的 4 位數驗證碼"}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-6 py-6 flex flex-col items-center min-h-[160px]">
          <AnimatePresence mode="wait">
            {/* Fetching pending requests */}
            {step === "fetch-pending" && (
              <motion.div
                key="fetch-pending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <Loader2 size={32} className="animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground font-light">查詢中...</p>
              </motion.div>
            )}

            {/* No pending requests */}
            {step === "no-pending" && (
              <motion.div
                key="no-pending"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <ShieldAlert size={40} className="text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground text-center">
                  目前沒有待核准的授權請求
                </p>
                <p className="text-[11px] text-muted-foreground/50 font-light text-center">
                  請等待其他管理員發起請求後再試
                </p>
              </motion.div>
            )}

            {/* Select from multiple pending requests */}
            {step === "select-pending" && (
              <motion.div
                key="select-pending"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="w-full space-y-2"
              >
                <p className="text-xs text-muted-foreground font-light text-center mb-3">
                  有 {pendingRequests.length} 筆待核准請求，請選擇：
                </p>
                {pendingRequests.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => handleSelectRequest(req)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-sm hover:border-amber-300 transition-colors text-left"
                  >
                    <User size={16} className="text-amber-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {req.requester_name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={10} className="text-muted-foreground/40" />
                        <span className="text-[10px] text-muted-foreground/40 font-light">
                          {formatTime(req.created_at)} 發起
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}

            {/* OTP Input step */}
            {step === "input" && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center gap-5"
              >
                {/* 如果是手動選的請求，顯示請求人 */}
                {selectedRequestId && !authRequestId && pendingRequests.length > 0 && (
                  <p className="text-xs text-muted-foreground font-light">
                    核准對象：
                    <span className="text-foreground font-medium ml-1">
                      {pendingRequests.find((r) => r.id === selectedRequestId)?.requester_name}
                    </span>
                  </p>
                )}
                <InputOTP
                  maxLength={4}
                  value={otpValue}
                  onChange={setOtpValue}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="w-14 h-14 text-2xl font-bold" />
                    <InputOTPSlot index={1} className="w-14 h-14 text-2xl font-bold" />
                    <InputOTPSlot index={2} className="w-14 h-14 text-2xl font-bold" />
                    <InputOTPSlot index={3} className="w-14 h-14 text-2xl font-bold" />
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-[11px] text-muted-foreground/50 font-light">
                  輸入完成後將自動送出
                </p>
              </motion.div>
            )}

            {/* Submitting */}
            {step === "submitting" && (
              <motion.div
                key="submitting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <Loader2 size={32} className="animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground font-light">驗證中...</p>
              </motion.div>
            )}

            {/* Success */}
            {step === "success" && (
              <motion.div
                key="success"
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
                <p className="text-sm font-medium text-green-600">{message}</p>
              </motion.div>
            )}

            {/* Conflict (409) */}
            {step === "conflict" && (
              <motion.div
                key="conflict"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <AlertCircle size={40} className="text-amber-500" />
                <p className="text-sm text-amber-600 text-center">{message}</p>
              </motion.div>
            )}

            {/* Error */}
            {step === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <AlertCircle size={40} className="text-red-400" />
                <p className="text-sm text-red-500 text-center">{message}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStep("input");
                    setOtpValue("");
                  }}
                  className="rounded-sm mt-1"
                >
                  重新輸入
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DrawerFooter>
          <Button variant="outline" onClick={handleClose} className="rounded-sm">
            關閉
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
