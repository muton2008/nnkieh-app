"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CHANGELOG, hasNewVersion, markVersionSeen } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/version";

export function UpdateDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasNewVersion()) {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    markVersionSeen();
    setOpen(false);
  };

  const currentEntry = CHANGELOG.find((e) => e.version === APP_VERSION) ?? CHANGELOG[0];

  if (!currentEntry) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-[340px] rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-base">版本更新</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            v{currentEntry.version}
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc list-inside space-y-1 text-sm text-foreground/80 font-light pl-0.5">
          {currentEntry.changes.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
        <Button onClick={handleClose} className="w-full rounded-sm mt-1" size="sm">
          知道了
        </Button>
      </DialogContent>
    </Dialog>
  );
}
