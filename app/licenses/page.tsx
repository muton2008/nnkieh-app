import type { Metadata } from "next";
import { LicensesPage } from "@/components/licenses-page";

export const metadata: Metadata = {
  title: "開源授權 | 南科實中校園助手",
};

export default function LicensesRoutePage() {
  return <LicensesPage />;
}
