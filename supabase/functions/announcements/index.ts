import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { GoogleAuth } from "npm:google-auth-library";

// ==================== Types ====================

interface Announcement {
  title: string;
  url: string;
  author: string;
  published: string;
  category: string[];
  description: string;
  post_id: string | null;
}

interface ClassificationResponse {
  category_id: number;
  importance: number;
  reason: string;
}

interface DatabaseAnnouncement {
  title: string;
  content: string;
  category: number;
  importance: number;
  reason: string;
  publish_date: string;
  link: string;
  post_id: string | null;
  division: string[];
}

type SchoolDivision = "no disturb" | "junior" | "high" | "all";

interface UserProfile {
  device_id: string;
  division: SchoolDivision;
  notify_all: boolean;
  fcm_token?: string;
  updated_at?: string;
}

// ==================== Fetcher Module ====================

function parseUrlParams(url: string): Record<string, string> {
  try {
    const urlObj = new URL(url);
    const params: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  } catch {
    return {};
  }
}

async function getFullContent(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return "";
    }

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    if (!doc) {
      return "";
    }

    const contentDiv = doc.querySelector(
      'div[class*="entry-content"][itemprop="text"]'
    );

    if (!contentDiv) {
      return "";
    }

    // 1. 處理附件 (wp-block-file)
    const attachments: string[] = [];
    const fileBlocks = contentDiv.querySelectorAll("div.wp-block-file");

    fileBlocks?.forEach((block: Element) => {
      const linkTag = block.querySelector("a");
      if (linkTag) {
        const fileName = linkTag.textContent?.trim();
        const fileUrl = linkTag.getAttribute("href");
        if (fileName && fileUrl) {
          attachments.push(
            `【附件檔案】：${fileName} (下載位址: ${fileUrl})`
          );
        }
      }
    });

    // 2. 移除不需要的元素
    contentDiv.querySelectorAll("div.post-views")?.forEach((elem: Element) => {
      elem.remove?.();
    });

    // 3. 取得文字內容
    const mainText = contentDiv.textContent?.trim() || "";

    // 4. 組合文字與附件資訊
    if (attachments.length > 0) {
      return (mainText + "\n\n" + attachments.join("\n")).trim();
    }

    return mainText;
  } catch (e) {
    console.error(`爬取失敗: ${e}`);
    return "";
  }
}

async function fetcherFn(): Promise<Announcement[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("https://www.nnkieh.tn.edu.tw/feed/", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS: ${response.statusText}`);
    }

    const xml = await response.text();
    const announcements: Announcement[] = [];

    // 使用正則表達式解析 RSS XML（因為 DOMParser 不支援 text/xml）
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
    const items = xml.match(itemRegex);

    if (!items) {
      return announcements;
    }

    for (const itemXml of items) {
      // 提取各個欄位（支援 CDATA 和純文字格式）
      const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
      const title = titleMatch ? titleMatch[1].trim() : "";

      const guidMatch = itemXml.match(/<guid[^>]*>(.*?)<\/guid>/);
      const guid = guidMatch ? guidMatch[1].trim() : "";

      const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
      const link = linkMatch ? linkMatch[1].trim() : "";

      const url = guid || link;

      const creatorMatch = itemXml.match(/<dc:creator>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/dc:creator>/);
      const author = creatorMatch ? creatorMatch[1].trim() : "unknown";

      const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";

      // 提取分類
      const categories: string[] = [];
      const categoryRegex = /<category>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/category>/g;
      let catMatch;
      while ((catMatch = categoryRegex.exec(itemXml)) !== null) {
        const catText = catMatch[1].trim();
        if (catText === "國中部" || catText === "高中部") {
          categories.push(catText);
        }
      }

      const params = parseUrlParams(url);
      const postId = params["p"] || null;

      const realUrl =
        postId && title
          ? `https://www.nnkieh.tn.edu.tw/news/${encodeURIComponent(title)}/${postId}`
          : url;

      const descriptionMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
      const rssDescription = descriptionMatch ? descriptionMatch[1].trim() : "";

      const description = (await getFullContent(realUrl)) || rssDescription;

      announcements.push({
        title,
        url,
        author,
        published: pubDate,
        category: categories,
        description,
        post_id: postId,
      });
    }

    return announcements;
  } catch (e) {
    console.error(`Fetcher error: ${e}`);
    return [];
  }
}

// ==================== Classification Module ====================

const MODEL_ID = "gemini-3-flash-preview";

