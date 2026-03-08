import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隱私權政策 | 南科實中校園助手",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="px-5 py-8 max-w-prose mx-auto text-sm text-foreground leading-relaxed">
      <h1 className="font-serif text-xl font-semibold mb-6">隱私權政策</h1>
      <p className="text-muted-foreground text-xs mb-6">最後更新日期：2026 年 3 月 8 日</p>

      <section className="space-y-4">
        <p>
          南科實中校園助手（以下簡稱「本應用程式」）由國立南科國際實驗高級中學學生會開發與維護。我們非常重視您的隱私，以下說明本應用程式如何收集、使用與保護您的資料。
        </p>

        <h2 className="font-semibold text-base mt-6">一、資料收集範圍</h2>
        <p>本應用程式可能收集以下資料：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>裝置識別碼（Device ID）</strong>：隨機產生的 UUID，用於識別裝置以提供個人化功能（如課表、班級代碼），不會與您的真實身份連結。</li>
          <li><strong>推播通知 Token（FCM Token）</strong>：用於發送校園公告、授權請求等即時推播通知。您可隨時在裝置設定中關閉推播。</li>
          <li><strong>使用者設定</strong>：包含年級、班級、顯示偏好等，儲存於裝置本機或雲端資料庫，僅用於提供對應功能。</li>
          <li><strong>課表與備註資料</strong>：由使用者自行輸入，儲存於雲端以支援跨裝置同步。</li>
        </ul>

        <h2 className="font-semibold text-base mt-6">二、資料使用目的</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>提供並改善課表、交通、行事曆、公告等核心功能。</li>
          <li>發送推播通知（校園公告、管理員授權請求）。</li>
          <li>行事曆管理員權限驗證（雙人授權機制）。</li>
          <li>匿名使用統計（透過 Vercel Analytics，僅限網頁版）。</li>
        </ul>

        <h2 className="font-semibold text-base mt-6">三、資料儲存與安全</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>雲端資料儲存於 <strong>Supabase</strong>（PostgreSQL），位於受保護的雲端環境中。</li>
          <li>管理員認證使用 <strong>JWT（JSON Web Token）</strong>，Token 具時效性（2 小時），過期後自動失效。</li>
          <li>所有 API 通訊透過 <strong>HTTPS</strong> 加密傳輸。</li>
          <li>敏感資料（如課表備註）不會被分享給第三方。</li>
        </ul>

        <h2 className="font-semibold text-base mt-6">四、第三方服務</h2>
        <p>本應用程式使用以下第三方服務，這些服務有各自的隱私權政策：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><a href="https://firebase.google.com/support/privacy" className="underline" target="_blank" rel="noopener noreferrer">Firebase Cloud Messaging (Google)</a> — 推播通知</li>
          <li><a href="https://supabase.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">Supabase</a> — 資料庫與認證</li>
          <li><a href="https://vercel.com/legal/privacy-policy" className="underline" target="_blank" rel="noopener noreferrer">Vercel</a> — 網站託管與匿名統計</li>
          <li><a href="https://tdx.transportdata.tw/" className="underline" target="_blank" rel="noopener noreferrer">TDX 運輸資料平台</a> — 交通即時資訊</li>
        </ul>

        <h2 className="font-semibold text-base mt-6">五、兒童隱私</h2>
        <p>
          本應用程式面向高中學生使用。我們不會故意收集 13 歲以下兒童的個人資訊。若您發現有未成年兒童透過本應用程式提供了個資，請聯繫我們以便刪除。
        </p>

        <h2 className="font-semibold text-base mt-6">六、您的權利</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>您可隨時刪除本應用程式以移除裝置上的所有本機資料。</li>
          <li>您可關閉推播通知權限以停止接收通知。</li>
          <li>如需刪除雲端資料，請聯繫開發團隊。</li>
        </ul>

        <h2 className="font-semibold text-base mt-6">七、政策變更</h2>
        <p>
          我們可能不定期更新本隱私權政策。變更後將於本頁面公告最新版本。繼續使用本應用程式即表示您同意更新後的政策。
        </p>

        <h2 className="font-semibold text-base mt-6">八、聯絡方式</h2>
        <p>
          如對本隱私權政策有任何疑問，請透過以下方式聯繫：
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>開發團隊：muton2008</li>
          <li>GitHub：<a href="https://github.com/muton2008" className="underline" target="_blank" rel="noopener noreferrer">github.com/muton2008</a></li>
          <li>維護團隊：南科實中學生會</li>
        </ul>
      </section>
    </main>
  );
}
