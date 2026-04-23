"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	Loader2,
	ShieldCheck,
	ShieldAlert,
	AlertCircle,
	User,
	Clock,
	Fingerprint,
	Link,
} from "lucide-react";
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
import {
	fetchPendingRequests,
	approvePeerAuth,
	getWebAuthnAuthOptions,
	getWebAuthnPendingOptions,
	getWebAuthnRegistrationStatus,
	getWebAuthnRegistrationOptions,
	verifyWebAuthnRegistration,
	ApiError,
} from "@/lib/api-client";
import { useAdmin } from "@/components/admin-context";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PendingRequestItem } from "@/lib/types/api";

type ApproveStep =
	| "fetch-pending"
	| "select-pending"
	| "input"
	| "registering"
	| "submitting"
	| "success"
	| "conflict"
	| "locked"
	| "error";

interface ApproveDrawerProps {
	authRequestId: string | null;
	deviceId: string;
	forceOpen?: boolean;
	onClose: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof ApiError) return error.message || fallback;
	if (error instanceof Error && error.message) return error.message;
	return fallback;
}

export function ApproveDrawer({
	authRequestId,
	deviceId,
	forceOpen = false,
	onClose,
}: ApproveDrawerProps) {
	const { enableAdminMode, session } = useAdmin();
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<ApproveStep>("input");
	const [otpValue, setOtpValue] = useState("");
	const [message, setMessage] = useState("");
	const [isWebAuthnBound, setIsWebAuthnBound] = useState(false);
	const [pendingRequests, setPendingRequests] = useState<PendingRequestItem[]>([]);
	const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
	const fetchedRef = useRef(false);

	const effectiveRequestId = authRequestId || selectedRequestId;

	const refreshBindingStatus = useCallback(async () => {
		try {
			const status = await getWebAuthnRegistrationStatus(deviceId);
			if (status.success) {
				setIsWebAuthnBound(status.bound);
			}
		} catch {
			// ignore status fetch failures; keep UI usable
		}
	}, [deviceId]);

	useEffect(() => {
		if (authRequestId) {
			setOpen(true);
			setStep("input");
			setOtpValue("");
			setMessage("");
			setSelectedRequestId(null);
			void refreshBindingStatus();
		}
	}, [authRequestId, refreshBindingStatus]);

	useEffect(() => {
		if (forceOpen && !authRequestId) {
			fetchedRef.current = false;
			setOpen(true);
			setStep("fetch-pending");
			setOtpValue("");
			setMessage("");
			setSelectedRequestId(null);
			setPendingRequests([]);
			void refreshBindingStatus();
			fetchPending();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [forceOpen, authRequestId, refreshBindingStatus]);

	const fetchPending = async () => {
		if (fetchedRef.current) return;
		fetchedRef.current = true;

		try {
			const pendingOptions = await getWebAuthnPendingOptions(deviceId);
			if (!pendingOptions.success || !pendingOptions.options) {
				throw new Error(pendingOptions.message || "無法取得待核准清單驗證挑戰");
			}

			const pendingAssertion = await startAuthentication({
				optionsJSON: pendingOptions.options,
			});

			const data = await fetchPendingRequests(deviceId, pendingAssertion);

			if (data.success && data.requests && data.requests.length > 0) {
				setPendingRequests(data.requests);
				if (data.requests.length === 1) {
					setSelectedRequestId(data.requests[0].id);
					setStep("input");
				} else {
					setStep("select-pending");
				}
			} else {
				setStep("input");
				setMessage(data.message || "目前沒有待核准請求");
			}
		} catch (error: unknown) {
			const isUserCancelled =
				error instanceof Error &&
				((error as Error & { name?: string }).name === "NotAllowedError" ||
					(error as Error & { name?: string }).name === "AbortError");

			setStep("input");
			setMessage(
				isUserCancelled
					? "已取消驗證，未載入待核准清單"
					: getErrorMessage(error, "載入待核准清單失敗")
			);
		}
	};

	const handleSelectRequest = (req: PendingRequestItem) => {
		setSelectedRequestId(req.id);
		setOtpValue("");
		setMessage("");
		setStep("input");
	};

	const handleClose = useCallback(() => {
		setOpen(false);
		setOtpValue("");
		setStep("input");
		setMessage("");
		setIsWebAuthnBound(false);
		setSelectedRequestId(null);
		setPendingRequests([]);
		fetchedRef.current = false;
		onClose();
	}, [onClose]);

	const handleRegisterWebAuthn = useCallback(async () => {
		if (isWebAuthnBound) {
			setMessage("此裝置已綁定 WebAuthn");
			return;
		}

		if (!session || session.deviceId !== deviceId) {
			setStep("input");
			setMessage("請先完成管理員授權登入，再進行首次 WebAuthn 綁定");
			return;
		}

		setStep("registering");
		setMessage("");

		try {
			const optionsRes = await getWebAuthnRegistrationOptions(deviceId);
			if (!optionsRes.success || !optionsRes.options) {
				if (optionsRes.alreadyBound) {
					setIsWebAuthnBound(true);
					setStep("input");
					setMessage(optionsRes.message || "此裝置已綁定 WebAuthn");
					return;
				}
				throw new Error(optionsRes.message || "無法取得 WebAuthn 註冊資訊");
			}

			const registrationResponse = await startRegistration({
				optionsJSON: optionsRes.options,
			});

			const verifyRes = await verifyWebAuthnRegistration({
				admin_device_id: deviceId,
				registration_response: registrationResponse,
			});

			if (!verifyRes.success) {
				throw new Error(verifyRes.message || "WebAuthn 綁定失敗");
			}

			setIsWebAuthnBound(true);
			setStep("input");
			setMessage("裝置綁定完成，現在可以輸入挑戰碼核准。\n核准時會要求裝置驗證。");
		} catch (error: unknown) {
			const isUserCancelled =
				error instanceof Error &&
				("name" in error) &&
				((error as Error & { name?: string }).name === "NotAllowedError" ||
					(error as Error & { name?: string }).name === "AbortError");

			if (isUserCancelled) {
				setStep("input");
				setMessage("已取消綁定，未做任何變更");
				return;
			}

			setStep("error");
			setMessage(getErrorMessage(error, "WebAuthn 綁定失敗，請稍後再試"));
		}
	}, [deviceId, isWebAuthnBound, session]);

	const handleSubmit = useCallback(async () => {
		if (otpValue.length !== 6) return;

		const isReviewCode = otpValue === "000000" && !effectiveRequestId;
		const submitRequestId = isReviewCode ? "__review__" : effectiveRequestId;

		if (!submitRequestId) {
			setStep("error");
			setMessage("請先選擇待核准請求，或從通知直接開啟");
			return;
		}

		setStep("submitting");
		setMessage("");

		try {
			if (isReviewCode) {
				const data = await approvePeerAuth("__review__", otpValue, deviceId);
				if (data.success && (data as any).reviewSession) {
					enableAdminMode((data as any).reviewSession);
					setStep("success");
					setMessage("體驗模式已啟用");
					setTimeout(handleClose, 1500);
					return;
				}

				setStep("error");
				setMessage(data.message || "體驗模式驗證失敗");
				return;
			}

			const authOptionsRes = await getWebAuthnAuthOptions(submitRequestId, deviceId);
			if (!authOptionsRes.success || !authOptionsRes.options) {
				throw new Error(authOptionsRes.message || "無法取得 WebAuthn 驗證挑戰");
			}

			const effectiveApproveRequestId = authOptionsRes.requestId || submitRequestId;

			const assertion = await startAuthentication({
				optionsJSON: authOptionsRes.options,
			});

			const data = await approvePeerAuth(effectiveApproveRequestId, otpValue, deviceId, assertion);

			if (data.status === 409) {
				setStep("conflict");
				setMessage(data.message || "此請求已由其他管理員處理");
				return;
			}

			if (data.status === 423) {
				setStep("locked");
				setMessage(data.message || "驗證失敗次數過多，此請求已鎖定");
				return;
			}

			if (!data.success) {
				setStep("error");
				setMessage(data.message || "核准失敗");
				return;
			}

			setStep("success");
			setMessage("核准成功！");
			setTimeout(handleClose, 1500);
		} catch (error: unknown) {
			const isUserCancelled =
				error instanceof Error &&
				((error as Error & { name?: string }).name === "NotAllowedError" ||
					(error as Error & { name?: string }).name === "AbortError");

			if (isUserCancelled) {
				setStep("input");
				setMessage("已取消驗證，未送出核准");
				return;
			}

			setStep("error");
			setMessage(getErrorMessage(error, "驗證流程失敗，請稍後再試"));
		}
	}, [deviceId, effectiveRequestId, enableAdminMode, handleClose, otpValue]);

	const formatTime = (iso: string) => {
		const d = new Date(iso);
		return `${d.getHours().toString().padStart(2, "0")}:${d
			.getMinutes()
			.toString()
			.padStart(2, "0")}`;
	};

	return (
		<Drawer
			open={open}
			onOpenChange={(value) => {
				if (!value) handleClose();
			}}
		>
			<DrawerContent className="max-w-[450px] mx-auto">
				<DrawerHeader className="text-center">
					<DrawerTitle className="font-serif text-lg">
						<ShieldAlert size={20} className="inline mr-2 text-amber-500" />
						授權核准
					</DrawerTitle>
					<DrawerDescription className="text-xs font-light">
						{step === "fetch-pending" || step === "select-pending"
							? "正在查詢待核准授權請求"
							: "請輸入對方螢幕上的 6 位數挑戰碼"}
					</DrawerDescription>
				</DrawerHeader>

				<div className="px-6 py-6 flex flex-col items-center min-h-[180px]">
					<AnimatePresence mode="wait">
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
											<p className="text-sm font-medium text-foreground truncate">{req.requester_name}</p>
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

						{step === "input" && (
							<motion.div
								key="input"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -10 }}
								className="flex flex-col items-center gap-4 w-full"
							>
								{selectedRequestId && !authRequestId && pendingRequests.length > 0 && (
									<p className="text-xs text-muted-foreground font-light">
										核准對象：
										<span className="text-foreground font-medium ml-1">
											{pendingRequests.find((r) => r.id === selectedRequestId)?.requester_name}
										</span>
									</p>
								)}

								<InputOTP maxLength={6} value={otpValue} onChange={setOtpValue}>
									<InputOTPGroup>
										<InputOTPSlot index={0} className="w-12 h-14 text-2xl font-bold" />
										<InputOTPSlot index={1} className="w-12 h-14 text-2xl font-bold" />
										<InputOTPSlot index={2} className="w-12 h-14 text-2xl font-bold" />
									</InputOTPGroup>
									<InputOTPGroup>
										<InputOTPSlot index={3} className="w-12 h-14 text-2xl font-bold" />
										<InputOTPSlot index={4} className="w-12 h-14 text-2xl font-bold" />
										<InputOTPSlot index={5} className="w-12 h-14 text-2xl font-bold" />
									</InputOTPGroup>
								</InputOTP>

								<p className="text-[11px] text-muted-foreground/60 font-light text-center">
									送出時會要求 WebAuthn 裝置驗證（指紋/臉部/裝置解鎖）
								</p>

								{message && (
									<p className="text-xs text-green-600 text-center whitespace-pre-line">{message}</p>
								)}

								<div className="w-full max-w-[320px] flex gap-2">
									<Button
										variant="outline"
										className="flex-1 rounded-sm"
										onClick={handleRegisterWebAuthn}
										disabled={isWebAuthnBound}
									>
										<Link size={14} className="mr-1.5" />
										{isWebAuthnBound ? "已綁定" : "綁定裝置"}
									</Button>
									<Button
										className="flex-1 rounded-sm"
										onClick={handleSubmit}
										disabled={otpValue.length !== 6}
									>
										<Fingerprint size={14} className="mr-1.5" />
										驗證並核准
									</Button>
								</div>
							</motion.div>
						)}

						{step === "registering" && (
							<motion.div
								key="registering"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								className="flex flex-col items-center gap-3"
							>
								<Loader2 size={32} className="animate-spin text-muted-foreground" />
								<p className="text-sm text-muted-foreground font-light">正在綁定 WebAuthn 裝置...</p>
							</motion.div>
						)}

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

						{step === "locked" && (
							<motion.div
								key="locked"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0 }}
								className="flex flex-col items-center gap-3"
							>
								<ShieldAlert size={40} className="text-red-500" />
								<p className="text-sm text-red-500 text-center font-medium">{message}</p>
								<p className="text-[11px] text-muted-foreground/50 font-light text-center">
									請請求端重新發起授權
								</p>
							</motion.div>
						)}

						{step === "error" && (
							<motion.div
								key="error"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0 }}
								className="flex flex-col items-center gap-3"
							>
								<AlertCircle size={40} className="text-red-400" />
								<p className="text-sm text-red-500 text-center whitespace-pre-line">{message}</p>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										setStep("input");
										setOtpValue("");
									}}
									className="rounded-sm mt-1"
								>
									重新嘗試
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