const systemPrompt = `# 角色
你是一位「國立南科國際實驗高級中學（NNKIEH）」的校務資訊專家。你對學校的處室運作、四大部別（國小、國中、高中、雙語）、以及校園特有的學術與競賽文化有深厚了解。

# 核心判定準則（校屬性檢查）
- **行政與校務 (ID 3)** 的判定必須極度嚴格：僅限公告主體為「南科實中」、「NNKIEH」或足以辨識為本校內部事務（如：本校校慶、停水、學費、本校校規、南科實中處室公告）。
- **外部轉發**：若公告來自教育局、國教署或其他機關（如：環保局、警察局），且內容僅為一般知識周知，請統一歸類為 **5 (一般宣導與提醒)**。
- **地區限制**：分類公告時請確保地區覆蓋到台南市，如台南市、全國、全球，或是該地區舉辦的活動可讓台南市、我校參加。

# 分類 ID 與南科實中背景定義

0. **考試與考程 (Academic Exams)**
   - 範疇：校內正式測驗、大型入學考試、語文檢定。
   - 南科特點：段考、模擬考、學測、分科測驗、托福(TOEFL)、雅思(IELTS)、國中會考、聽力測驗、補考考程。

1. **學習發展與歷程 (Learning & Portfolio)**
   - 範疇：個人學習紀錄、課程選擇、校內長期性社團與校隊培訓。
   - 南科特點：選課系統、加退選、自主學習計畫、學習歷程檔案(E-Portfolio)、收訖明細、課程代碼、FRC機器人隊、FTC、管樂團、合唱團、網球隊、田徑隊之固定訓練。

2. **活動與競賽 (Activities & Competitions)**
   - 範疇：動態參與、短期比賽、對外榮譽、講座。**若師生皆可參加，優先選此。**
   - 南科特點：成果發表(成發)、音樂祭、冬夏令營、科普活動、各類學科競賽（學科能力競賽、數理競賽）、代表學校參賽、甄選公告、大師講座、校內舉辦的課程如高中部物理培訓營、英語課程等、大學舉辦的先修課程。

3. **行政與校務 (Administration & Campus Life)**
   - 範疇：**僅限本校**行政流程、後勤、校慶、運動會、學生權利義務。
   - 南科特點：處室（教務處、學務處、總務處、輔導室、圖書館）之內部通知、校慶志工、校歌比賽、公假申請、學雜費繳費、獎助學金、宿舍申請、校車路線、停電通知、校內疫苗施打等、學生會、畢聯會、本校國中、國小抽籤名額名單等、本校各部別（小一、國一、高一）招生簡章。

4. **升學與招生 (Admission & Recruitment)**
   - 範疇：所有關於「下一階段學校」的選擇與報名。
   - 會考志願、繁星推薦、個人申請、特殊選才、大學博覽會、選系說明會、各大學招生說明。

5. **一般宣導與提醒 (General Notices & Health)**
   - 範疇：生活習慣、安全衛生、非本校之公部門周知文件。
   - 南科特點：防疫通知（疫苗、傳染病）、午餐菜單、交通安全、防震演練、心理輔導資源、外部機關（如教育部、台南市政府）之一般性轉發公文、本校學生獲得的榮譽。

6. **教師研習 (Faculty Professional Development)**
   - 範疇：對象僅限教職員之活動。**若涉及學生參與，優先選 2。**
   - 南科特點：教師社群、領域會議、教學工作坊、教師代課通知、教職員工文康活動。

# 重要性判定準則 (importance)
請將公告分為 **1 (重要)** 或 **0 (一般)**。

### 判定為 1 (重要) 的基準：
- **關鍵字驅動**：標題或內容包含「住宿申請」、「學科能力競賽」、「奧林匹亞」、「段考考程」、「模擬考考程」、「報名截止日期」、「全中運」、「APX」、「旺宏科學獎」。
- **影響範圍**：與全校或整個部別（如高中部全體）學生之「受教權」、「升學權益」、「校園生活重大變更」直接相關的公告。
- **時效性**：具有明確截止日期且錯過將導致嚴重後果的事務（如繁星推薦、個人申請、學雜費減免申請）。
- **地區性**：涉及全國性活動，或我校師生具有參與資格且不可錯過的公告。
- **特殊判定**：全國比賽、足以寫入學習歷程等活動，需為教育部或其他可信機關舉辦，若為不可信機構、少數學校舉辦且沒有教育部、政府機關等可信機構協辦、贊助，則不予判定為重要。

### 判定為 0 (一般) 的基準：
- **周知性質**：外部公文轉發、一般宣導（如交通安全、防疫衛教）、例行性午餐菜單、非本校舉辦的自由參加活動、教師研習。
- **特定少數**：僅針對極少數特定社團或個人(僅含原住民、新住民)的通知、特定學校之校系說明、招生及本校學生獲得的榮譽。

# 輸出規則
- 只回傳 JSON：\`{"category_id": 數字, "importance": 0或1, "reason": "簡短理由"}\`
- 理由請簡述為何歸類於該 ID 以及為何判定為重要/一般。

# 待分類公告
標題：{title}
描述：{description}`;

