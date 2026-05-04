import { registerPlugin } from "@capacitor/core";
import { isNative, isPluginAvailable } from "./platform";
import type { AnnouncementCategory } from "./types/announcement";
import { CATEGORY_TOPIC_KEYS } from "./types/announcement";
import type { SchoolDivision, UserProfile } from "./types/user";

interface FcmTopicPlugin {
  subscribe(options: { topics: string[] }): Promise<{ success: boolean; failed?: string[] }>;
  unsubscribe(options: { topics: string[] }): Promise<{ success: boolean; failed?: string[] }>;
}

const FcmTopic = registerPlugin<FcmTopicPlugin>("FcmTopic");
const LOCAL_KEY = "fcm_topic_subscriptions";

const IMPORTANT_TOPICS = {
  junior: "news_important_junior",
  high: "news_important_high",
  all: "news_important_all",
} as const;

const ALL_CATEGORY_TOPICS = Object.values(CATEGORY_TOPIC_KEYS);

export function supportsTopicSubscriptions(): boolean {
  return isNative() && isPluginAvailable("FcmTopic");
}

function readStoredTopics(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function writeStoredTopics(topics: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(topics));
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items));
}

function buildImportantTopics(division: SchoolDivision, notifyAll: boolean): string[] {
  if (notifyAll) {
    return [IMPORTANT_TOPICS.junior, IMPORTANT_TOPICS.high, IMPORTANT_TOPICS.all];
  }
  if (division === "junior") return [IMPORTANT_TOPICS.junior, IMPORTANT_TOPICS.all];
  if (division === "high") return [IMPORTANT_TOPICS.high, IMPORTANT_TOPICS.all];
  if (division === "all") {
    return [IMPORTANT_TOPICS.junior, IMPORTANT_TOPICS.high, IMPORTANT_TOPICS.all];
  }
  return [];
}

function buildCategoryTopics(categories: AnnouncementCategory[], notifyAll: boolean): string[] {
  if (notifyAll) return ALL_CATEGORY_TOPICS;
  return categories
    .map((category) => CATEGORY_TOPIC_KEYS[category])
    .filter((topic): topic is string => Boolean(topic));
}

export function buildDesiredTopics(profile: UserProfile): string[] {
  const categories = profile.notify_categories ?? [];
  const important = buildImportantTopics(profile.division, profile.notify_all);
  const categoryTopics = buildCategoryTopics(categories, profile.notify_all);
  return uniq([...important, ...categoryTopics]);
}

export async function syncTopicSubscriptions(
  profile: UserProfile
): Promise<{ success: boolean; failed: string[] }> {
  if (!supportsTopicSubscriptions()) return { success: false, failed: [] };

  const desiredTopics = buildDesiredTopics(profile);
  const storedTopics = readStoredTopics();

  const toSubscribe = desiredTopics.filter((topic) => !storedTopics.includes(topic));
  const toUnsubscribe = storedTopics.filter((topic) => !desiredTopics.includes(topic));

  const failed: string[] = [];

  try {
    if (toSubscribe.length > 0) {
      const result = await FcmTopic.subscribe({ topics: toSubscribe });
      failed.push(...(result.failed ?? []));
    }
    if (toUnsubscribe.length > 0) {
      const result = await FcmTopic.unsubscribe({ topics: toUnsubscribe });
      failed.push(...(result.failed ?? []));
    }

    if (failed.length === 0) {
      writeStoredTopics(desiredTopics);
    }

    return { success: failed.length === 0, failed };
  } catch (error) {
    console.error("[fcm-topics] sync failed:", error);
    return { success: false, failed };
  }
}
