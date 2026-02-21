"use client";
//by ai
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ShieldCheck, ShieldAlert, AlertCircle } from "lucide-react";
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

type ApproveStep = "input" | "submitting" | "success" | "conflict" | "error";

interface ApproveDrawerProps {
  /** 來自 URL 參數或 FCM 的 auth request ID */
  authRequestId: string | null;
  /** 當前裝置的 device_id */
  deviceId: string;
  /** 關閉時清除 URL 參數等 */
  onClose: () => void;
}

// --- Component ---

export function ApproveDrawer({ authRequestId, deviceId, onClose }: ApproveDrawerProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ApproveStep>("input");
  const [otpValue, setOtpValue] = useState("");
  const [message, setMessage] = useState("");

  // 當 authRequestId 變化時自動開啟
  useEffect(() => {
    if (authRequestId) {
      setOpen(true);
      setStep("input");
      setOtpValue("");
      setMessage("");
    }
  }, [authRequestId]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setOtpValue("");
    setStep("input");
    setMessage("");
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!authRequestId || otpValue.length !== 4) return;

    setStep("submitting");

    try {
      const res = await fetch("/api/auth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: authRequestId,
          inputCode: otpValue,
          admin_device_id: deviceId,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // 衝突：已被其他管理員處理
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
      // 延遲關閉
      setTimeout(handleClose, 2000);
    } catch {
      setStep("error");
      setMessage("網路錯誤，請稍後再試");
    }
  }, [authRequestId, otpValue, deviceId, handleClose]);

  // OTP 填滿後自動提交
  useEffect(() => {
    if (otpValue.length === 4 && step === "input") {
      handleSubmit();
    }
  }, [otpValue, step, handleSubmit]);

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DrawerContent className="max-w-[450px] mx-auto">
        <DrawerHeader className="text-center">
          <DrawerTitle className="font-serif text-lg">
            <ShieldAlert size={20} className="inline mr-2 text-amber-500" />
            授權核准
          </DrawerTitle>
          <DrawerDescription className="text-xs font-light">
            請輸入對方螢幕上的 4 位數驗證碼
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-6 py-6 flex flex-col items-center min-h-[160px]">
          <AnimatePresence mode="wait">
            {/* Input step */}
            {step === "input" && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center gap-5"
              >
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