async function geminiClassify(
  title: string,
  description: string = "",
  apiKey: string
): Promise<ClassificationResponse> {
  if (!title || title.trim() === "") {
    return {
      category_id: -1,
      importance: -1,
      reason: "標題為空，無法分類",
    };
  }

  const truncatedDescription = description.substring(0, 1000);
  const prompt = systemPrompt
    .replace("{title}", title)
    .replace("{description}", truncatedDescription);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                category_id: {
                  type: "integer",
                },
                importance: {
                  type: "integer",
                },
                reason: {
                  type: "string",
                },
              },
              required: ["category_id", "importance", "reason"],
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${error}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error("No content in response");
    }

    const result = JSON.parse(content);
    return {
      category_id: result.category_id,
      importance: result.importance,
      reason: result.reason,
    };
  } catch (e) {
    console.error(`Classification error: ${e}`);
    throw e;
  }
}

// ==================== Notification Module ====================

/**
 * 判斷用戶的部別是否與公告的部別匹配
 */
function divisionMatches(
  userDivision: SchoolDivision,
  announcementDivisions: string[]
): boolean {
  if (userDivision === "no disturb") {
    return false;
  }

  if (userDivision === "all") {
    return true;
  }

  // 將用戶的部別對應到公告的部別
  const divisionMap: Record<SchoolDivision, string> = {
    "no disturb": "",
    junior: "國中部",
    high: "高中部",
    all: "",
  };

  const userDivisionStr = divisionMap[userDivision];
  return announcementDivisions.includes(userDivisionStr);
}

/**
 * 判斷用戶是否應該接收該公告的通知
 */
function shouldUserReceiveNotification(
  user: UserProfile,
  importance: number,
  announcementDivisions: string[]
): boolean {
  if (importance === -1) {
    return false;
  }
  // 用戶選擇不打擾
  if (user.division === "no disturb") {
    return false;
  }

  // 沒有 FCM token 無法發送
  if (!user.fcm_token) {
    return false;
  }

  if (user.notify_all) {
    return true;
  }

  // 檢查部別是否匹配
  if ( importance === 1) {
    return divisionMatches(user.division, announcementDivisions);
  }
  return false;
}

/**
 * 通過 FCM 發送推播通知
 */
async function sendFCMBroadcast(
  title: string,
  link: string,
  description: string,
  _firebaseApiKey: string, // 不再使用
  fcmTokens: string[],
  postId: string | null = null
): Promise<void> {
  if (!fcmTokens.length) {
    console.warn("⚠️ 無 FCM token，無法發送 FCM 訊息");
    return;
  }

  // 1. 取得 service account 並初始化 GoogleAuth
  const serviceAccountStr = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!serviceAccountStr) {
    console.warn("⚠️ 缺少 FIREBASE_SERVICE_ACCOUNT，無法發送 FCM");
    return;
  }
  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(serviceAccountStr);
  } catch (e) {
    console.error("FIREBASE_SERVICE_ACCOUNT 解析失敗", e);
    return;
  }

  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  let accessToken = "";
  try {
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    accessToken = tokenResponse.token || tokenResponse;
  } catch (e) {
    console.error("取得 FCM access token 失敗", e);
    return;
  }

  const shortDescription =
    description.length > 150
      ? description.substring(0, 150) + "..."
      : description;

  const projectId = serviceAccount.project_id;
  for (const token of fcmTokens) {
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token: token,
              notification: {
                title: title,
                body: shortDescription,
              },
              data: {
                title: title,
                type: "announcement",
                announcement_id: postId ? String(postId) : "",
                post_id: postId ? String(postId) : "",
                link: postId ? `/?type=announcement&announcement_id=${postId}` : `/?tab=news`,
                original_link: link,
              },
              // 網頁推播：點擊後開啟連結
              webpush: {
                fcm_options: {
                  link: postId ? `/?type=announcement&announcement_id=${postId}` : `/?tab=news`,
                },
              },
              // Android：點擊後開啟連結
              android: {
                notification: {
                  click_action: "OPEN_URL",
                },
              },
              // iOS/APNs
              apns: {
                payload: {
                  aps: {
                    alert: {
                      title: title,
                      body: shortDescription,
                    },
                  },
                },
                fcm_options: {
                  image: undefined,
                },
              },
            },
          }),
        }
      );

      if (response.ok) {
        console.log(
          `✅ 成功發送 FCM ${title.substring(0, 25)} 至 token: ${token.substring(0, 20)}...`
        );
      } else {
        const errorText = await response.text();
        console.error(
          `❌ FCM 發送失敗 (Token ${token.substring(0, 20)}...): ${errorText}`
        );
      }
    } catch (e) {
      console.error(
        `❌ FCM 連線 Token ${token.substring(0, 20)}... 時發生異常: ${e}`
      );
    }
  }
}

