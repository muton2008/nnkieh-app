import type { Metadata } from "next";
import { PrivacyPage } from "@/components/privacy-page";

export const metadata: Metadata = {
  title: "隱私權政策 | 南科實中校園助手",
};

export default function PrivacyPolicyPage() {
  return <PrivacyPage />;
}
