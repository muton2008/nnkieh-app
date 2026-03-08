import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "開源授權 | 南科實中校園助手",
};

const LICENSE_TEXT = `Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

Copyright 2025–2026 muton2008/南科實中學生會

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`;

interface Dep {
  name: string;
  license: string;
  url: string;
}

const DEPENDENCIES: Dep[] = [
  { name: "Next.js", license: "MIT", url: "https://github.com/vercel/next.js" },
  { name: "React", license: "MIT", url: "https://github.com/facebook/react" },
  { name: "Capacitor", license: "MIT", url: "https://github.com/ionic-team/capacitor" },
  { name: "Supabase JS", license: "MIT", url: "https://github.com/supabase/supabase-js" },
  { name: "Firebase JS SDK", license: "Apache-2.0", url: "https://github.com/firebase/firebase-js-sdk" },
  { name: "Firebase Admin SDK", license: "Apache-2.0", url: "https://github.com/firebase/firebase-admin-node" },
  { name: "Tailwind CSS", license: "MIT", url: "https://github.com/tailwindlabs/tailwindcss" },
  { name: "Radix UI", license: "MIT", url: "https://github.com/radix-ui/primitives" },
  { name: "Shadcn UI", license: "MIT", url: "https://github.com/shadcn-ui/ui" },
  { name: "Framer Motion", license: "MIT", url: "https://github.com/framer/motion" },
  { name: "Lucide Icons", license: "ISC", url: "https://github.com/lucide-icons/lucide" },
  { name: "Day.js", license: "MIT", url: "https://github.com/iamkun/dayjs" },
  { name: "date-fns", license: "MIT", url: "https://github.com/date-fns/date-fns" },
  { name: "Recharts", license: "MIT", url: "https://github.com/recharts/recharts" },
  { name: "Embla Carousel", license: "MIT", url: "https://github.com/davidjerleke/embla-carousel" },
  { name: "React Hook Form", license: "MIT", url: "https://github.com/react-hook-form/react-hook-form" },
  { name: "Zod", license: "MIT", url: "https://github.com/colinhacks/zod" },
  { name: "jsonwebtoken", license: "MIT", url: "https://github.com/auth0/node-jsonwebtoken" },
  { name: "jose", license: "MIT", url: "https://github.com/panva/jose" },
  { name: "cmdk", license: "MIT", url: "https://github.com/pacocoursey/cmdk" },
  { name: "Vaul (Drawer)", license: "MIT", url: "https://github.com/emilkowalski/vaul" },
  { name: "Sonner (Toast)", license: "MIT", url: "https://github.com/emilkowalski/sonner" },
  { name: "input-otp", license: "MIT", url: "https://github.com/guilhermerodz/input-otp" },
  { name: "next-themes", license: "MIT", url: "https://github.com/pacocoursey/next-themes" },
  { name: "class-variance-authority", license: "Apache-2.0", url: "https://github.com/joe-bell/cva" },
  { name: "clsx", license: "MIT", url: "https://github.com/lukeed/clsx" },
  { name: "tailwind-merge", license: "MIT", url: "https://github.com/dcastil/tailwind-merge" },
  { name: "Vercel Analytics", license: "MPL-2.0", url: "https://github.com/vercel/analytics" },
  { name: "TypeScript", license: "Apache-2.0", url: "https://github.com/microsoft/TypeScript" },
  { name: "ESLint", license: "MIT", url: "https://github.com/eslint/eslint" },
  { name: "PostCSS", license: "MIT", url: "https://github.com/postcss/postcss" },
];

export default function LicensesPage() {
  return (
    <main className="px-5 py-8 max-w-prose mx-auto text-sm text-foreground leading-relaxed">
      <h1 className="font-serif text-xl font-semibold mb-6">開源授權</h1>

      {/* 本專案 MIT 授權 */}
      <section className="mb-8">
        <h2 className="font-semibold text-base mb-3">本專案授權</h2>
        <pre className="text-xs text-muted-foreground bg-muted/50 rounded-sm p-4 overflow-x-auto whitespace-pre-wrap">
          {LICENSE_TEXT}
        </pre>
      </section>

      {/* 第三方依賴 */}
      <section>
        <h2 className="font-semibold text-base mb-3">第三方開源軟體</h2>
        <p className="text-muted-foreground text-xs mb-4">
          本應用程式使用了以下開源軟體，在此感謝所有貢獻者。
        </p>
        <div className="border border-border rounded-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">套件名稱</th>
                <th className="text-left px-3 py-2 font-medium">授權</th>
              </tr>
            </thead>
            <tbody>
              {DEPENDENCIES.map((dep) => (
                <tr key={dep.name} className="border-t border-border">
                  <td className="px-3 py-2">
                    <a
                      href={dep.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-muted-foreground/30 hover:decoration-foreground transition-colors"
                    >
                      {dep.name}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{dep.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