async function sendLineBroadcast(
  title: string,
  link: string,
  description: string,
  token: string,
  targetIds: string[]
): Promise<void> {
  if (!token || targetIds.length === 0) {
    console.warn("⚠️ 缺少配置，無法發送 LINE 訊息");
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const shortDescription =
    description.length > 150
      ? description.substring(0, 150) + "..."
      : description;

  const flexMessageContent = {
    type: "flex",
    altText: `校園公告：${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "School Notification",
            size: "xs",
            color: "#FFFFFFB3",
            weight: "bold",
          },
          {
            type: "text",
            text: "南科實中公告",
            weight: "bold",
            size: "lg",
            color: "#FFFFFF",
          },
        ],
        backgroundColor: "#6B8E23",
        paddingAll: "15px",
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: title,
            weight: "bold",
            size: "md",
            wrap: true,
            color: "#444444",
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: shortDescription,
                size: "sm",
                color: "#777777",
                wrap: true,
                maxLines: 4,
              },
            ],
          },
        ],
        paddingAll: "15px",
        backgroundColor: "#FAFAFA",
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            action: {
              type: "uri",
              label: "查看詳細內容",
              uri: link,
            },
            style: "link",
            height: "sm",
            color: "#6B8E23",
          },
        ],
        paddingAll: "5px",
      },
    },
  };

  for (const targetId of targetIds) {
    const url = "https://api.line.me/v2/bot/message/push";
    const payload = {
      to: targetId,
      messages: [flexMessageContent],
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(
          `✅ 成功發送 ${title.substring(0, 25)} 至 ID: ${targetId}`
        );
      } else {
        const errorText = await response.text();
        console.error(`❌ Flex Message 發送失敗 (${targetId}): ${errorText}`);
      }
    } catch (e) {
      console.error(`❌ Flex Message 連線 ID ${targetId} 時發生異常: ${e}`);
    }
  }
}

// ==================== Main Task ====================

function parsePublishedDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

async function runTask(
  supabase: ReturnType<typeof createClient>,
  geminiKeys: string[],
  lineToken: string,
  lineTargetIds: string[],
  firebaseApiKey: string
): Promise<void> {
  console.log("--- 開始執行定時爬蟲任務 ---");

  // 1. 抓取最新公告
  const fetchedItems = await fetcherFn();
  if (fetchedItems.length === 0) {
    console.log("未抓取到任何公告");
    return;
  }

  console.log(`抓取到 ${fetchedItems.length} 筆公告`);

  // 2. 獲取資料庫中最新一批公告的 post_id
  const { data: existingRows, error: queryError } = await supabase
    .from("announcements")
    .select("post_id")
    .order("publish_date", { ascending: false })
    .limit(50);

  if (queryError) {
    console.error("查詢資料庫失敗:", queryError);
    return;
  }

  const existingIds = new Set(
    (existingRows || []).map((row: { post_id: string | null }) =>
      String(row.post_id)
    )
  );

  // 3. 找出新公告
  const newAnnouncements: Announcement[] = [];
  for (const item of fetchedItems) {
    if (existingIds.has(String(item.post_id))) {
      break;
    }
    newAnnouncements.push(item);
  }

  if (newAnnouncements.length === 0) {
    console.log("沒有發現新公告。");
    return;
  }

  console.log(`發現 ${newAnnouncements.length} 筆新公告！`);

  // 4. 處理新公告
  let currentKeyIdx = 0;
  const RETRY_LIMIT = 5;

  for (const ann of newAnnouncements.reverse()) {
    console.log(`處理公告：${ann.title}, url: ${ann.url}`);

    let classificationResult: ClassificationResponse | null = null;

    // 重試邏輯
    for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
      currentKeyIdx = (currentKeyIdx + 1) % geminiKeys.length;
      try {
        classificationResult = await geminiClassify(
          ann.title,
          ann.description,
          geminiKeys[currentKeyIdx]
        );
        break;
      } catch (e) {
        console.error(
          `分類失敗，嘗試次數 ${attempt + 1}/${RETRY_LIMIT}，錯誤訊息：${e}`
        );

        if (String(e).includes("429")) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }

    if (!classificationResult) {
      classificationResult = {
        category_id: -1,
        importance: -1,
        reason: "分類失敗，超過重試次數",
      };
    }

    // 5. 寫入 Supabase
    const dbAnnouncement: DatabaseAnnouncement = {
      title: ann.title,
      content: ann.description,
      category: classificationResult.category_id,
      importance: classificationResult.importance,
      reason: classificationResult.reason,
      publish_date: parsePublishedDate(ann.published),
      link: ann.url,
      post_id: ann.post_id,
      division: ann.category,
    };

    const { error: insertError } = await supabase
      .from("announcements")
      .insert([dbAnnouncement]);

    if (insertError) {
      console.error(`插入資料庫失敗: ${insertError}`);
    } else {
      console.log(
        `已存入: ${ann.title}，分類結果: ${JSON.stringify(classificationResult)}`
      );

      // 發送 LINE 通知（重要公告）
      if (classificationResult.importance === 1) {
        await sendLineBroadcast(
          ann.title,
          ann.url,
          ann.description,
          lineToken,
          lineTargetIds
        );
      }

      // 發送 FCM 通知給符合條件的用戶
      if (firebaseApiKey) {
        const { data: users, error: usersError } = await supabase
          .from("user_profiles")
          .select("device_id, division, notify_all, fcm_token")
          .not("fcm_token", "is", null);

        if (usersError) {
          console.error(`查詢用戶失敗: ${usersError}`);
        } else if (users && users.length > 0) {
          const eligibleTokens: string[] = [];

          for (const user of users) {
            const userProfile: UserProfile = {
              device_id: user.device_id,
              division: user.division as SchoolDivision,
              notify_all: user.notify_all,
              fcm_token: user.fcm_token,
            };

            if (
              shouldUserReceiveNotification(
                userProfile,
                classificationResult.importance,
                ann.category
              )
            ) {
              eligibleTokens.push(user.fcm_token);
            }
          }

          if (eligibleTokens.length > 0) {
            await sendFCMBroadcast(
              ann.title,
              ann.url,
              ann.description,
              firebaseApiKey,
              eligibleTokens,
              ann.post_id // 傳入 post_id 組合深連結
            );
          } else {
            console.log(`公告 "${ann.title}" 無符合條件的用戶接收`);
          }
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log("所有新公告皆已處理完畢。");
}

// ==================== Supabase Edge Function Entry Point ====================

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const geminiKeysStr = Deno.env.get("GEMINI_KEYS") || "";
    const lineToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
    const lineTargetIdsStr = Deno.env.get("LINE_TARGET_IDS") || "";
    const firebaseApiKey = Deno.env.get("FIREBASE_API_KEY") || "";

    // 驗證必要的環境變數
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "缺少 Supabase 環境變數" }),
        { status: 400 }
      );
    }

    // 解析 Gemini API 金鑰
    const geminiKeys = geminiKeysStr
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (geminiKeys.length === 0) {
      return new Response(
        JSON.stringify({ error: "缺少 GEMINI_KEYS 環境變數" }),
        { status: 400 }
      );
    }

    // 解析 LINE 目標 ID
    const lineTargetIds = lineTargetIdsStr
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    // 創建 Supabase 客戶端
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 執行爬蟲任務
    await runTask(supabase, geminiKeys, lineToken, lineTargetIds, firebaseApiKey);

    return new Response(
      JSON.stringify({ success: true, message: "爬蟲任務執行完成" }),
      { status: 200 }
    );
  } catch (error) {
    console.error("邊緣函數執行錯誤:", error);
    return new Response(
      JSON.stringify({
        error: "邊緣函數執行失敗",
        details: String(error),
      }),
      { status: 500 }
    );
  }
});
